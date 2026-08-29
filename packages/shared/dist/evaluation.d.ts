/** Observable peer preferences; agreement is not factual correctness. */
export interface ConsensusResult {
    status: 'complete' | 'insufficient_responses' | 'insufficient_ballots';
    candidates: {
        id: string;
        memberId: string;
        memberName: string;
        content: string;
    }[];
    ballots: {
        memberId: string;
        ranking: string[];
        rationale: string;
    }[];
    rejected: {
        memberId: string;
        reason: string;
        raw: string;
    }[];
    scores: {
        candidateId: string;
        score: number;
        firstPlaceVotes: number;
    }[];
    winnerId: string | null;
    topChoiceShare: number | null;
    coverage: number;
}
export interface BudgetState {
    limitUsd: number | null;
    reservedUsd: number;
    reportedUsd: number;
    uncertainAttempts: number;
    attempts: number;
    maxAttempts: number;
    stopped: string | null;
}
