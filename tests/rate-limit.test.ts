import { describe, it, expect } from "vitest";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";

describe("Rate Limiter & IP Extraction", () => {
  it("should extract client IP correctly across headers", () => {
    const vercelHeaders = new Headers({ "x-vercel-forwarded-for": "198.51.100.1, 10.0.0.1" });
    expect(getClientIp(vercelHeaders)).toBe("198.51.100.1");

    const cfHeaders = new Headers({ "cf-connecting-ip": "203.0.113.50" });
    expect(getClientIp(cfHeaders)).toBe("203.0.113.50");

    const realIpHeaders = new Headers({ "x-real-ip": "192.0.2.1" });
    expect(getClientIp(realIpHeaders)).toBe("192.0.2.1");

    const forwardedHeaders = new Headers({ "x-forwarded-for": "198.51.100.25, 127.0.0.1" });
    expect(getClientIp(forwardedHeaders)).toBe("198.51.100.25");

    const emptyHeaders = new Headers();
    expect(getClientIp(emptyHeaders)).toBe("127.0.0.1");
  });

  it("should enforce maximum 5 attempts per window and block 6th attempt", () => {
    const testKey = `test_ip_${Date.now()}`;
    resetRateLimit(testKey);

    // 1st to 5th attempts should be allowed
    for (let i = 1; i <= 5; i++) {
      const result = checkRateLimit(testKey, 5, 10000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i);
    }

    // 6th attempt must be rejected
    const blockedResult = checkRateLimit(testKey, 5, 10000);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remaining).toBe(0);
    expect(blockedResult.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should reset rate limit after resetRateLimit is called", () => {
    const testKey = `test_reset_${Date.now()}`;
    checkRateLimit(testKey, 1, 10000);
    expect(checkRateLimit(testKey, 1, 10000).allowed).toBe(false);

    resetRateLimit(testKey);
    expect(checkRateLimit(testKey, 1, 10000).allowed).toBe(true);
  });
});
