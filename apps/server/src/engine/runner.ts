/** The deliberation runner: executes a council session end-to-end. */
import type { ConsensusResult, MemberDTO, StrategyKind } from '@opencouncil/shared'
import { decryptSecret } from '../vault/crypto.js'
import { getAdapter } from '../providers/registry.js'
import type { ChatMessage, ChatResult } from '../providers/types.js'
import { fitMessages } from './context-budgeter.js'
import { Semaphore, withRetry } from './execution-policy.js'
import { AuthError, ProviderHttpError, RateLimitError, TimeoutError } from '../lib/http.js'
import { buildSynthesisMessages } from './moderator.js'
import { buildMemberMessages } from './prompts.js'
import { aggregateConsensus, peerReviewMessages } from './consensus.js'
import { SpendingBudget } from './spending-budget.js'
import { getStrategy } from './strategies.js'
import { formatResearchMarkdown, researchTopic, searchWeb } from './web-search.js'
import { buildWorkspaceBriefing, parseToolCalls, runTool, stripToolBlocks } from './workspace.js'
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
  extend(additionalRounds: number): { added: number; total: number }
  conclude(reason?: string): void
  intervene(content: string): void
  consumeInterventions(): string[]
}

export function isSessionController(c: unknown): c is SessionController {
  return typeof c === 'object' && c !== null && 'shouldConcludeEarly' in c && 'signal' in c
}

