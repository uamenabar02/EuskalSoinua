import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

/**
 * AI Curator guardrail: Layer 2 is manual-only and rate limited per sync key so
 * the shared Gemini/NIM free tier can never be drained by a refresh loop.
 * Layer 1 (generated playlists) does not touch this limiter at all.
 */
describe("AI Curator cooldown guardrail", () => {
  const syncKey = `guardrail-test-${Date.now()}`;
  const key = `ai-playlist:${syncKey}`;

  beforeEach(() => resetRateLimit(key));

  it("allows five generations then blocks with a retry hint", () => {
    for (let i = 1; i <= 5; i++) {
      expect(checkRateLimit(key, 5, 15 * 60 * 1000).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, 5, 15 * 60 * 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("scopes the cooldown per user, not globally", () => {
    const otherKey = `ai-playlist:another-user-${Date.now()}`;
    resetRateLimit(otherKey);

    for (let i = 0; i < 5; i++) checkRateLimit(`ai-playlist:${syncKey}-a`, 5, 1000);
    expect(checkRateLimit(`ai-playlist:${syncKey}-a`, 5, 1000).allowed).toBe(false);
    // A different sync key is unaffected.
    expect(checkRateLimit(otherKey, 5, 1000).allowed).toBe(true);
    resetRateLimit(otherKey);
  });
});
