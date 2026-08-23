/** Domain error → HTTP mapping. */
import type { FastifyInstance } from 'fastify'
import { AuthError, ProviderHttpError, RateLimitError, TimeoutError } from './http.js'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function mapProviderError(err: unknown): AppError {
  if (err instanceof AuthError) return new AppError(401, 'provider_auth', err.message)
  if (err instanceof RateLimitError) return new AppError(429, 'provider_rate_limit', err.message)
  if (err instanceof TimeoutError) return new AppError(504, 'provider_timeout', err.message)
  if (err instanceof ProviderHttpError)
    return new AppError(502, 'provider_http', err.message, { status: err.status })
  if (err instanceof AppError) return err
  return new AppError(500, 'internal', err instanceof Error ? err.message : 'unknown error')
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    const mapped = err instanceof AppError ? err : mapProviderError(err)
    if (mapped.statusCode >= 500) {
      app.log.error({ err }, mapped.message)
    } else {
      app.log.warn({ code: mapped.code }, mapped.message)
    }
    reply.status(mapped.statusCode).send({
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    })
  })
}
