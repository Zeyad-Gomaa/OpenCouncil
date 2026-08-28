/** The deliberation runner: executes a council session end-to-end. */
import type { MemberDTO, StrategyKind } from '@opencouncil/shared'
import { decryptSecret } from '../vault/crypto.js'
import { getAdapter } from '../providers/registry.js'
import type { ChatMessage } from '../providers/types.js'
import { fitMessages } from './context-budgeter.js'
import { Semaphore, withRetry } from './execution-policy.js'
import { AuthError, ProviderHttpError, RateLimitError, TimeoutError } from '../lib/http.js'
import { buildSynthesisMessages } from './moderator.js'
import { getStrategy } from './strategies.js'
import { formatResearchMarkdown, researchTopic } from './web-search.js'
import { WORKSPACE_TOOL_PROMPT, buildWorkspaceBriefing, parseToolCalls, runTool, stripToolBlocks } from './workspace.js'
import type { SessionBus } from './bus.js'

export interface TranscriptEntry {
  speaker: string
  memberId: string
  round: number
  content: string
}

export interface SessionController {
  signal: AbortSignal
  shouldConcludeEarly(): boolean
  getAdditionalRounds(): number
  extend(additionalRounds: number): number
  conclude(reason?: string): void
  intervene(content: string): void
  consumeInterventions(): string[]
}

export function isSessionController(c: unknown): c is SessionController {
  return typeof c === 'object' && c !== null && 'shouldConcludeEarly' in c && 'signal' in c
}

export interface RunnerDeps {
  bus: SessionBus
  recordUsage(u: {
    sessionId: string
    providerId?: string | null
    memberName: string
    memberId?: string | null
    providerName: string
    modelId?: string | null
    modelName: string
    promptTokens: number
    completionTokens: number
    costUsd: number | null
    latencyMs: number
    retryCount?: number
    errorCode?: string | null
    status: 'ok' | 'error'
  }): number
  insertMessage(m: {
    sessionId: string
    memberId: string | null
    memberName: string
    kind: 'user' | 'discussion' | 'synthesis' | 'system'
    round: number
    roundPosition?: number
    content: string
  }): number
  loadCouncil(councilId: string): {
    id: string
    name: string
    strategy: StrategyKind
    rounds: number
    moderatorMemberId: string | null
    members: MemberDTO[]
  } | null
  loadModelForChat(modelId: string): {
    modelId: string
    stableModelId: string
    providerId: string
    providerName: string
    modelName: string
    contextWindow: number | null
    providerProtocol: 'openai_compatible' | 'anthropic' | 'google' | 'mock'
    providerBaseUrl: string | null
    apiKeyEncrypted: string | null
    inputPerMTokUsd: number | null
    outputPerMTokUsd: number | null
  } | null
  updateSessionStatus(sessionId: string, status: 'running' | 'completed' | 'failed' | 'cancelled', error?: string): void
  loadWorkspace?(sessionId: string): { root: string; files: string[] } | null
}

const CALL_TIMEOUT_MS = 120_000

function computeCost(
  promptTokens: number | null,
  completionTokens: number | null,
  inPrice: number | null,
  outPrice: number | null,
): number | null {
  if (promptTokens == null || completionTokens == null) return null
  if (inPrice == null && outPrice == null) return null
  const inCost = (promptTokens / 1_000_000) * (inPrice ?? 0) || 0
  const outCost = (completionTokens / 1_000_000) * (outPrice ?? 0) || 0
  return Number((inCost + outCost).toFixed(6))
}

/** Web research and mid-session user directives, even when the strategy hides peer transcript. */
export function extraGroundingFromTranscript(transcript: TranscriptEntry[]): TranscriptEntry[] {
  return transcript.filter(
    (e) => e.memberId === 'system_web' || e.memberId === 'user' || e.memberId === 'system_workspace',
  )
}

