/** Domain error → HTTP mapping. */
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
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
  if (err instanceof ZodError) {
    return new AppError(
      400,
      'validation_error',
      'Invalid request',
      err.issues.map(({ path, code, message }) => ({ path, code, message })),
    )
  }
  if (err instanceof AuthError) return new AppError(401, 'provider_auth', err.message)
  if (err instanceof RateLimitError) return new AppError(429, 'provider_rate_limit', err.message)
  if (err instanceof TimeoutError) return new AppError(504, 'provider_timeout', err.message)
  if (err instanceof ProviderHttpError) return new AppError(502, 'provider_http', err.message, { status: err.status })
  if (err instanceof AppError) return err
  return new AppError(500, 'internal', 'An internal server error occurred')
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, _req, reply) => {
    const httpErr = err as { statusCode?: number; code?: string }
    const mapped =
      err instanceof AppError
        ? err
        : httpErr.statusCode && httpErr.statusCode >= 400 && httpErr.statusCode < 500
          ? new AppError(httpErr.statusCode, httpErr.code ?? 'invalid_request', 'Invalid request')
          : mapProviderError(err)
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
