const OPENERS = [
    'Having weighed the matter',
    'From where I sit in this council',
    'Let me be direct',
    'I have studied the question closely',
];
function pick(arr, seed) {
    let h = 0;
    for (const c of seed)
        h = (h * 31 + c.charCodeAt(0)) | 0;
    return arr[Math.abs(h) % arr.length];
}
function estimateTokens(s) {
    return Math.max(1, Math.round(s.length / 4));
}
export const mockAdapter = {
    protocol: 'mock',
    defaultBaseUrl: null,
    async chat(opts) {
        // Simulate a little latency; respect cancellation.
        await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 150 + Math.random() * 350);
            opts.signal?.addEventListener('abort', () => {
                clearTimeout(t);
                reject(new Error('cancelled'));
            }, { once: true });
        });
        if (opts.signal?.aborted)
            throw new Error('cancelled');
        const systemMsg = opts.messages.find((m) => m.role === 'system')?.content ?? '';
        const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
        const persona = systemMsg.split('—')[0]?.trim() || 'Member';
        const isSynthesis = /synthes/i.test(systemMsg);
        let text;
        if (isSynthesis) {
            text =
                `**The Council Convenes — Synthesis**\n\n` +
                    `After full deliberation on "${lastUser.slice(0, 120)}", the council finds broad agreement on three points:\n\n` +
                    `1. **Direction** — The Oracle's proposal stands as the primary course of action.\n` +
                    `2. **Risk** — The Skeptic's objections are answered with concrete mitigations rather than dismissal.\n` +
                    `3. **Execution** — Proceed in stages, verifying assumptions at each gate before committing further.\n\n` +
                    `This concludes the council's deliberation.`;
        }
        else {
            const opener = pick(OPENERS, persona + opts.modelId);
            text =
                `${opener}, ${persona.toLowerCase()} holds that ${opts.modelId} ` +
                    `approaches "${lastUser.slice(0, 80)}" with a structured plan: define the objective, ` +
                    `enumerate constraints, then commit to the highest-leverage first move while keeping retreat options open.`;
        }
        return {
            text,
            promptTokens: estimateTokens(opts.messages.map((m) => m.content).join(' ')),
            completionTokens: estimateTokens(text),
        };
    },
};
//# sourceMappingURL=mock.js.map