export function formatTranscriptForMember(
  transcript: TranscriptEntry[],
  currentMemberId: string,
  currentMemberName: string,
): string {
  return transcript
    .map((e) => {
      if (e.memberId === 'user') {
        return `[USER DIRECTIVE in Round ${e.round}]:\n${e.content}`
      }
      if (e.memberId === 'system_web') {
        return `[WEB SEARCH EVIDENCE in Round ${e.round}]:\n${e.content}`
      }
      if (e.memberId === 'system_workspace') {
        return `[WORKSPACE in Round ${e.round}]:\n${e.content}`
      }
      const isSelf = e.memberId === currentMemberId
      if (isSelf) {
        return `[YOU (@${currentMemberName}) in Round ${e.round}]:\n${e.content}`
      }
      return `[@${e.speaker} in Round ${e.round}]:\n${e.content}`
    })
    .join('\n\n---\n\n')
}

export function renderTranscript(
  t: (TranscriptEntry | { speaker: string; content: string; round?: number })[],
): string {
  return t
    .map((e) => {
      const r = 'round' in e && e.round ? ` (Round ${e.round})` : ''
      return `@${e.speaker}${r}:\n${e.content}`
    })
    .join('\n\n')
}

export class SessionRunner {
  private providerLimits = new Map<string, Semaphore>()
  constructor(private deps: RunnerDeps) {}

