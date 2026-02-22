/**
 * lib/rate-limit.ts
 *
 * Lightweight in-process rate limiter for Next.js API routes.
 * Uses a sliding-window algorithm stored in globalThis so the counter
 * persists across requests on the same warm serverless instance.
 *
 * Usage:
 *   const result = rateLimit(userId, { limit: 10, windowMs: 60_000 });
 *   if (!result.success) {
 *     return new Response('Too Many Requests', { status: 429 });
 *   }
 *
 * For production at scale, replace the in-memory store with Vercel KV / Redis
 * using the same interface so callers don't need to change.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

interface RateLimitOptions {
    /** Maximum requests per window (default: 20) */
    limit?: number;
    /** Window duration in milliseconds (default: 60 000 ms = 1 minute) */
    windowMs?: number;
}

interface RateLimitResult {
    success: boolean;
    /** Remaining requests in the current window */
    remaining: number;
    /** Unix timestamp (ms) when the window resets */
    resetAt: number;
    /** HTTP headers to attach to the response */
    headers: Record<string, string>;
}

// Singleton store — survives hot-reloads in dev and warm instances in prod
const g = globalThis as typeof globalThis & {
    __rateLimitStore?: Map<string, RateLimitEntry>;
};
if (!g.__rateLimitStore) {
    g.__rateLimitStore = new Map<string, RateLimitEntry>();
}
const store = g.__rateLimitStore;

// Cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 5 * 60 * 1000);

export function rateLimit(
    identifier: string,
    options: RateLimitOptions = {}
): RateLimitResult {
    const { limit = 20, windowMs = 60_000 } = options;
    const now = Date.now();

    let entry = store.get(identifier);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(identifier, entry);
    }

    entry.count++;
    const remaining = Math.max(0, limit - entry.count);
    const success = entry.count <= limit;

    return {
        success,
        remaining,
        resetAt: entry.resetAt,
        headers: {
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
            ...(success ? {} : { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) }),
        },
    };
}

/**
 * Convenience wrapper for AI analysis routes.
 * Allows 5 analyses per minute per user (heavy Claude calls).
 */
export function rateLimitAI(userId: string): RateLimitResult {
    return rateLimit(`ai:${userId}`, { limit: 5, windowMs: 60_000 });
}

/**
 * Convenience wrapper for Google Ads data routes.
 * Allows 30 requests per minute per user.
 */
export function rateLimitGoogleAds(userId: string): RateLimitResult {
    return rateLimit(`gads:${userId}`, { limit: 30, windowMs: 60_000 });
}
