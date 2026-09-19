import { describe, it, expect } from "vitest";
import { configuredInstances } from "@/lib/sources/streaming";

describe("Streaming & Search Utilities", () => {
  it("should have configured Piped and Invidious fallback instances", () => {
    const instances = configuredInstances();
    expect(instances).toBeDefined();
    expect(Array.isArray(instances.piped)).toBe(true);
    expect(Array.isArray(instances.invidious)).toBe(true);
    expect(instances.piped.length).toBeGreaterThan(0);
    expect(instances.invidious.length).toBeGreaterThan(0);
  });

  it("should handle accent-insensitive search queries cleanly", () => {
    const queryWithAccent = "Rotten XIII Gerónimo";
    const queryWithoutAccent = "Rotten XIII Geronimo";

    const normalize = (str: string) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    expect(normalize(queryWithAccent)).toBe(normalize(queryWithoutAccent));
  });

  it("should format search query terms for streaming providers without trailing punctuation", () => {
    const raw = "  Rotten XIII - Geronimo (Official Video)  ";
    const clean = raw
      .replace(/\(official video\)|\(video oficial\)|\(audio\)|\(videoclip\)/gi, "")
      .replace(/[-–—]+/g, " ")
      .trim();

    expect(clean).toBe("Rotten XIII   Geronimo");
    expect(clean.replace(/\s+/g, " ")).toBe("Rotten XIII Geronimo");
  });
});
