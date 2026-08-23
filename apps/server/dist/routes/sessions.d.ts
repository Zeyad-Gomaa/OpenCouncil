/** Session routes: create (starts deliberation), inspect, cancel, SSE stream. */
import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/connection.js';
import type { SessionBus } from '../engine/bus.js';
import type { SessionManager } from '../engine/session-manager.js';
export interface SessionRouteDeps {
    db: DB;
    bus: SessionBus;
    sessions: SessionManager;
}
export declare function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void;
