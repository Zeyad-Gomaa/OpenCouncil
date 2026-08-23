/** Domain error → HTTP mapping. */
import type { FastifyInstance } from 'fastify';
export declare class AppError extends Error {
    statusCode: number;
    code: string;
    details?: unknown | undefined;
    constructor(statusCode: number, code: string, message: string, details?: unknown | undefined);
}
export declare function mapProviderError(err: unknown): AppError;
export declare function registerErrorHandlers(app: FastifyInstance): void;
