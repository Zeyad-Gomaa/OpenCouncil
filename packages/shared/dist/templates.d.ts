import type { StrategyKind } from './domain.js';
export interface CouncilTemplateDTO {
    key: string;
    name: string;
    description: string;
    strategy: StrategyKind;
    rounds: number;
    moderator: 'recommended' | 'none';
    useCases: string[];
    suggestedSeats: string[];
}
/** Curated starting points. They configure deliberation; operators still choose their own members/models. */
export declare const COUNCIL_TEMPLATES: CouncilTemplateDTO[];
