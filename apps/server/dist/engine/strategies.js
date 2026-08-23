export const ROUND_ROBIN = {
    kind: 'round_robin',
    buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
    includeTranscript: () => false,
};
export const DEBATE = {
    kind: 'debate',
    buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
    includeTranscript: (round) => round > 1,
};
export function getStrategy(kind) {
    return kind === 'debate' ? DEBATE : ROUND_ROBIN;
}
//# sourceMappingURL=strategies.js.map