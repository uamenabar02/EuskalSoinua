import { describe, it, expect } from "vitest";
import type { Track } from "@/lib/types";
import { buildGraph } from "@/lib/playlists/similarity";
import {
  DAILY_MIX_COUNT,
  aggregatePlays,
  buildDailyMixes,
  isNewRelease,
  selectDiverseTracks,
  type GenerationContext,
  type ListenRow,
} from "@/lib/playlists/generated";

const NOW = Date.now();

function track(id: number, artistName: string, genre = "rock", playCount = 100): Track {
  return {
    id,
    externalId: null,
    source: "local",
    title: `Track ${id}`,
    artistId: null,
    artistName,
    albumId: null,
    albumName: null,
    duration: 200,
    thumbnail: null,
    genre,
    region: "eu",
    language: "eu",
    demoAudio: null,
    isrc: null,
    previewUrl: null,
    previewUrlAlt: null,
    artworkUrl: null,
    playCount,
  };
}

function listenRow(trackId: number, artistName: string, extra: Partial<ListenRow> = {}): ListenRow {
  return {
    trackId,
    artistName,
    genre: "rock",
    region: "eu",
    language: "eu",
    completed: false,
    skipped: false,
    listenSeconds: 0,
    createdAt: new Date(NOW),
    ...extra,
  };
}

describe("generated playlist helpers", () => {
  it("caps tracks per artist without dropping the requested count", () => {
    const artists = ["A", "B", "C", "D", "E"];
    const candidates = artists.flatMap((artist, ai) =>
      [0, 1, 2, 3].map((i) => ({ track: track(ai * 10 + i, artist), score: 100 - i })),
    );

    const selected = selectDiverseTracks(candidates, {
      count: 6,
      maxPerArtist: 2,
      seed: "seed",
    });

    expect(selected).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const t of selected) counts.set(t.artistName, (counts.get(t.artistName) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("is deterministic for the same seed and varies with another seed", () => {
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      track: track(i, `Artist ${i % 10}`),
      score: 50,
    }));

    const a = selectDiverseTracks(candidates, { count: 10, seed: "daily:2026-10-31" });
    const b = selectDiverseTracks(candidates, { count: 10, seed: "daily:2026-10-31" });
    const c = selectDiverseTracks(candidates, { count: 10, seed: "daily:2026-11-01" });

    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(a.map((t) => t.id)).not.toEqual(c.map((t) => t.id));
  });

  it("weights listen events and drops immediate skips", () => {
    const counts = aggregatePlays([
      listenRow(1, "A", { completed: true }),
      listenRow(2, "A", { skipped: true, listenSeconds: 0 }),
      listenRow(3, "B", { skipped: true, listenSeconds: 45 }),
      listenRow(4, "C", { listenSeconds: 0 }),
    ]);

    expect(counts.get(1)).toBe(3);
    expect(counts.has(2)).toBe(false);
    expect(counts.get(3)).toBe(2);
    expect(counts.get(4)).toBe(1);
  });

  it("detects new releases inside the radar window", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(isNewRelease(NOW - 3 * day, NOW)).toBe(true);
    expect(isNewRelease(NOW - 60 * day, NOW)).toBe(false);
    expect(isNewRelease(0, NOW)).toBe(false);
  });
});

describe("Daily Mix v2", () => {
  const artistNames = Array.from({ length: 30 }, (_, i) => `Artist ${String(i + 1).padStart(2, "0")}`);
  const catalog = artistNames.flatMap((artist, ai) =>
    [0, 1, 2, 3].map((i) => track(ai * 10 + i + 1, artist)),
  );

  const signals = artistNames.slice(0, 8).map((artistName, i) => ({
    artistName,
    createdAt: new Date(NOW - i * 60 * 1000),
    completed: true,
    skipped: false,
    listenSeconds: 200,
    genre: "rock",
    region: "eu",
    language: "eu",
  }));

  const graph = buildGraph(
    signals,
    artistNames.map((artistName) => ({
      artistName,
      artistId: null,
      genre: "rock",
      region: "eu",
      language: "eu",
      playCount: 100,
    })),
  );

  const ctx = {
    syncKey: "test",
    seed: "daily:2026-10-31",
    catalog,
    catalogCreatedAt: new Map(catalog.map((t) => [t.id, NOW])),
    events: signals.map((signal, i) => listenRow(i + 1, signal.artistName, { completed: true })),
    likedTrackIds: new Set<number>(),
    followedArtistNames: new Set<string>(),
    taste: {
      preferences: {},
      preferredGenres: ["rock"],
      preferredRegions: ["eu"],
      favoriteArtists: [],
      energy: 3,
      discoveryMode: "balanced",
      eras: [],
      languagePreference: "multilingual",
      moods: [],
      likedTrackIds: new Set<number>(),
      followedArtistIds: new Set<number>(),
      followedArtistNames: new Set<string>(),
      savedAlbumIds: new Set<number>(),
      likedTracksCount: 0,
      swipeLikesCount: 0,
      swipeDislikesCount: 0,
      recentListenedTrackIds: new Set<number>(),
      recentArtists: artistNames.slice(0, 8),
      recentGenres: ["rock"],
    },
    graph,
    artistPlays: graph.plays,
    topArtists: artistNames.slice(0, 8),
    recentTrackIds: new Set<number>([1, 2, 3]),
  } as unknown as GenerationContext;

  it("always produces six artist-cluster mixes", () => {
    const mixes = buildDailyMixes(ctx);
    expect(mixes).toHaveLength(DAILY_MIX_COUNT);
    expect(mixes.map((mix) => mix.id)).toEqual([
      "daily-mix-1",
      "daily-mix-2",
      "daily-mix-3",
      "daily-mix-4",
      "daily-mix-5",
      "daily-mix-6",
    ]);
    for (const mix of mixes) {
      expect(mix.format).toBe("daily-mix");
      expect(mix.tracks.length).toBeGreaterThan(0);
      expect(new Set(mix.tracks.map((t) => t.id)).size).toBe(mix.tracks.length);
      expect(mix.description.length).toBeGreaterThan(0);
    }
  });

  it("is stable for a given daily seed", () => {
    const a = buildDailyMixes(ctx);
    const b = buildDailyMixes(ctx);
    expect(a.map((mix) => mix.tracks.map((t) => t.id))).toEqual(
      b.map((mix) => mix.tracks.map((t) => t.id)),
    );
  });

  it("anchors each mix on a different artist cluster", () => {
    const mixes = buildDailyMixes(ctx);
    const anchors = mixes.map((mix) => mix.genre);
    expect(new Set(anchors).size).toBeGreaterThan(3);
  });
});
