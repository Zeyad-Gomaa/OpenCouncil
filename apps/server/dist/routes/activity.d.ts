/** Activity stats: usage aggregates for the dashboard. */
import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/connection.js';
export declare function registerActivityRoutes(app: FastifyInstance, db: DB): void;