export interface RunnerDeps {
  bus: SessionBus
  researchEnabled?: boolean
  loadResearchEnabled?(sessionId: string): boolean
  loadSessionOptions?(sessionId: string): { budgetUsd?: number; consensusEnabled?: boolean }
  saveSessionResult?(sessionId: string, key: 'budget' | 'consensus', value: unknown): void
  maxSessionUsd?: number | null
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

function defaultOutputTokens(modelId: string): number {
  return /(?:deepseek-v4|deepseek-reasoner|(^|[/:-])r1(?:[/:-]|$)|qwq|\bo[13](?:[-:]|$)|thinking)/i.test(modelId)
    ? 4096
    : 1024
}

function emptyResponseMessage(result: ChatResult | null): string {
  if (!result) return 'Provider returned no response.'
  if (result.refusalReason) return `Provider returned no final text (refusal: ${result.refusalReason.slice(0, 240)}).`
  const details = [
    result.finishReason ? `finish_reason=${result.finishReason}` : null,
    result.completionTokens != null ? `completion_tokens=${result.completionTokens}` : null,
    result.reasoningTokens != null ? `reasoning_tokens=${result.reasoningTokens}` : null,
  ].filter(Boolean)
  return details.length
    ? `Provider returned no final text (${details.join(', ')}). Increase the member output limit or choose a model that returns visible text.`
    : 'Provider returned no final text. The provider may have returned an unsupported response shape.'
}

function computeCost(
  promptTokens: number | null,
  completionTokens: number | null,
  inPrice: number | null,
  outPrice: number | null,
): number | null {
  if (promptTokens == null || completionTokens == null) return null
  if (inPrice == null || outPrice == null) return null
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
  private spending = new Map<string, SpendingBudget>()
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
      const options = this.deps.loadSessionOptions?.(sessionId) ?? {}
      const webSearchEnabled =
        this.deps.researchEnabled !== false && this.deps.loadResearchEnabled?.(sessionId) !== false
      const configuredLimit = options.budgetUsd ?? null
      const limit =
        this.deps.maxSessionUsd == null
          ? configuredLimit
          : configuredLimit == null
            ? this.deps.maxSessionUsd
            : Math.min(configuredLimit, this.deps.maxSessionUsd)
      const spending = new SpendingBudget(limit, (state) => this.deps.saveSessionResult?.(sessionId, 'budget', state))
      this.spending.set(sessionId, spending)
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

      if (signal.aborted) throw new SessionCancelled()
      // Web research is optional: private topics must not reach search providers.
      if (this.deps.researchEnabled !== false && this.deps.loadResearchEnabled?.(sessionId) !== false) {
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
              content:
                'No live web sources were found for this question. The council will reason from model knowledge.',
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
      }
      if (signal.aborted) throw new SessionCancelled()

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
              strategy.instruction(roundNum),
              workspace?.root,
              webSearchEnabled,
            )
          }
        } else {
          // Parallel (round robin / swarm / critique): members speak concurrently
          const outcomes = await Promise.allSettled(
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
                strategy.instruction(roundNum),
                workspace?.root,
                webSearchEnabled,
              )
            }),
          )
          const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
          if (rejected?.status === 'rejected') throw rejected.reason
        }

        bus.publish({ type: 'round.completed', sessionId, round: roundNum })

        // Check if additional rounds were dynamically requested
        if (controller) {
          totalPlannedRounds = council.rounds + controller.getAdditionalRounds()
        }
      }

      if (signal.aborted) throw new SessionCancelled()
      if (!transcript.some((entry) => activeMembers.some((member) => member.id === entry.memberId))) {
        throw new Error('No council member produced a response. Check enabled models, providers, and credentials.')
      }

      if (options.consensusEnabled) {
        const latest = new Map<string, TranscriptEntry>()
        for (const entry of transcript)
          if (activeMembers.some((m) => m.id === entry.memberId)) latest.set(entry.memberId, entry)
        const candidates: ConsensusResult['candidates'] = [...latest.values()].map((entry, i) => ({
          id: `C${i + 1}`,
          memberId: entry.memberId,
          memberName: entry.speaker,
          content: entry.content,
        }))
        const ordered = candidates.sort((a, b) => a.id.localeCompare(b.id))
        const reviewOutcomes = await Promise.allSettled(
          activeMembers.map(async (member) => ({
            memberId: member.id,
            text: await this.callPeerReview(sessionId, member, peerReviewMessages(topic, ordered), signal),
          })),
        )
        const reviewFailure = reviewOutcomes.find((outcome) => outcome.status === 'rejected')
        if (reviewFailure?.status === 'rejected') throw reviewFailure.reason
        const reviews = reviewOutcomes
          .filter(
            (outcome): outcome is PromiseFulfilledResult<{ memberId: string; text: string | undefined }> =>
              outcome.status === 'fulfilled',
          )
          .map((outcome) => outcome.value)
        const consensus = aggregateConsensus(
          ordered,
          reviews.filter((r): r is { memberId: string; text: string } => typeof r.text === 'string'),
          activeMembers.length,
        )
        this.deps.saveSessionResult?.(sessionId, 'consensus', consensus)
        if (consensus.status === 'complete') {
          transcript.push({
            speaker: 'Peer Evaluation',
            memberId: 'system_evaluation',
            round: roundNum + 1,
            content: `Structured anonymous peer rankings (preference, not proof): ${JSON.stringify(consensus)}`,
          })
        }
      }
      this.spending.get(sessionId)?.assertUsable()

      // Moderator synthesis (optional).
      const moderator = council.moderatorMemberId
        ? activeMembers.find((m) => m.id === council.moderatorMemberId)
        : undefined
      if (moderator && transcript.length > 0) {
        if (signal.aborted) throw new Error('cancelled')
        bus.publish({ type: 'moderator.started', sessionId })
        await this.callMember(sessionId, moderator, topic, transcript, roundNum + 1, 0, true, signal, true)
      }

      if (signal.aborted) throw new SessionCancelled()
      this.deps.updateSessionStatus(sessionId, 'completed')
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
    } finally {
      this.spending.delete(sessionId)
    }
  }

  private async callPeerReview(
    sessionId: string,
    member: MemberDTO,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const model = this.deps.loadModelForChat(member.modelId)
    if (!model) return undefined
    const adapter = getAdapter(model.providerProtocol)
    const semaphore = this.providerLimits.get(model.providerId) ?? new Semaphore(2)
    this.providerLimits.set(model.providerId, semaphore)
    try {
      const bounded = fitMessages(messages, {
        contextWindow: model.contextWindow,
        responseTokens: Math.min(member.maxTokens ?? 1024, 2048),
        safetyMargin: 128,
      })
      const attempted = await withRetry(
        () =>
          semaphore.run(async () => {
            if (signal.aborted) throw new SessionCancelled()
            const maxTokens = Math.min(member.maxTokens ?? 1024, 2048)
            const settle = this.spending
              .get(sessionId)
              ?.reserve(bounded, maxTokens, model.inputPerMTokUsd, model.outputPerMTokUsd)
            const value = await adapter.chat({
              baseUrl: model.providerBaseUrl ?? adapter.defaultBaseUrl ?? '',
              apiKey: model.apiKeyEncrypted ? decryptSecret(model.apiKeyEncrypted) : undefined,
              modelId: model.modelId,
              temperature: 0,
              maxTokens,
              timeoutMs: CALL_TIMEOUT_MS,
              signal,
              messages: bounded,
            })
            const cost = computeCost(
              value.promptTokens,
              value.completionTokens,
              model.inputPerMTokUsd,
              model.outputPerMTokUsd,
            )
            settle?.(cost)
            this.deps.recordUsage({
              sessionId,
              memberId: member.id,
              memberName: `${member.name} (review)`,
              providerId: model.providerId,
              providerName: model.providerName,
              modelId: model.stableModelId,
              modelName: model.modelName || model.modelId,
              promptTokens: value.promptTokens ?? 0,
              completionTokens: value.completionTokens ?? 0,
              costUsd: cost,
              latencyMs: 0,
              status: 'ok',
            })
            return value
          }),
        undefined,
        signal,
      )
      return attempted.value.text
    } catch (err) {
      if (err instanceof Error && err.name === 'BudgetExceeded') throw err
      return undefined
    }
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
    webSearchEnabled = false,
  ): Promise<string | undefined> {
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
      messages.push(
        ...buildMemberMessages({
          member,
          topic,
          round,
          transcript,
          includeTranscript,
          strategyInstruction: promptAddon,
          workspaceRoot,
          webSearchEnabled,
        }),
      )
    }

    const outputTokens = member.maxTokens ?? defaultOutputTokens(model.modelId)
    const budget = {
      contextWindow: model.contextWindow,
      responseTokens: outputTokens,
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
        maxTokens: outputTokens,
        timeoutMs: CALL_TIMEOUT_MS,
        signal,
      }
      let promptTokens = 0
      let completionTokens = 0
      let retryCount = 0
      let text = ''
      let lastResult: ChatResult | null = null
      const working = [...messages]
      const canSearch = webSearchEnabled && !isSynthesis
      const maxHops = workspaceRoot || canSearch ? 4 : 0
      for (let hop = 0; hop <= maxHops; hop++) {
        const bounded = fitMessages(working, budget)
        const attempted = await withRetry(
          () =>
            semaphore.run(() => {
              if (signal.aborted) throw new SessionCancelled()
              const settle = this.spending
                .get(sessionId)
                ?.reserve(bounded, chatBase.maxTokens ?? outputTokens, model.inputPerMTokUsd, model.outputPerMTokUsd)
              return adapter.chat({ ...chatBase, messages: bounded }).then((value) => {
                settle?.(
                  computeCost(
                    value.promptTokens,
                    value.completionTokens,
                    model.inputPerMTokUsd,
                    model.outputPerMTokUsd,
                  ),
                )
                return value
              })
            }),
          undefined,
          signal,
        )
        retryCount += attempted.retryCount
        promptTokens += attempted.value.promptTokens ?? 0
        completionTokens += attempted.value.completionTokens ?? 0
        text = attempted.value.text
        lastResult = attempted.value
        const tools = workspaceRoot || canSearch ? parseToolCalls(text) : []
        if (!tools.length) break
        if (hop === maxHops) throw new Error('Tool-hop limit reached before a final answer.')
        if (tools.length > 8) throw new Error('Workspace tool-call limit exceeded (8 per hop).')
        const webCalls = tools.filter((tool) => tool.name === 'web_search')
        if (!canSearch && webCalls.length) throw new Error('Web search is disabled for this session.')
        if (webCalls.length > 3) throw new Error('Web-search limit exceeded (3 per member turn).')
        const toolOut = (
          await Promise.all(
            tools.map(async (tool) => {
              if (tool.name === 'web_search') {
                const results = await searchWeb(tool.query!, 5, 8_000)
                return `web_search ${tool.query}\n${
                  results.map((result) => `- [${result.title}](${result.url}): ${result.snippet}`).join('\n') ||
                  '(no results)'
                }`
              }
              if (!workspaceRoot) return 'workspace tool error: no workspace is attached'
              return runTool(workspaceRoot, tool)
            }),
          )
        ).join('\n\n')
        working.push({ role: 'assistant', content: text })
        working.push({
          role: 'user',
          content: `TOOL RESULTS:\n${toolOut}\n\nContinue your council turn. If you have enough, reply without a tool block.`,
        })
      }
      text = stripToolBlocks(text)
      if (!text.trim()) throw new Error(emptyResponseMessage(lastResult))
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
      return result.text
    } catch (err) {
      if (err instanceof Error && err.name === 'BudgetExceeded') throw err
      const latency = Date.now() - started
      const msgText = err instanceof Error ? err.message : String(err)
      const retryCount = Number((err as { retryCount?: number })?.retryCount ?? 0)
      const errorCode = msgText.startsWith('Provider returned no final text')
        ? 'empty_response'
        : err instanceof AuthError
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
