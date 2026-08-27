/** Moderator synthesis pass — the chair distills the council's agreement. */
import type { ChatMessage } from '../providers/types.js'

export const SYNTHESIS_SYSTEM_PROMPT = `You are the moderator of an AI council. You have watched a panel of AI members deliberate a question over one or more rounds. Your task:

1. Identify the core points of AGREEMENT across members.
2. Note material disagreements and state how they were resolved.
3. Deliver ONE clear, actionable, authoritative final synthesis representing the council's consensus.
4. Use rich Markdown structuring (headings, key takeaways, summary tables, citation links). If helpful to explain the consensus architecture or workflow, include a Mermaid diagram (\`\`\`mermaid ... \`\`\`).

Be concise, rigorous, and direct. Do not mention that you are an AI.`

export function buildSynthesisMessages(topic: string, transcript: string): ChatMessage[] {
  return [
    { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `QUESTION PUT TO THE COUNCIL:\n${topic}\n\nFULL TRANSCRIPT OF DELIBERATION:\n${transcript}\n\nDeliver the council's synthesis now.`,
    },
  ]
}
