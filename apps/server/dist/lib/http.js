/** Minimal typed fetch helper with timeout + typed provider errors. */
export class AuthError extends Error {
    name = 'AuthError';
}
export class RateLimitError extends Error {
    name = 'RateLimitError';
}
export class TimeoutError extends Error {
    name = 'TimeoutError';
}
export class ProviderHttpError extends Error {
    status;
    constructor(status, body) {
        super(`provider HTTP ${status}: ${body.slice(0, 300)}`);
        this.status = status;
        this.name = 'ProviderHttpError';
    }
}
export async function httpJson(url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new TimeoutError('provider request timed out')), opts.timeoutMs);
    const onOuterAbort = () => controller.abort(new TimeoutError('session cancelled'));
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
        const res = await fetch(url, {
            method: opts.method ?? 'POST',
            headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403)
            throw new AuthError(`provider rejected credentials (${res.status})`);
        if (res.status === 429)
            throw new RateLimitError('provider rate limit hit');
        if (!res.ok)
            throw new ProviderHttpError(res.status, await res.text().catch(() => ''));
        return (await res.json());
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            // Distinguish outer cancel vs our timeout by cause
            if (opts.signal?.aborted)
                throw new TimeoutError('cancelled');
            throw new TimeoutError('provider request timed out');
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
    }
}
//# sourceMappingURL=http.js.map