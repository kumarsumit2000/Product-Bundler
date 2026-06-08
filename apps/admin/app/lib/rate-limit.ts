// Per-shop rate limiter backed by KV. Cloudflare Pages can't bind the
// native Rate Limiting API (it's Workers-only), so we approximate with a
// minute-bucketed counter. Race conditions can under- or over-count by a
// few, but for our threshold (1000/min/shop, well above legitimate widget
// traffic) approximate accuracy is fine.

const DEFAULT_LIMIT = 1000;
const DEFAULT_WINDOW_SECONDS = 60;
const KV_TTL_BUFFER_SECONDS = 60; // KV TTL = window + buffer so counters expire cleanly

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Increment the per-shop counter for the current minute bucket and decide
 * whether the request should be allowed.
 */
export async function checkRateLimit(
  cache: KVNamespace,
  shop: string,
  opts: { limit?: number; windowSeconds?: number } = {},
): Promise<RateLimitResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowSeconds = opts.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rl:${shop}:${bucket}`;

  const raw = await cache.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }
  // Best-effort increment. We don't await the put — the counter is allowed
  // to be slightly stale; what matters is approximating the cap over time.
  await cache.put(key, String(current + 1), {
    expirationTtl: windowSeconds + KV_TTL_BUFFER_SECONDS,
  });
  return { allowed: true, remaining: Math.max(0, limit - current - 1) };
}
