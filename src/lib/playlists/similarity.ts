import "server-only";
import { db } from "@/db";
import { listenEvents, tracks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { CURATED_RELATED_ARTISTS } from "@/lib/playlists/curated-artists";

/**
 * ARTIST SIMILARITY CORE
 * ----------------------------------------------------------------------------
 * Single source of truth for "what sounds like this?" across the app.
 *
 * Signals, in order of confidence:
 *   1. Session co-play  — artists that appear together in the same listening
 *                         session (gap <= 30 min), weighted by completion.
 *   2. Genre proximity  — token overlap between normalized genre strings.
 *   3. Region/language  — same regional scene / same language.
 *   4. Curated fallback — hand-maintained affinities (low weight).
 *
 * The pure functions are exported separately from the DB-backed helpers so the
 * ranking can be exercised in unit tests without a database.
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const FEATURED_SUFFIX =
  /\s+(?:feat\.?|ft\.?|featuring|with|con|vs\.?)\s+.*$/i;

/** Lowercase, accent-fold, strip featured credits and punctuation. */
export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(FEATURED_SUFFIX, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical undirected key for an artist pair. */
export function pairKey(a: string, b: string): string {
  const na = normalizeArtistName(a);
  const nb = normalizeArtistName(b);
  return na <= nb ? `${na}\u0000${nb}` : `${nb}\u0000${na}`;
}

// Curated affinities indexed by normalized name (built once at module load).
const CURATED_INDEX = new Map<string, Set<string>>();
const CURATED_DISPLAY = new Map<string, string>();
for (const [artist, related] of Object.entries(CURATED_RELATED_ARTISTS)) {
  const key = normalizeArtistName(artist);
  CURATED_INDEX.set(key, new Set(related.map(normalizeArtistName).filter(Boolean)));
  CURATED_DISPLAY.set(key, artist);
  for (const name of related) {
    const relatedKey = normalizeArtistName(name);
    if (relatedKey && !CURATED_DISPLAY.has(relatedKey)) CURATED_DISPLAY.set(relatedKey, name);
  }
}

export function isCuratedRelated(a: string, b: string): boolean {
  return CURATED_INDEX.get(normalizeArtistName(a))?.has(normalizeArtistName(b)) ?? false;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export interface ListenSignal {
  artistName: string;
  createdAt: Date | number;
  completed?: boolean;
  skipped?: boolean;
  listenSeconds?: number;
  genre?: string | null;
  region?: string | null;
  language?: string | null;
}

export interface ArtistProfile {
  /** Display name as seen in the catalog (first occurrence wins). */
  name: string;
  key: string;
  genre: string | null;
  region: string;
  language: string;
  plays: number;
  artistId: number | null;
}

export interface ArtistSimilarityGraph {
  profiles: Map<string, ArtistProfile>;
  /** pairKey -> session co-occurrence weight. */
  edges: Map<string, number>;
  /** normalized artist key -> number of weighted plays. */
  plays: Map<string, number>;
  builtAt: number;
}

export const SESSION_GAP_MS = 30 * 60 * 1000;

function eventTime(value: Date | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Groups a listen feed into sessions and counts how often two artists are
 * played together. Within a session each artist counts once, so a loop of the
 * same album does not inflate the edge.
 */
export function buildCoPlayEdges(signals: ListenSignal[]): {
  edges: Map<string, number>;
  plays: Map<string, number>;
} {
  const edges = new Map<string, number>();
  const plays = new Map<string, number>();
  if (signals.length === 0) return { edges, plays };

  const ordered = [...signals].sort((a, b) => eventTime(a.createdAt) - eventTime(b.createdAt));

  let session: ListenSignal[] = [];
  let lastTime = 0;

  const flush = () => {
    if (session.length < 2) {
      session = [];
      return;
    }
    const byArtist = new Map<string, ListenSignal>();
    for (const signal of session) {
      const key = normalizeArtistName(signal.artistName);
      if (!key) continue;
      const previous = byArtist.get(key);
      // Keep the strongest signal per artist within the session.
      if (!previous || signalWeight(signal) > signalWeight(previous)) {
        byArtist.set(key, signal);
      }
    }
    const entries = Array.from(byArtist.entries());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [keyA, sigA] = entries[i];
        const [keyB, sigB] = entries[j];
        const weight = 0.5 + (signalWeight(sigA) + signalWeight(sigB)) / 2;
        const key = pairKey(keyA, keyB);
        edges.set(key, (edges.get(key) ?? 0) + weight);
      }
    }
    session = [];
  };

  for (const signal of ordered) {
    if (!signal.artistName || !signal.artistName.trim()) continue;
    const time = eventTime(signal.createdAt);
    if (session.length > 0 && time - lastTime > SESSION_GAP_MS) flush();
    session.push(signal);
    lastTime = time;

    const key = normalizeArtistName(signal.artistName);
    if (key) plays.set(key, (plays.get(key) ?? 0) + signalWeight(signal));
  }
  flush();

  return { edges, plays };
}

function signalWeight(signal: ListenSignal): number {
  if (signal.skipped && (signal.listenSeconds ?? 0) <= 5) return 0.1;
  if (signal.completed) return 1;
  if ((signal.listenSeconds ?? 0) > 30) return 0.7;
  return 0.4;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface SimilarityFeatures {
  /** Dice-style session co-occurrence, 0..1. */
  coPlay: number;
  /** Genre token Jaccard, 0..1. */
  genre: number;
  /** Same regional scene, 0..1. */
  region: number;
  /** Same language, 0..1. */
  language: number;
  /** Curated affinity, 0 or 1. */
  curated: number;
}

export const SIMILARITY_WEIGHTS = {
  coPlay: 0.4,
  genre: 0.2,
  region: 0.1,
  language: 0.05,
  curated: 0.25,
} as const;

/** Weighted blend of every signal, clamped to 0..1. */
export function combineSimilarity(features: SimilarityFeatures): number {
  const score =
    SIMILARITY_WEIGHTS.coPlay * clamp01(features.coPlay) +
    SIMILARITY_WEIGHTS.genre * clamp01(features.genre) +
    SIMILARITY_WEIGHTS.region * clamp01(features.region) +
    SIMILARITY_WEIGHTS.language * clamp01(features.language) +
    SIMILARITY_WEIGHTS.curated * clamp01(features.curated);
  return clamp01(score);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function genreTokens(genre: string | null | undefined): Set<string> {
  if (!genre) return new Set();
  return new Set(
    genre
      .toLowerCase()
      .split(/[\/,|&+-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2),
  );
}

/** Jaccard similarity over normalized genre tokens. */
export function genreSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const setA = genreTokens(a);
  const setB = genreTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface ScoredArtist {
  name: string;
  key: string;
  score: number;
  features: SimilarityFeatures;
}

/**
 * Ranks every known artist against `artistKey`. Pure: operates on the graph
 * only, so it is cheap and deterministic.
 */
export function rankSimilarArtists(
  graph: ArtistSimilarityGraph,
  artistKey: string,
  opts: { limit?: number; exclude?: Iterable<string> } = {},
): ScoredArtist[] {
  const key = normalizeArtistName(artistKey);
  if (!key) return [];
  const source = graph.profiles.get(key);
  const excluded = new Set<string>([key]);
  for (const name of opts.exclude ?? []) excluded.add(normalizeArtistName(name));

  const sourcePlays = graph.plays.get(key) ?? 0;
  const results: ScoredArtist[] = [];

  // Candidates: every known profile, plus curated affinities that have no
  // catalog presence yet (so a cold start still returns sensible neighbours).
  const candidates = new Map<string, ArtistProfile>(graph.profiles);
  for (const curatedKey of CURATED_INDEX.get(key) ?? []) {
    if (candidates.has(curatedKey)) continue;
    candidates.set(curatedKey, {
      name: CURATED_DISPLAY.get(curatedKey) ?? curatedKey,
      key: curatedKey,
      genre: null,
      region: "global",
      language: "und",
      plays: 0,
      artistId: null,
    });
  }

  for (const [candidateKey, profile] of candidates) {
    if (excluded.has(candidateKey)) continue;

    const coPlayCount = graph.edges.get(pairKey(key, candidateKey)) ?? 0;
    const candidatePlays = graph.plays.get(candidateKey) ?? profile.plays ?? 0;
    const denominator = Math.sqrt(Math.max(sourcePlays, 1) * Math.max(candidatePlays, 1));
    const features: SimilarityFeatures = {
      coPlay: coPlayCount === 0 ? 0 : Math.min(1, coPlayCount / Math.max(denominator, 1)),
      genre: source ? genreSimilarity(source.genre, profile.genre) : 0,
      region:
        source && profile.region
          ? source.region === profile.region
            ? 1
            : source.region === "global" || profile.region === "global"
              ? 0.15
              : 0
          : 0,
      language:
        source && profile.language && profile.language !== "und"
          ? source.language === profile.language
            ? 1
            : 0
          : 0,
      curated: isCuratedRelated(key, candidateKey) ? 1 : 0,
    };

    results.push({
      name: profile.name,
      key: candidateKey,
      score: combineSimilarity(features),
      features,
    });
  }

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return typeof opts.limit === "number" ? results.slice(0, opts.limit) : results;
}

/**
 * Artist clustering: every seed anchors its OWN cluster (so each Daily Mix has
 * a distinct identity), then the cluster grows with the most similar artists
 * that are not already claimed by another cluster.
 */
export function clusterArtists(
  graph: ArtistSimilarityGraph,
  seeds: string[],
  opts: { maxClusters?: number; maxMembers?: number; minScore?: number } = {},
): string[][] {
  const maxClusters = opts.maxClusters ?? 6;
  const maxMembers = opts.maxMembers ?? 6;
  const minScore = opts.minScore ?? 0.18;

  const anchors: string[] = [];
  const seenAnchors = new Set<string>();
  for (const seed of seeds) {
    if (anchors.length >= maxClusters) break;
    const key = normalizeArtistName(seed);
    if (!key || seenAnchors.has(key)) continue;
    seenAnchors.add(key);
    anchors.push(key);
  }

  const assigned = new Set<string>(anchors);
  const clusters: string[][] = [];

  for (const anchor of anchors) {
    const members = [anchor];
    const ranked = rankSimilarArtists(graph, anchor, {
      limit: maxMembers * 4,
      exclude: anchors,
    });
    for (const candidate of ranked) {
      if (members.length >= maxMembers) break;
      if (candidate.score < minScore) break;
      if (assigned.has(candidate.key)) continue;
      assigned.add(candidate.key);
      members.push(candidate.key);
    }
    clusters.push(members);
  }

  return clusters;
}

/** Deterministic hash → 0..1 float, used for seeded jitter. */
export function seededFloat(seed: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------

const GRAPH_TTL_MS = 10 * 60 * 1000;
let graphCache: { syncKey: string; builtAt: number; graph: ArtistSimilarityGraph } | null = null;

interface CatalogRow {
  artistName: string;
  artistId: number | null;
  genre: string | null;
  region: string | null;
  language: string | null;
  playCount: number | null;
}

/** Builds (and memoizes ~10 min) the artist graph for a sync key. */
export async function getArtistSimilarityGraph(
  syncKey = "default",
  force = false,
): Promise<ArtistSimilarityGraph> {
  const now = Date.now();
  if (!force && graphCache && graphCache.syncKey === syncKey && now - graphCache.builtAt < GRAPH_TTL_MS) {
    return graphCache.graph;
  }

  const [eventRows, catalogRows] = await Promise.all([
    db
      .select({
        artistName: tracks.artistName,
        createdAt: listenEvents.createdAt,
        completed: listenEvents.completed,
        skipped: listenEvents.skipped,
        listenSeconds: listenEvents.listenSeconds,
        genre: tracks.genre,
        region: tracks.region,
        language: tracks.language,
      })
      .from(listenEvents)
      .innerJoin(tracks, eq(listenEvents.trackId, tracks.id))
      .where(eq(listenEvents.syncKey, syncKey))
      .orderBy(desc(listenEvents.createdAt))
      .limit(800),
    db
      .select({
        artistName: tracks.artistName,
        artistId: tracks.artistId,
        genre: tracks.genre,
        region: tracks.region,
        language: tracks.language,
        playCount: tracks.playCount,
      })
      .from(tracks)
      .orderBy(desc(tracks.playCount))
      .limit(1500),
  ]);

  const graph = buildGraph(
    (eventRows as ListenSignal[]) ?? [],
    (catalogRows as CatalogRow[]) ?? [],
  );
  graphCache = { syncKey, builtAt: now, graph };
  return graph;
}

/** Pure graph construction from already-loaded rows. */
export function buildGraph(
  signals: ListenSignal[],
  catalog: CatalogRow[],
): ArtistSimilarityGraph {
  const profiles = new Map<string, ArtistProfile>();
  const { edges, plays } = buildCoPlayEdges(signals);

  for (const key of plays.keys()) {
    if (!profiles.has(key)) {
      profiles.set(key, {
        name: key,
        key,
        genre: null,
        region: "global",
        language: "und",
        plays: plays.get(key) ?? 0,
        artistId: null,
      });
    }
  }

  for (const row of catalog) {
    const key = normalizeArtistName(row.artistName ?? "");
    if (!key) continue;
    const existing = profiles.get(key);
    if (existing) {
      existing.genre = existing.genre ?? row.genre ?? null;
      existing.region = row.region ?? existing.region;
      existing.language = row.language ?? existing.language;
      existing.artistId = existing.artistId ?? row.artistId ?? null;
      if (!existing.name || existing.name === key) existing.name = row.artistName;
    } else {
      profiles.set(key, {
        name: row.artistName,
        key,
        genre: row.genre ?? null,
        region: row.region ?? "global",
        language: row.language ?? "und",
        plays: 0,
        artistId: row.artistId ?? null,
      });
    }
  }

  return { profiles, edges, plays, builtAt: Date.now() };
}

export interface SimilarArtistOptions {
  syncKey?: string;
  limit?: number;
  exclude?: Iterable<string>;
  graph?: ArtistSimilarityGraph;
}

/** Top-N artists similar to `artistName`, using the behavioural graph. */
export async function getSimilarArtists(
  artistName: string,
  opts: SimilarArtistOptions = {},
): Promise<string[]> {
  const graph = opts.graph ?? (await getArtistSimilarityGraph(opts.syncKey ?? "default"));
  return rankSimilarArtists(graph, artistName, {
    limit: opts.limit ?? 10,
    exclude: opts.exclude,
  }).map((entry) => entry.name);
}

/** Same as above but keeps the score, for UI copy ("With A, B and more"). */
export async function getSimilarArtistsScored(
  artistName: string,
  opts: SimilarArtistOptions = {},
): Promise<ScoredArtist[]> {
  const graph = opts.graph ?? (await getArtistSimilarityGraph(opts.syncKey ?? "default"));
  return rankSimilarArtists(graph, artistName, {
    limit: opts.limit ?? 10,
    exclude: opts.exclude,
  });
}

/**
 * Artists related to a seed track: blends the track's artist similarity with
 * co-play partners of the exact track, so "Song Radio" differs from "Artist
 * Radio" on the same seed.
 */
export async function getSimilarArtistsForTrack(
  track: { artistName: string; genre?: string | null },
  opts: SimilarArtistOptions = {},
): Promise<string[]> {
  const graph = opts.graph ?? (await getArtistSimilarityGraph(opts.syncKey ?? "default"));
  return rankSimilarArtists(graph, track.artistName, {
    limit: opts.limit ?? 10,
    exclude: opts.exclude,
  }).map((entry) => entry.name);
}