  async run(
    sessionId: string,
    councilId: string,
    topic: string,
    signalOrController: AbortSignal | SessionController,
  ): Promise<void> {
    const { bus } = this.deps
    const controller = isSessionController(signalOrController) ? signalOrController : null
    const signal = isSessionController(signalOrController) ? signalOrController.signal : signalOrController

    try {
      const council = this.deps.loadCouncil(councilId)
      if (!council) throw new Error('council not found')
      const activeMembers = council.members.filter((m) => m.enabled)
      if (activeMembers.length === 0) throw new Error('council has no enabled members')

      this.deps.updateSessionStatus(sessionId, 'running')
      // Record the user's topic as a message.
      const userMsgId = this.deps.insertMessage({
        sessionId,
        memberId: null,
        memberName: 'You',
        kind: 'user',
        round: 0,
        content: topic,
      })
      bus.publish({
        type: 'session.started',
        sessionId,
      })
      bus.publish({
        type: 'message.created',
        sessionId,
        message: {
          id: String(userMsgId),
          sessionId,
          memberId: null,
          memberName: 'You',
          role: 'user',
          kind: 'user',
          round: 0,
          content: topic,
          createdAt: new Date().toISOString(),
        },
      })

      const strategy = getStrategy(council.strategy)
      const transcript: TranscriptEntry[] = []

      // 1. Automatic live web research grounding (pages, images, videos)
      try {
        const pack = await researchTopic(topic, 7000)
        const md = formatResearchMarkdown(pack)
        if (md) {
          transcript.push({
            speaker: 'Web Research',
            memberId: 'system_web',
            round: 0,
            content: md,
          })
          const searchMsgId = this.deps.insertMessage({
            sessionId,
            memberId: null,
            memberName: 'Web Search',
            kind: 'system',
            round: 0,
            roundPosition: 1,
            content: md,
          })
          bus.publish({
            type: 'message.created',
            sessionId,
            message: {
              id: String(searchMsgId),
              sessionId,
              memberId: null,
              memberName: 'Web Search',
              role: 'assistant',
              kind: 'system',
              round: 0,
              content: md,
              createdAt: new Date().toISOString(),
            },
          })
        } else {
          const emptyId = this.deps.insertMessage({
            sessionId,
            memberId: null,
            memberName: 'Web Search',
            kind: 'system',
            round: 0,
            roundPosition: 1,
            content: 'No live web sources were found for this question. The council will reason from model knowledge.',
          })
          bus.publish({
            type: 'message.created',
            sessionId,
            message: {
              id: String(emptyId),
              sessionId,
              memberId: null,
              memberName: 'Web Search',
              role: 'assistant',
              kind: 'system',
              round: 0,
              content:
                'No live web sources were found for this question. The council will reason from model knowledge.',
              createdAt: new Date().toISOString(),
            },
          })
        }
      } catch {
        /* search is non-blocking */
      }

      const workspace = this.deps.loadWorkspace?.(sessionId) ?? null
      if (workspace?.root) {
        try {
          const brief = buildWorkspaceBriefing(workspace)
          transcript.push({
            speaker: 'Workspace',
            memberId: 'system_workspace',
            round: 0,
            content: brief,
          })
          const wsId = this.deps.insertMessage({
            sessionId,
            memberId: null,
            memberName: 'Workspace',
            kind: 'system',
            round: 0,
            roundPosition: 2,
            content: `**Attached workspace** \`${workspace.root}\`\n\nAgents can list, read, and search these files.\n\n\`\`\`\n${brief.slice(0, 6000)}\n\`\`\``,
          })
          bus.publish({
            type: 'message.created',
            sessionId,
            message: {
              id: String(wsId),
              sessionId,
              memberId: null,
              memberName: 'Workspace',
              role: 'assistant',
              kind: 'system',
              round: 0,
              content: `**Attached workspace** \`${workspace.root}\`\n\nAgents can list, read, and search these files.`,
              createdAt: new Date().toISOString(),
            },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          this.deps.insertMessage({
            sessionId,
            memberId: null,
            memberName: 'Workspace',
            kind: 'system',
            round: 0,
            content: `Workspace could not be attached: ${msg}`,
          })
        }
      }

      let roundNum = 0
      let totalPlannedRounds = council.rounds

      while (roundNum < totalPlannedRounds) {
        roundNum++
        if (signal.aborted) throw new Error('cancelled')
        if (controller && controller.shouldConcludeEarly()) {
          bus.publish({ type: 'session.concluding', sessionId, reason: 'concluded early' })
          break
        }

        // Process any mid-deliberation user interruptions
        if (controller) {
          const interventions = controller.consumeInterventions()
          for (const text of interventions) {
            transcript.push({
              speaker: 'User Directive',
              memberId: 'user',
              round: roundNum,
              content: text,
            })
          }
        }

        bus.publish({ type: 'round.started', sessionId, round: roundNum })
        const memberIds = activeMembers.map((m) => m.id)

        if (!strategy.parallel) {
          // Sequential (debate): later speakers in the same round can rebut earlier ones
          for (let i = 0; i < memberIds.length; i++) {
            const memberId = memberIds[i]!
            const member = activeMembers.find((m) => m.id === memberId)
            if (!member) continue
            if (signal.aborted) throw new Error('cancelled')
            if (controller && controller.shouldConcludeEarly()) break

            // Check for user interventions between turns
            if (controller) {
              const liveInterventions = controller.consumeInterventions()
              for (const text of liveInterventions) {
                transcript.push({
                  speaker: 'User Directive',
                  memberId: 'user',
                  round: roundNum,
                  content: text,
                })
              }
            }

            await this.callMember(
              sessionId,
              member,
              topic,
              transcript,
              roundNum,
              i,
              strategy.includeTranscript(roundNum) || transcript.length > 0,
              signal,
              false,
              strategy.promptAddon,
              workspace?.root,
            )
          }
        } else {
          // Parallel (round robin / swarm / critique): members speak concurrently
          await Promise.all(
            memberIds.map(async (memberId, i) => {
              const member = activeMembers.find((m) => m.id === memberId)
              if (!member) return
              await this.callMember(
                sessionId,
                member,
                topic,
                transcript,
                roundNum,
                i,
                strategy.includeTranscript(roundNum),
                signal,
                false,
                strategy.promptAddon,
                workspace?.root,
              )
            }),
          )
        }

        bus.publish({ type: 'round.completed', sessionId, round: roundNum })

        // Check if additional rounds were dynamically requested
        if (controller) {
          totalPlannedRounds = council.rounds + controller.getAdditionalRounds()
        }
      }

      // Moderator synthesis (optional).
      const moderator = council.moderatorMemberId
        ? activeMembers.find((m) => m.id === council.moderatorMemberId)
        : undefined
      if (moderator && transcript.length > 0) {
        if (signal.aborted) throw new Error('cancelled')
        bus.publish({ type: 'moderator.started', sessionId })
        await this.callMember(sessionId, moderator, topic, transcript, roundNum + 1, 0, true, signal, true)
      }

      bus.publish({ type: 'session.completed', sessionId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (signal.aborted || msg === 'cancelled') {
        this.deps.updateSessionStatus(sessionId, 'cancelled')
        bus.publish({ type: 'session.cancelled', sessionId })
        throw new SessionCancelled()
      }
      this.deps.updateSessionStatus(sessionId, 'failed', msg)
      bus.publish({ type: 'session.failed', sessionId, error: msg })
      throw err
    }

    this.deps.updateSessionStatus(sessionId, 'completed')
  }

  private async callMember(
    sessionId: string,
    member: MemberDTO,
    topic: string,
    transcript: TranscriptEntry[],
    round: number,
    roundPosition: number,
    includeTranscript: boolean,
    signal: AbortSignal,
    isSynthesis = false,
    promptAddon?: string,
    workspaceRoot?: string,
  ): Promise<void> {
    const { bus } = this.deps
    bus.publish({
      type: 'member.started',
      sessionId,
      round,
      memberId: member.id,
      memberName: member.name,
    })

    const model = this.deps.loadModelForChat(member.modelId)
    if (!model) {
      bus.publish({
        type: 'member.failed',
        sessionId,
        round,
        memberId: member.id,
        memberName: member.name,
        error: 'model is missing or disabled',
      })
      return
    }

    const messages: ChatMessage[] = []
    if (isSynthesis) {
      messages.push(...buildSynthesisMessages(topic, renderTranscript(transcript)))
    } else {
      const systemPromptParts: string[] = []

      systemPromptParts.push(
        `You are @${member.name}, an expert participant in this AI council roundtable debate.\n` +
          `DELIBERATION TOPIC:\n"${topic}"\n\n` +
          (member.systemPrompt ? `YOUR ASSIGNED PERSONA & PERSPECTIVE:\n${member.systemPrompt}\n\n` : '') +
          `CRITICAL IDENTITY & CHATROOM RULES:\n` +
          `1. YOU ARE @${member.name}. NEVER refer to yourself in the third person. Do NOT say "I agree with @${member.name}" or "@${member.name} made a point".\n` +
          `2. Any past statement labeled "[YOU (@${member.name})]" in the transcript was stated by YOU in earlier rounds. Build upon your own prior reasoning.\n` +
          `3. Statements from other members are labeled with [@MemberName]. Tag and reference your peers directly by their handle (e.g. "@Visionary", "@Skeptic", "As @Strategist pointed out...").\n` +
          `4. USER DIRECTIVES: If the transcript contains "[USER DIRECTIVE]", the human user has stepped in to guide or clarify the topic. Prioritize addressing the user's directive.\n` +
          `5. WEB EVIDENCE & CITATIONS: Cite live links from the research briefing as [Title](url). When an image URL is provided, embed it with ![caption](url). Include video links when they help.\n` +
          `6. DIAGRAMS: Prefer a simple \`\`\`mermaid flowchart TD\`\`\` when a picture helps. Node IDs must be alphanumeric (no spaces) — put labels in brackets: Foo[Label with spaces]. Never use the reserved word "end" as a node id. Use <br/> not <br>. Skip a diagram if the syntax would be unclear.\n` +
          `7. CHATROOM DEBATE DYNAMICS: Treat this as an engaging, high-signal, fast-flowing intellectual debate. Critique flawed assumptions, concede solid points, offer concrete examples/solutions, and work through disagreements towards clarity and synthesis.` +
          (promptAddon ? `\n\n${promptAddon}` : '') +
          (workspaceRoot ? `\n\n${WORKSPACE_TOOL_PROMPT}` : ''),
      )

      messages.push({ role: 'system', content: systemPromptParts.join('\n') })

      if (includeTranscript && transcript.length > 0) {
        messages.push({
          role: 'system',
          content:
            `=== COUNCIL DEBATE TRANSCRIPT SO FAR ===\n\n` +
            formatTranscriptForMember(transcript, member.id, member.name) +
            `\n\n=== END OF TRANSCRIPT ===\n\nNow respond for Round ${round}. Speak directly to your council peers and advance the deliberation.`,
        })
      } else {
        const grounding = extraGroundingFromTranscript(transcript)
        if (grounding.length > 0) {
          messages.push({
            role: 'system',
            content:
              `=== GROUNDING (web research and user directives) ===\n\n` +
              formatTranscriptForMember(grounding, member.id, member.name) +
              `\n\n=== END OF GROUNDING ===`,
          })
        }
      }

      messages.push({ role: 'user', content: topic })
    }

    const budget = {
      contextWindow: model.contextWindow,
      responseTokens: member.maxTokens ?? 1024,
      safetyMargin: 128,
    }
    const adapter = getAdapter(model.providerProtocol)
    const started = Date.now()
    try {
      const semaphore = this.providerLimits.get(model.providerId) ?? new Semaphore(2)
      this.providerLimits.set(model.providerId, semaphore)
      const chatBase = {
        baseUrl: model.providerBaseUrl ?? adapter.defaultBaseUrl ?? '',
        apiKey: model.apiKeyEncrypted ? decryptSecret(model.apiKeyEncrypted) : undefined,
        modelId: model.modelId,
        temperature: member.temperature,
        maxTokens: member.maxTokens ?? undefined,
        timeoutMs: CALL_TIMEOUT_MS,
        signal,
      }
      let promptTokens = 0
      let completionTokens = 0
      let retryCount = 0
      let text = ''
      const working = [...messages]
      const maxHops = workspaceRoot && !isSynthesis ? 4 : 0
      for (let hop = 0; hop <= maxHops; hop++) {
        const bounded = fitMessages(working, budget)
        const attempted = await withRetry(
          () => semaphore.run(() => adapter.chat({ ...chatBase, messages: bounded })),
          undefined,
          signal,
        )
        retryCount += attempted.retryCount
        promptTokens += attempted.value.promptTokens ?? 0
        completionTokens += attempted.value.completionTokens ?? 0
        text = attempted.value.text
        const tools = workspaceRoot && !isSynthesis ? parseToolCalls(text) : []
        if (!workspaceRoot || !tools.length) break
        const toolOut = tools.map((t) => runTool(workspaceRoot, t)).join('\n\n')
        working.push({ role: 'assistant', content: text })
        working.push({
          role: 'user',
          content: `TOOL RESULTS:\n${toolOut}\n\nContinue your council turn. If you have enough, reply without a tool block.`,
        })
      }
      text = stripToolBlocks(text) || text
      const result = { text, promptTokens, completionTokens }

      const latency = Date.now() - started
      const cost = computeCost(
        result.promptTokens,
        result.completionTokens,
        model.inputPerMTokUsd,
        model.outputPerMTokUsd,
      )

      const msgId = this.deps.insertMessage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        kind: isSynthesis ? 'synthesis' : 'discussion',
        round,
        roundPosition,
        content: result.text,
      })

      bus.publish({
        type: 'message.created',
        sessionId,
        message: {
          id: String(msgId),
          sessionId,
          memberId: member.id,
          memberName: member.name,
          role: 'assistant',
          kind: isSynthesis ? 'synthesis' : 'discussion',
          round,
          content: result.text,
          usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
            costUsd: cost,
            latencyMs: latency,
          },
          createdAt: new Date().toISOString(),
        },
      })
      bus.publish({ type: 'member.completed', sessionId, round, memberId: member.id, memberName: member.name })

      const usageId = this.deps.recordUsage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        providerId: model.providerId,
        providerName: model.providerName,
        modelId: model.stableModelId,
        modelName: model.modelName || model.modelId,
        promptTokens: result.promptTokens ?? 0,
        completionTokens: result.completionTokens ?? 0,
        costUsd: cost,
        latencyMs: latency,
        retryCount,
        status: 'ok',
      })
      bus.publish({
        type: 'usage.recorded',
        sessionId,
        usage: {
          id: usageId,
          sessionId,
          providerId: model.providerId,
          providerName: model.providerName,
          modelId: model.stableModelId,
          modelName: model.modelName || model.modelId,
          memberId: member.id,
          memberName: member.name,
          promptTokens: result.promptTokens ?? 0,
          completionTokens: result.completionTokens ?? 0,
          totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
          costUsd: cost,
          latencyMs: latency,
          retryCount,
          errorCode: null,
          status: 'ok',
          createdAt: new Date().toISOString(),
        },
      })
      if (isSynthesis) {
        bus.publish({
          type: 'synthesis.completed',
          sessionId,
          message: {
            id: String(msgId),
            sessionId,
            memberId: member.id,
            memberName: member.name,
            role: 'assistant',
            kind: 'synthesis',
            round,
            content: result.text,
            usage: {
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
              costUsd: cost,
              latencyMs: latency,
            },
            createdAt: new Date().toISOString(),
          },
        })
      }

      transcript.push({ speaker: member.name, memberId: member.id, round, content: result.text })
    } catch (err) {
      const latency = Date.now() - started
      const msgText = err instanceof Error ? err.message : String(err)
      const retryCount = Number((err as { retryCount?: number })?.retryCount ?? 0)
      const errorCode =
        err instanceof AuthError
          ? 'authentication_failed'
          : err instanceof RateLimitError
            ? 'rate_limited'
            : err instanceof TimeoutError
              ? 'timeout'
              : err instanceof ProviderHttpError
                ? `http_${err.status}`
                : 'provider_error'
      const usageId = this.deps.recordUsage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        providerId: model.providerId,
        providerName: model.providerName,
        modelId: model.stableModelId,
        modelName: model.modelName || model.modelId,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: null,
        latencyMs: latency,
        retryCount,
        errorCode,
        status: 'error',
      })
      bus.publish({
        type: 'usage.recorded',
        sessionId,
        usage: {
          id: usageId,
          sessionId,
          providerId: model.providerId,
          providerName: model.providerName,
          modelId: model.stableModelId,
          modelName: model.modelName || model.modelId,
          memberId: member.id,
          memberName: member.name,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: null,
          latencyMs: latency,
          retryCount,
          errorCode,
          status: 'error',
          createdAt: new Date().toISOString(),
        },
      })
      // A failed member doesn't kill the council — log and move on.
      const failMsgId = this.deps.insertMessage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        kind: 'system',
        round,
        roundPosition,
        content: `[error] ${msgText}`,
      })
      bus.publish({
        type: 'message.created',
        sessionId,
        message: {
          id: String(failMsgId),
          sessionId,
          memberId: member.id,
          memberName: member.name,
          role: 'assistant',
          kind: 'system',
          round,
          content: `[error] ${msgText}`,
          createdAt: new Date().toISOString(),
        },
      })
      bus.publish({
        type: 'member.failed',
        sessionId,
        round,
        memberId: member.id,
        memberName: member.name,
        error: msgText,
      })
    }
  }
}

export class SessionCancelled extends Error {}
