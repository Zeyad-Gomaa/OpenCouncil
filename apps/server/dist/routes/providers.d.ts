/** Provider + model CRUD routes. */
import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/connection.js';
export declare function registerProviderRoutes(app: FastifyInstance, db: DB): void;
