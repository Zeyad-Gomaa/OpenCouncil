import { httpJson } from '../lib/http.js';
export const openAICompatibleAdapter = {
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    async chat(opts) {
        const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const data = await httpJson(url, {
            headers: opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {},
            body: {
                model: opts.modelId,
                messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
                temperature: opts.temperature,
                max_tokens: opts.maxTokens,
            },
            timeoutMs: opts.timeoutMs,
            signal: opts.signal,
        });
        return {
            text: data.choices?.[0]?.message?.content ?? '',
            promptTokens: data.usage?.prompt_tokens ?? null,
            completionTokens: data.usage?.completion_tokens ?? null,
        };
    },
};
//# sourceMappingURL=openai-compatible.js.map