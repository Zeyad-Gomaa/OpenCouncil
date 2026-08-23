import type { CouncilEvent } from '@opencouncil/shared';
type Listener = (event: CouncilEvent) => void;
export declare class SessionBus {
    private emitters;
    private emitterFor;
    publish(event: CouncilEvent): void;
    subscribe(sessionId: string, listener: Listener): () => void;
    closeSession(sessionId: string): void;
}
export {};
