/** Deterministic offline mock adapter for demos and tests. */
import type { ProviderProtocol } from '@opencouncil/shared'
import type { ChatCallOpts, ChatResult, ProviderAdapter } from './types.js'

const OPENERS = [
  'Having weighed the matter',
  'From where I sit in this council',
  'Let me be direct',
  'I have studied the question closely',
]

function pick<T>(arr: T[], seed: string): T {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
  return arr[Math.abs(h) % arr.length]!
}

function estimateTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 4))
}

export const mockAdapter: ProviderAdapter = {
  protocol: 'mock' as ProviderProtocol,
  defaultBaseUrl: null,

  async chat(opts: ChatCallOpts): Promise<ChatResult> {
    // Simulate a little latency; respect cancellation.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 150 + Math.random() * 350)
      opts.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          reject(new Error('cancelled'))
        },
        { once: true },
      )
    })
    if (opts.signal?.aborted) throw new Error('cancelled')

    const systemMsg = opts.messages.find((m) => m.role === 'system')?.content ?? ''
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const persona = systemMsg.split('—')[0]?.trim() || 'Member'
    const isSynthesis = /you are the moderator of an ai council/i.test(systemMsg) || /\bsynthesize\b/i.test(systemMsg)

    let text: string
    if (isSynthesis) {
      text =
        `**The Council Convenes — Synthesis**\n\n` +
        `After full deliberation on "${lastUser.slice(0, 120)}", the council finds broad agreement on three points:\n\n` +
        `1. **Direction** — The Oracle's proposal stands as the primary course of action.\n` +
        `2. **Risk** — The Skeptic's objections are answered with concrete mitigations rather than dismissal.\n` +
        `3. **Execution** — Proceed in stages, verifying assumptions at each gate before committing further.\n\n` +
        `This concludes the council's deliberation.`
    } else {
      const opener = pick(OPENERS, persona + opts.modelId)
      text =
        `${opener}, ${persona.toLowerCase()} holds that ${opts.modelId} ` +
        `approaches "${lastUser.slice(0, 80)}" with a structured plan: define the objective, ` +
        `enumerate constraints, then commit to the highest-leverage first move while keeping retreat options open.`
      const joined = opts.messages.map((m) => m.content).join('\n')
      const urls = [...joined.matchAll(/https?:\/\/[^\s)\]>]+/g)].map((m) => m[0])
      const unique = [...new Set(urls)].slice(0, 3)
      if (unique.length > 0) {
        text += `\n\nGrounded in live sources:\n` + unique.map((u, i) => `${i + 1}. [${u}](${u})`).join('\n')
      }
      const imgs = [...joined.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]!).slice(0, 2)
      if (imgs.length > 0) {
        text += `\n\n` + imgs.map((src, i) => `![Source image ${i + 1}](${src})`).join('\n')
      }
    }

    return {
      text,
      promptTokens: estimateTokens(opts.messages.map((m) => m.content).join(' ')),
      completionTokens: estimateTokens(text),
    }
  },
}
