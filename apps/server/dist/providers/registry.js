import { anthropicAdapter } from './anthropic.js';
import { googleAdapter } from './google.js';
import { mockAdapter } from './mock.js';
import { openAICompatibleAdapter } from './openai-compatible.js';
const ADAPTERS = {
    openai_compatible: openAICompatibleAdapter,
    anthropic: anthropicAdapter,
    google: googleAdapter,
    mock: mockAdapter,
};
export function getAdapter(protocol) {
    return ADAPTERS[protocol];
}
//# sourceMappingURL=registry.js.map