// Sliding window rate limiter for critical endpoints (5 attempts per 15 minutes per IP)

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Extracts the real client IP address reliably across Vercel, Cloud Run, Cloudflare, and local proxies.
 */
export function getClientIp(headers: Headers): string {
  // 1. Vercel real client IP header
  const vercelIp = headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }

  // 2. Cloudflare Connecting IP
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  // 3. Standard X-Real-IP
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // 4. X-Forwarded-For (first entry)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "127.0.0.1";
}

/**
 * Checks and increments rate limit for a given key.
 * @param key Unique key (e.g. `login:${ip}`)
 * @param limit Maximum attempts allowed in window (default 5)
 * @param windowMs Window duration in milliseconds (default 15 mins = 900,000ms)
 * @returns { allowed: boolean, remaining: number, retryAfterSeconds: number }
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  entry.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
  return {
    allowed: true,
    remaining: limit - entry.count,
    retryAfterSeconds,
  };
}

/**
 * Resets rate limit for a given key upon successful authentication
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
