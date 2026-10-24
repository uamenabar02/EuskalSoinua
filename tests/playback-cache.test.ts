import { describe, it, expect, beforeEach } from "vitest";
import {
  isAudioBufferedSync,
  getBufferedAudioUrlSync,
  getBufferedStreamInfo,
} from "@/lib/playback-cache";

describe("Playback Cache & Offline Queue Buffer", () => {
  it("should safely return false/null for unbuffered tracks", () => {
    expect(isAudioBufferedSync(999999)).toBe(false);
    expect(getBufferedAudioUrlSync(999999)).toBeNull();
    expect(getBufferedStreamInfo(999999)).toBeNull();
  });

  it("should handle title and artist combo lookups gracefully", () => {
    expect(isAudioBufferedSync("999999", "Uncached Song", "Uncached Artist")).toBe(false);
    expect(getBufferedAudioUrlSync("999999", "Uncached Song", "Uncached Artist")).toBeNull();
  });
});
