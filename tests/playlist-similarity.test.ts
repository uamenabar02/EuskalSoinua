import { describe, it, expect } from "vitest";
import {
  buildCoPlayEdges,
  buildGraph,
  clusterArtists,
  combineSimilarity,
  genreSimilarity,
  normalizeArtistName,
  pairKey,
  rankSimilarArtists,
  seededFloat,
} from "@/lib/playlists/similarity";

const NOW = Date.now();
const MINUTE = 60 * 1000;

function signal(artistName: string, minutesAgo: number, extra: Record<string, unknown> = {}) {
  return {
    artistName,
    createdAt: new Date(NOW - minutesAgo * MINUTE),
    completed: true,
    skipped: false,
    listenSeconds: 180,
    genre: "rock",
    region: "eu",
    language: "eu",
    ...extra,
  };
}

function catalogRow(artistName: string, genre: string, region = "eu", language = "eu") {
  return { artistName, artistId: null, genre, region, language, playCount: 10 };
}

describe("artist name normalization", () => {
  it("folds accents, featured credits and punctuation", () => {
    expect(normalizeArtistName("Rosalía")).toBe("rosalia");
    expect(normalizeArtistName("Bengo feat. Tatta")).toBe("bengo");
    expect(normalizeArtistName("ZETAK & Bomba Estéreo")).toBe("zetak and bomba estereo");
    expect(normalizeArtistName("  En Tol Sarmiento  ")).toBe("en tol sarmiento");
  });

  it("builds an order-independent pair key", () => {
    expect(pairKey("Alpha", "Beta")).toBe(pairKey("Beta", "Alpha"));
  });
});

describe("session co-play graph", () => {
  it("only links artists inside the same 30-minute session", () => {
    const { edges, plays } = buildCoPlayEdges([
      signal("Alpha", 60),
      signal("Beta", 55),
      signal("Gamma", 600), // much earlier → different session
    ]);

    expect(edges.get(pairKey("Alpha", "Beta"))).toBeGreaterThan(0);
    expect(edges.get(pairKey("Alpha", "Gamma"))).toBeUndefined();
    expect(plays.get("alpha")).toBeGreaterThan(0);
  });

  it("does not inflate an edge when the same artist repeats in a session", () => {
    const single = buildCoPlayEdges([signal("Alpha", 10), signal("Beta", 5)]);
    const repeated = buildCoPlayEdges([
      signal("Alpha", 10),
      signal("Alpha", 9),
      signal("Alpha", 8),
      signal("Beta", 5),
    ]);

    expect(repeated.edges.get(pairKey("Alpha", "Beta"))).toBeCloseTo(
      single.edges.get(pairKey("Alpha", "Beta")) ?? 0,
      6,
    );
  });
});

describe("similarity scoring", () => {
  it("computes genre Jaccard overlap", () => {
    expect(genreSimilarity("rock / punk", "punk")).toBeGreaterThan(0);
    expect(genreSimilarity("rock", "jazz")).toBe(0);
    expect(genreSimilarity(null, "rock")).toBe(0);
  });

  it("combines weighted features into 0..1", () => {
    expect(
      combineSimilarity({ coPlay: 1, genre: 1, region: 1, language: 1, curated: 1 }),
    ).toBeCloseTo(1, 6);
    expect(
      combineSimilarity({ coPlay: 0, genre: 0, region: 0, language: 0, curated: 0 }),
    ).toBe(0);
  });

  it("ranks same-scene artists above unrelated ones", () => {
    const graph = buildGraph(
      [signal("Alpha", 10), signal("Delta", 5)],
      [
        catalogRow("Alpha", "rock punk"),
        catalogRow("Delta", "rock punk"),
        catalogRow("Zeta", "jazz", "global", "en"),
      ],
    );

    const ranked = rankSimilarArtists(graph, "Alpha", { limit: 5 });
    const delta = ranked.find((entry) => entry.key === "delta");
    const zeta = ranked.find((entry) => entry.key === "zeta");

    expect(delta).toBeDefined();
    expect(zeta).toBeDefined();
    expect(delta!.score).toBeGreaterThan(zeta!.score);
  });

  it("clusters seeds with their neighbours without duplicates", () => {
    const graph = buildGraph(
      [signal("Alpha", 10), signal("Delta", 5)],
      [catalogRow("Alpha", "rock punk"), catalogRow("Delta", "rock punk")],
    );

    const clusters = clusterArtists(graph, ["Alpha", "Delta"], {
      maxClusters: 2,
      maxMembers: 3,
      minScore: 0.1,
    });

    expect(clusters).toHaveLength(2);
    const flat = clusters.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("produces deterministic floats for a seed", () => {
    expect(seededFloat("seed", 1)).toBe(seededFloat("seed", 1));
    expect(seededFloat("seed", 1)).not.toBe(seededFloat("other", 1));
  });
});
