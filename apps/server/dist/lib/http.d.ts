/** Minimal typed fetch helper with timeout + typed provider errors. */
export declare class AuthError extends Error {
    name: string;
}
export declare class RateLimitError extends Error {
    name: string;
}
export declare class TimeoutError extends Error {
    name: string;
}
export declare class ProviderHttpError extends Error {
    status: number;
    constructor(status: number, body: string);
}
export declare function httpJson<T>(url: string, opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs: number;
    signal?: AbortSignal;
}): Promise<T>;
