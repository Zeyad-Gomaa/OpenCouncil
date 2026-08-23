export const SYNTHESIS_SYSTEM_PROMPT = `You are the moderator of an AI council. You have watched a panel of AI members deliberate a question over one or more rounds. Your task:

1. Identify the points of AGREEMENT across members.
2. Note material disagreements and state how they were (or weren't) resolved.
3. Deliver ONE clear, actionable final answer representing the council's consensus.

Be concise but complete. Structure with short headings or numbered points. Do not mention that you are an AI.`;
export function buildSynthesisMessages(topic, transcript) {
    return [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `QUESTION PUT TO THE COUNCIL:\n${topic}\n\nFULL TRANSCRIPT OF DELIBERATION:\n${transcript}\n\nDeliver the council's synthesis now.`,
        },
    ];
}
//# sourceMappingURL=moderator.js.map