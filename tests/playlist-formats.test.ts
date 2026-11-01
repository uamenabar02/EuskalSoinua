import { describe, it, expect } from "vitest";
import {
  FORMAT_REGISTRY,
  buildArtistsDescription,
  buildFormatDescription,
  buildFormatTitle,
  generatedPlaylistId,
  isGeneratedPlaylistId,
  parseGeneratedPlaylistId,
  refreshSeed,
} from "@/lib/playlists/format-registry";

describe("playlist format registry", () => {
  it("mirrors the Spotify mediaListConfig vocabulary", () => {
    expect(FORMAT_REGISTRY["daily-mix"].mediaListConfig).toBe("dailymix:default_v41");
    expect(FORMAT_REGISTRY["inspiredby-mix"].mediaListConfig).toBe(
      "track-radio-inspiredby:default_v29",
    );
    expect(FORMAT_REGISTRY["artist-seed-mix"].mediaListConfig).toBe(
      "artist-seed-mix:default_v27",
    );
  });

  it("builds Spotify-shaped titles", () => {
    expect(buildFormatTitle("daily-mix", { index: 3 })).toBe("Daily Mix 3");
    expect(buildFormatTitle("discover-weekly")).toBe("Discover Weekly");
    expect(buildFormatTitle("inspiredby-mix", { seed: "ZETAK" })).toBe("Radio ZETAK");
    expect(buildFormatTitle("artist-seed-mix", { artist: "Izaro" })).toBe("Mix of Izaro");
    expect(buildFormatTitle("topic-mix", { genre: "Rock" })).toBe("Rock Mix");
  });

  it("formats the 'With A, B, C and more' description", () => {
    expect(buildArtistsDescription(["ZETAK", "Bulego"])).toBe("With ZETAK and Bulego");
    expect(buildArtistsDescription(["A", "B", "C"])).toBe("With A, B and C");
    expect(buildArtistsDescription(["A", "B", "C", "D"])).toBe("With A, B, C and more");
    expect(buildFormatDescription("daily-mix", { artists: ["A", "B", "C", "D"] })).toContain(
      "and more",
    );
  });

  it("generates and parses stable ids", () => {
    expect(generatedPlaylistId("daily-mix", { index: 2 })).toBe("daily-mix-2");
    expect(generatedPlaylistId("discover-weekly")).toBe("discover-weekly");
    expect(generatedPlaylistId("topic-mix", { slug: "Basque Rock" })).toBe(
      "topic-mix-basque-rock",
    );
    expect(generatedPlaylistId("artist-seed-mix", { slug: "En Tol Sarmiento" })).toBe(
      "artist-mix-en-tol-sarmiento",
    );

    expect(parseGeneratedPlaylistId("daily-mix-4")).toEqual({ format: "daily-mix", index: 4 });
    expect(parseGeneratedPlaylistId("on-repeat")).toEqual({ format: "on-repeat" });
    expect(parseGeneratedPlaylistId("topic-mix-basque-rock")).toEqual({
      format: "topic-mix",
      slug: "basque-rock",
    });
    expect(parseGeneratedPlaylistId("42")).toBeNull();

    expect(isGeneratedPlaylistId("release-radar")).toBe(true);
    expect(isGeneratedPlaylistId("15")).toBe(false);
  });

  it("keeps daily seeds stable within a day and weekly seeds within a week", () => {
    const monday = new Date("2026-10-26T10:00:00Z");
    const tuesday = new Date("2026-10-27T23:00:00Z");
    const nextMonday = new Date("2026-11-02T00:01:00Z");

    expect(refreshSeed("daily", monday)).toBe("daily:2026-10-26");
    expect(refreshSeed("daily", tuesday)).toBe("daily:2026-10-27");
    expect(refreshSeed("weekly", monday)).toBe(refreshSeed("weekly", tuesday));
    expect(refreshSeed("weekly", nextMonday)).not.toBe(refreshSeed("weekly", monday));
  });
});
