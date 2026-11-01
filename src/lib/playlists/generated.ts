import "server-only";
import { db } from "@/db";
import { tracks, listenEvents, likedTracks, followedArtists, artists } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";
import { getExpandedUserTasteProfile } from "@/lib/taste-profile";
import {
  clusterArtists,
  getArtistSimilarityGraph,
  normalizeArtistName,
  rankSimilarArtists,
  seededFloat,
  type ArtistSimilarityGraph,
} from "@/lib/playlists/similarity";
import {
  buildFormatDescription,
  buildFormatTitle,
  generatedPlaylistId,
  parseGeneratedPlaylistId,
  refreshSeed,
  type PlaylistFormat,
} from "@/lib/playlists/format-registry";

/**
 * GENERATED PLAYLISTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Spotify-style algorithmic playlists produced entirely on-device: no external
 * AI call is ever made from this module. Every builder is deterministic for a
 * given (syncKey, seed) pair, so the same day/week produces the same playlist.
 */

export interface GeneratedPlaylist {
  id: string;
  format: PlaylistFormat;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  genre: string;
  tracks: Track[];
  /** Deterministic id for impression de-duplication. */
  requestId: string;
  trackCount: number;
}

const MIX_COLORWAYS = [
  "from-emerald-600/50 via-teal-900/40 to-black/90",
  "from-violet-600/50 via-purple-900/40 to-black/90",
  "from-amber-600/50 via-orange-900/40 to-black/90",
  "from-rose-600/50 via-red-900/40 to-black/90",
  "from-cyan-600/50 via-blue-900/40 to-black/90",
  "from-indigo-600/50 via-slate-900/40 to-black/90",
];

const ENERGETIC_GENRES = [
  "punk",
  "rock",
  "metal",
  "dance",
  "electronic",
  "synth",
  "house",
  "techno",
  "rap",
  "hip-hop",
  "hip hop",
  "trap",
  "drum",
  "edm",
  "pop",
];

const CALM_GENRES = ["acoustic", "folk", "ambient", "ballad", "piano", "classical", "chill"];

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYLIST_TTL_MS = 5 * 60 * 1000;

/**
 * Short-lived in-memory cache so repeated home renders / playlist opens do not
 * recompute the same deterministic payload. Keyed by sync key + refresh seed.
 */
const playlistCache = new Map<string, { at: number; value: GeneratedPlaylist[] }>();

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ListenRow {
  trackId: number;
  artistName: string;
  genre: string | null;
  region: string | null;
  language: string | null;
  completed: boolean;
  skipped: boolean;
  listenSeconds: number;
  createdAt: Date | string;
}

export interface GenerationContext {
  syncKey: string;
  seed: string;
  catalog: Track[];
  catalogCreatedAt: Map<number, number>;
  events: ListenRow[];
  likedTrackIds: Set<number>;
  followedArtistNames: Set<string>;
  taste: Awaited<ReturnType<typeof getExpandedUserTasteProfile>>;
  graph: ArtistSimilarityGraph;
  artistPlays: Map<string, number>;
  topArtists: string[];
  recentTrackIds: Set<number>;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Loads everything the builders need with a single round of queries. */
export async function loadGenerationContext(
  syncKey = "default",
  seed?: string,
): Promise<GenerationContext> {
  const [catalogRows, eventRows, likedRows, followedRows, taste, graph] = await Promise.all([
    db.select().from(tracks).orderBy(desc(tracks.playCount)).limit(1500),
    db
      .select({
        trackId: listenEvents.trackId,
        artistName: tracks.artistName,
        genre: tracks.genre,
        region: tracks.region,
        language: tracks.language,
        completed: listenEvents.completed,
        skipped: listenEvents.skipped,
        listenSeconds: listenEvents.listenSeconds,
        createdAt: listenEvents.createdAt,
      })
      .from(listenEvents)
      .innerJoin(tracks, eq(listenEvents.trackId, tracks.id))
      .where(eq(listenEvents.syncKey, syncKey))
      .orderBy(desc(listenEvents.createdAt))
      .limit(1000),
    db
      .select({ trackId: likedTracks.trackId })
      .from(likedTracks)
      .where(eq(likedTracks.syncKey, syncKey)),
    db
      .select({ name: artists.name })
      .from(followedArtists)
      .innerJoin(artists, eq(followedArtists.artistId, artists.id))
      .where(eq(followedArtists.syncKey, syncKey)),
    getExpandedUserTasteProfile(syncKey),
    getArtistSimilarityGraph(syncKey),
  ]);

  const catalogRowsTyped = catalogRows as Array<Parameters<typeof mapTrack>[0] & { createdAt?: Date | string }>;
  const catalog = catalogRowsTyped.map(mapTrack);
  const catalogCreatedAt = new Map<number, number>();
  for (const row of catalogRowsTyped) {
    catalogCreatedAt.set(row.id, row.createdAt ? toTime(row.createdAt) : 0);
  }

  const events = (eventRows as ListenRow[]) ?? [];
  const recentTrackIds = new Set(events.map((e) => e.trackId));

  const topArtists = rankTopArtists(graph, catalog, taste, events);

  return {
    syncKey,
    seed: seed ?? refreshSeed("daily"),
    catalog,
    catalogCreatedAt,
    events,
    likedTrackIds: new Set((likedRows as Array<{ trackId: number }>).map((r) => r.trackId)),
    followedArtistNames: new Set(
      (followedRows as Array<{ name: string }>).map((r) => normalizeArtistName(r.name)).filter(Boolean),
    ),
    taste,
    graph,
    artistPlays: graph.plays,
    topArtists,
    recentTrackIds,
  };
}

/** Ranks the user's artists by weighted plays, then taste, then catalog size. */
export function rankTopArtists(
  graph: ArtistSimilarityGraph,
  catalog: Track[],
  taste: { recentArtists?: string[]; favoriteArtists?: string[] },
  events: ListenRow[],
  limit = 12,
): string[] {
  const scores = new Map<string, number>();
  const display = new Map<string, string>();

  const bump = (name: string, amount: number) => {
    const key = normalizeArtistName(name);
    if (!key) return;
    scores.set(key, (scores.get(key) ?? 0) + amount);
    if (!display.has(key)) display.set(key, name);
  };

  for (const [key, plays] of graph.plays) {
    scores.set(key, (scores.get(key) ?? 0) + plays);
    const profile = graph.profiles.get(key);
    if (profile && !display.has(key)) display.set(key, profile.name);
  }
  for (const name of taste.recentArtists ?? []) bump(name, 1.5);
  for (const name of taste.favoriteArtists ?? []) bump(name, 2.5);
  for (const event of events) {
    if (event.completed) bump(event.artistName, 1);
  }
  for (const track of catalog.slice(0, 300)) {
    bump(track.artistName, (track.playCount ?? 0) / 5000);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => display.get(key) ?? key)
    .filter(Boolean)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic, artist-capped selection. `jitter` adds seeded variety so the
 * same playlist rotates when its refresh seed changes, without ever using
 * Math.random().
 */
export function selectDiverseTracks(
  candidates: Array<{ track: Track; score: number }>,
  opts: {
    count: number;
    maxPerArtist?: number;
    seed?: string;
    salt?: number;
    jitter?: number;
  },
): Track[] {
  const maxPerArtist = opts.maxPerArtist ?? 2;
  const jitter = opts.jitter ?? 30;
  const seed = opts.seed ?? "seed";

  const scored = candidates
    .map((candidate) => ({
      track: candidate.track,
      score:
        candidate.score +
        seededFloat(`${seed}:${opts.salt ?? 0}:${candidate.track.id}`, 11) * jitter,
    }))
    .sort((a, b) => b.score - a.score || a.track.id - b.track.id);

  const out: Track[] = [];
  const seen = new Set<number>();
  const perArtist = new Map<string, number>();

  for (const { track } of scored) {
    if (out.length >= opts.count) break;
    if (seen.has(track.id)) continue;
    const key = normalizeArtistName(track.artistName);
    const used = perArtist.get(key) ?? 0;
    if (used >= maxPerArtist) continue;
    perArtist.set(key, used + 1);
    seen.add(track.id);
    out.push(track);
  }

  // Relax the artist cap only if we could not fill the playlist.
  if (out.length < opts.count) {
    for (const { track } of scored) {
      if (out.length >= opts.count) break;
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      out.push(track);
    }
  }

  return out;
}

/** Alternates familiar and discovery tracks so mixes do not feel blocky. */
export function interleaveFamiliar(selected: Track[], familiarIds: Set<number>): Track[] {
  const familiar = selected.filter((t) => familiarIds.has(t.id));
  const discovery = selected.filter((t) => !familiarIds.has(t.id));
  const out: Track[] = [];
  let fi = 0;
  let di = 0;
  while (fi < familiar.length || di < discovery.length) {
    if (fi < familiar.length) out.push(familiar[fi++]);
    if (di < discovery.length) out.push(discovery[di++]);
    if (di < discovery.length) out.push(discovery[di++]);
  }
  return out;
}

/** Weighted per-track play counts from listen events. */
export function aggregatePlays(events: ListenRow[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const event of events) {
    if (event.skipped && event.listenSeconds <= 5) continue;
    const weight = event.completed ? 3 : event.listenSeconds > 30 ? 2 : 1;
    counts.set(event.trackId, (counts.get(event.trackId) ?? 0) + weight);
  }
  return counts;
}

function catalogById(catalog: Track[]): Map<number, Track> {
  return new Map(catalog.map((track) => [track.id, track]));
}

function popularityPrior(track: Track): number {
  return Math.log10((track.playCount ?? 0) + 1) * 3;
}

function topArtistNames(list: Track[]): string[] {
  return Array.from(new Set(list.map((t) => t.artistName).filter(Boolean)));
}

function similarityToSeeds(
  graph: ArtistSimilarityGraph,
  seeds: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const seed of seeds.slice(0, 3)) {
    for (const entry of rankSimilarArtists(graph, seed, { limit: 60 })) {
      map.set(entry.key, Math.max(map.get(entry.key) ?? 0, entry.score));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Daily Mix — artist-cluster anchored (6 mixes, no forced Basque slot)
// ---------------------------------------------------------------------------

export const DAILY_MIX_COUNT = 6;

export function buildDailyMixes(ctx: GenerationContext): GeneratedPlaylist[] {
  const seeds = ctx.topArtists.length > 0 ? [...ctx.topArtists] : [];
  const used = new Set<string>();

  const clusters = clusterArtists(ctx.graph, seeds, {
    maxClusters: DAILY_MIX_COUNT,
    maxMembers: 5,
    minScore: 0.16,
  });
  for (const cluster of clusters) for (const member of cluster) used.add(member);

  // Fill missing clusters deterministically from the catalog's strongest
  // artists so the user always gets six mixes, even with a thin history.
  const fallbackSeeds = ctx.catalog
    .slice(0, 300)
    .map((t) => t.artistName)
    .filter((name) => {
      const key = normalizeArtistName(name);
      return key && !used.has(key);
    });
  for (const name of fallbackSeeds) {
    if (clusters.length >= DAILY_MIX_COUNT) break;
    const key = normalizeArtistName(name);
    if (used.has(key)) continue;
    used.add(key);
    const members = [key];
    for (const entry of rankSimilarArtists(ctx.graph, key, { limit: 4 })) {
      if (members.length >= 4) break;
      if (entry.score < 0.12) break;
      if (used.has(entry.key)) continue;
      used.add(entry.key);
      members.push(entry.key);
    }
    clusters.push(members);
  }

  const mixes: GeneratedPlaylist[] = [];

  clusters.slice(0, DAILY_MIX_COUNT).forEach((cluster, index) => {
    const memberSet = new Set(cluster);
    const expanded = new Set(memberSet);
    for (const member of cluster) {
      for (const entry of rankSimilarArtists(ctx.graph, member, { limit: 4 })) {
        if (entry.score >= 0.2) expanded.add(entry.key);
      }
    }

    let pool = ctx.catalog.filter((t) => memberSet.has(normalizeArtistName(t.artistName)));
    if (pool.length < 12) {
      pool = ctx.catalog.filter((t) => expanded.has(normalizeArtistName(t.artistName)));
    }
    if (pool.length < 6) {
      pool = ctx.catalog.slice(0, 150);
    }

    const familiarIds = new Set<number>();
    const candidates = pool.map((track) => {
      const key = normalizeArtistName(track.artistName);
      const isFamiliar =
        ctx.recentTrackIds.has(track.id) || ctx.likedTrackIds.has(track.id);
      if (isFamiliar) familiarIds.add(track.id);
      let score = popularityPrior(track);
      if (ctx.recentTrackIds.has(track.id)) score += 30;
      if (ctx.likedTrackIds.has(track.id)) score += 25;
      score += Math.min(ctx.artistPlays.get(key) ?? 0, 19) * 1.5;
      if (memberSet.has(key)) score += 18;
      else if (expanded.has(key)) score += 6;
      return { track, score };
    });

    const selected = selectDiverseTracks(candidates, {
      count: 30,
      maxPerArtist: 2,
      seed: `${ctx.seed}:daily:${index}`,
      jitter: 28,
    });
    const ordered = interleaveFamiliar(selected, familiarIds);
    const displayArtists = topArtistNames(ordered);
    const anchor = ctx.graph.profiles.get(cluster[0])?.name ?? displayArtists[0] ?? "your taste";

    mixes.push({
      id: generatedPlaylistId("daily-mix", { index: index + 1 }),
      format: "daily-mix",
      title: buildFormatTitle("daily-mix", { index: index + 1 }),
      subtitle: displayArtists.slice(0, 4).join(", "),
      description: buildFormatDescription("daily-mix", { artists: displayArtists }),
      accentColor: MIX_COLORWAYS[index % MIX_COLORWAYS.length],
      genre: anchor,
      tracks: ordered,
      requestId: `${ctx.seed}:daily-mix:${index + 1}`,
      trackCount: ordered.length,
    });
  });

  return mixes.filter((mix) => mix.tracks.length > 0);
}

// ---------------------------------------------------------------------------
// Discover Weekly
// ---------------------------------------------------------------------------

export function buildDiscoverWeekly(ctx: GenerationContext): GeneratedPlaylist {
  const heard = new Set<number>([...ctx.recentTrackIds, ...ctx.likedTrackIds]);
  const excludedGenres = (
    (ctx.taste.preferences as { excludedGenres?: string[] })?.excludedGenres ?? []
  ).map((g) => g.toLowerCase());

  const seeds = ctx.topArtists.slice(0, 3);
  const simToSeeds = similarityToSeeds(ctx.graph, seeds);
  const preferredGenres = ctx.taste.preferredGenres.map((g) => g.toLowerCase());

  const candidates = ctx.catalog
    .filter((track) => !heard.has(track.id))
    .filter((track) => {
      const genre = (track.genre ?? "").toLowerCase();
      if (!genre) return true;
      return !excludedGenres.some((excluded) => genre.includes(excluded));
    })
    .map((track) => {
      const key = normalizeArtistName(track.artistName);
      let score = popularityPrior(track) + (simToSeeds.get(key) ?? 0) * 55;
      const genre = (track.genre ?? "").toLowerCase();
      if (preferredGenres.some((preferred) => genre.includes(preferred))) score += 8;
      if (ctx.followedArtistNames.has(key)) score += 4;
      return { track, score };
    });

  const tracks = selectDiverseTracks(candidates, {
    count: 30,
    maxPerArtist: 1,
    seed: `${ctx.seed}:discover`,
    jitter: 12,
  });

  return {
    id: generatedPlaylistId("discover-weekly"),
    format: "discover-weekly",
    title: buildFormatTitle("discover-weekly"),
    subtitle: "New music picked for you",
    description: buildFormatDescription("discover-weekly"),
    accentColor: MIX_COLORWAYS[3],
    genre: "Discovery",
    tracks,
    requestId: `${refreshSeed("weekly")}:discover-weekly`,
    trackCount: tracks.length,
  };
}

// ---------------------------------------------------------------------------
// Release Radar
// ---------------------------------------------------------------------------

export const RELEASE_WINDOW_DAYS = 45;

export function isNewRelease(
  createdAt: number,
  now: number = Date.now(),
  windowDays: number = RELEASE_WINDOW_DAYS,
): boolean {
  if (!createdAt) return false;
  return now - createdAt <= windowDays * DAY_MS && createdAt <= now + DAY_MS;
}

export function buildReleaseRadar(ctx: GenerationContext, now = Date.now()): GeneratedPlaylist {
  const simToSeeds = similarityToSeeds(ctx.graph, ctx.topArtists.slice(0, 3));

  const fresh = ctx.catalog.filter((track) =>
    isNewRelease(ctx.catalogCreatedAt.get(track.id) ?? 0, now),
  );

  // Prefer artists the user follows/loves; fall back to the newest catalog
  // entries when nothing was ingested in the window.
  const pool = fresh.length >= 8 ? fresh : ctx.catalog.slice(0, 200);

  const candidates = pool.map((track) => {
    const key = normalizeArtistName(track.artistName);
    let score = popularityPrior(track) + (simToSeeds.get(key) ?? 0) * 30;
    if (ctx.followedArtistNames.has(key)) score += 12;
    const created = ctx.catalogCreatedAt.get(track.id) ?? 0;
    if (created) score += Math.max(0, 30 - (now - created) / DAY_MS);
    return { track, score };
  });

  const tracks = selectDiverseTracks(candidates, {
    count: 20,
    maxPerArtist: 2,
    seed: `${ctx.seed}:release`,
    jitter: 8,
  });

  // Newest first, mirroring Spotify's release ordering.
  tracks.sort(
    (a, b) =>
      (ctx.catalogCreatedAt.get(b.id) ?? 0) - (ctx.catalogCreatedAt.get(a.id) ?? 0),
  );

  return {
    id: generatedPlaylistId("release-radar"),
    format: "release-radar",
    title: buildFormatTitle("release-radar"),
    subtitle: "New releases from artists you follow",
    description: buildFormatDescription("release-radar"),
    accentColor: MIX_COLORWAYS[4],
    genre: "New releases",
    tracks,
    requestId: `${refreshSeed("weekly")}:release-radar`,
    trackCount: tracks.length,
  };
}

// ---------------------------------------------------------------------------
// On Repeat / Repeat Rewind
// ---------------------------------------------------------------------------

export function buildOnRepeat(ctx: GenerationContext, now = Date.now()): GeneratedPlaylist {
  const windowStart = now - 14 * DAY_MS;
  const recent = ctx.events.filter((event) => toTime(event.createdAt) >= windowStart);
  const counts = aggregatePlays(recent);
  const byId = catalogById(ctx.catalog);

  const candidates: Array<{ track: Track; score: number }> = [];
  for (const [trackId, count] of counts) {
    const track = byId.get(trackId);
    if (!track) continue;
    candidates.push({ track, score: count * 10 });
  }

  const tracks = selectDiverseTracks(candidates, {
    count: 25,
    maxPerArtist: 2,
    seed: `${ctx.seed}:on-repeat`,
    jitter: 2,
  });

  return {
    id: generatedPlaylistId("on-repeat"),
    format: "on-repeat",
    title: buildFormatTitle("on-repeat"),
    subtitle: "Your heavy rotation",
    description: buildFormatDescription("on-repeat"),
    accentColor: MIX_COLORWAYS[0],
    genre: "Heavy rotation",
    tracks,
    requestId: `${ctx.seed}:on-repeat`,
    trackCount: tracks.length,
  };
}

export function buildRepeatRewind(ctx: GenerationContext, now = Date.now()): GeneratedPlaylist {
  const windowStart = now - 14 * DAY_MS;
  const recentIds = new Set(
    ctx.events
      .filter((event) => toTime(event.createdAt) >= windowStart)
      .map((event) => event.trackId),
  );

  const allCounts = aggregatePlays(ctx.events);
  const byId = catalogById(ctx.catalog);

  const candidates: Array<{ track: Track; score: number }> = [];
  for (const [trackId, count] of allCounts) {
    if (recentIds.has(trackId)) continue;
    const track = byId.get(trackId);
    if (!track) continue;
    candidates.push({ track, score: count * 10 });
  }

  const tracks = selectDiverseTracks(candidates, {
    count: 25,
    maxPerArtist: 2,
    seed: `${ctx.seed}:rewind`,
    jitter: 2,
  });

  return {
    id: generatedPlaylistId("repeat-rewind"),
    format: "repeat-rewind",
    title: buildFormatTitle("repeat-rewind"),
    subtitle: "Old favourites, another spin",
    description: buildFormatDescription("repeat-rewind"),
    accentColor: MIX_COLORWAYS[1],
    genre: "Rewind",
    tracks,
    requestId: `${ctx.seed}:repeat-rewind`,
    trackCount: tracks.length,
  };
}

// ---------------------------------------------------------------------------
// Topic mixes (genre / scene clusters)
// ---------------------------------------------------------------------------

export function rankTopicGenres(ctx: GenerationContext, limit = 4): string[] {
  const scores = new Map<string, number>();
  const add = (genre: string | null | undefined, amount: number) => {
    if (!genre) return;
    const label = genre.trim();
    if (!label) return;
    scores.set(label, (scores.get(label) ?? 0) + amount);
  };

  for (const event of ctx.events) add(event.genre, event.completed ? 3 : 1);
  for (const genre of ctx.taste.preferredGenres) add(genre, 4);
  for (const track of ctx.catalog.slice(0, 400)) add(track.genre, 0.25);

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre)
    .slice(0, limit);
}

export function buildTopicMixes(ctx: GenerationContext): GeneratedPlaylist[] {
  return rankTopicGenres(ctx).map((genre, index) => {
    const needle = genre.toLowerCase();
    const candidates = ctx.catalog
      .filter((track) => {
        const value = (track.genre ?? "").toLowerCase();
        return value && (value.includes(needle) || needle.includes(value));
      })
      .map((track) => ({
        track,
        score:
          popularityPrior(track) +
          (ctx.likedTrackIds.has(track.id) ? 12 : 0) +
          (ctx.recentTrackIds.has(track.id) ? 6 : 0),
      }));

    const tracks = selectDiverseTracks(candidates, {
      count: 25,
      maxPerArtist: 3,
      seed: `${ctx.seed}:topic:${needle}`,
      jitter: 14,
    });

    return {
      id: generatedPlaylistId("topic-mix", { slug: genre }),
      format: "topic-mix" as const,
      title: buildFormatTitle("topic-mix", { genre }),
      subtitle: genre,
      description: buildFormatDescription("topic-mix", { genre }),
      accentColor: MIX_COLORWAYS[(index + 2) % MIX_COLORWAYS.length],
      genre,
      tracks,
      requestId: `${ctx.seed}:topic:${needle}`,
      trackCount: tracks.length,
    };
  }).filter((mix) => mix.tracks.length > 0);
}

// ---------------------------------------------------------------------------
// Artist seed mixes ("Mix of <Artist>")
// ---------------------------------------------------------------------------

export function buildArtistSeedMixes(ctx: GenerationContext, count = 6): GeneratedPlaylist[] {
  const seeds = ctx.topArtists.slice(0, count);
  const mixes: GeneratedPlaylist[] = [];

  seeds.forEach((artist, index) => {
    const key = normalizeArtistName(artist);
    const related = new Set<string>([key]);
    for (const entry of rankSimilarArtists(ctx.graph, key, { limit: 8 })) {
      if (entry.score < 0.12) break;
      related.add(entry.key);
    }

    const candidates = ctx.catalog
      .filter((track) => related.has(normalizeArtistName(track.artistName)))
      .map((track) => {
        const artistKey = normalizeArtistName(track.artistName);
        let score = popularityPrior(track);
        if (artistKey === key) score += 20;
        if (ctx.likedTrackIds.has(track.id)) score += 10;
        if (ctx.recentTrackIds.has(track.id)) score += 8;
        return { track, score };
      });

    const tracks = selectDiverseTracks(candidates, {
      count: 25,
      maxPerArtist: 3,
      seed: `${ctx.seed}:artist:${key}`,
      jitter: 12,
    });

    if (tracks.length === 0) return;

    mixes.push({
      id: generatedPlaylistId("artist-seed-mix", { slug: artist }),
      format: "artist-seed-mix",
      title: buildFormatTitle("artist-seed-mix", { artist }),
      subtitle: topArtistNames(tracks).slice(0, 3).join(", "),
      description: buildFormatDescription("artist-seed-mix", {
        artist,
        artists: topArtistNames(tracks),
      }),
      accentColor: MIX_COLORWAYS[(index + 1) % MIX_COLORWAYS.length],
      genre: artist,
      tracks,
      requestId: `${ctx.seed}:artist:${key}`,
      trackCount: tracks.length,
    });
  });

  return mixes;
}

// ---------------------------------------------------------------------------
// Car mix (energetic proxy — no audio features available)
// ---------------------------------------------------------------------------

export function buildCarMix(ctx: GenerationContext): GeneratedPlaylist {
  const candidates = ctx.catalog.map((track) => {
    const genre = (track.genre ?? "").toLowerCase();
    let score = popularityPrior(track);
    if (ENERGETIC_GENRES.some((token) => genre.includes(token))) score += 18;
    if (CALM_GENRES.some((token) => genre.includes(token))) score -= 12;
    if (ctx.likedTrackIds.has(track.id)) score += 8;
    return { track, score };
  });

  const tracks = selectDiverseTracks(candidates, {
    count: 25,
    maxPerArtist: 2,
    seed: `${ctx.seed}:car`,
    jitter: 18,
  });

  return {
    id: generatedPlaylistId("car-mix"),
    format: "car-mix",
    title: buildFormatTitle("car-mix"),
    subtitle: "Upbeat tracks for the road",
    description: buildFormatDescription("car-mix"),
    accentColor: MIX_COLORWAYS[5],
    genre: "Driving",
    tracks,
    requestId: `${ctx.seed}:car-mix`,
    trackCount: tracks.length,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export const ALL_GENERATED_FORMATS: PlaylistFormat[] = [
  "daily-mix",
  "discover-weekly",
  "release-radar",
  "on-repeat",
  "repeat-rewind",
  "topic-mix",
  "artist-seed-mix",
  "car-mix",
];

function buildForFormats(ctx: GenerationContext, formats: Set<PlaylistFormat>): GeneratedPlaylist[] {
  const out: GeneratedPlaylist[] = [];
  if (formats.has("daily-mix")) out.push(...buildDailyMixes(ctx));
  if (formats.has("discover-weekly")) out.push(buildDiscoverWeekly(ctx));
  if (formats.has("release-radar")) out.push(buildReleaseRadar(ctx));
  if (formats.has("on-repeat")) out.push(buildOnRepeat(ctx));
  if (formats.has("repeat-rewind")) out.push(buildRepeatRewind(ctx));
  if (formats.has("topic-mix")) out.push(...buildTopicMixes(ctx));
  if (formats.has("artist-seed-mix")) out.push(...buildArtistSeedMixes(ctx));
  if (formats.has("car-mix")) out.push(buildCarMix(ctx));
  return out.filter((playlist) => playlist.trackCount > 0);
}

/** Builds every generated playlist (or just the requested formats). */
export async function generateGeneratedPlaylists(
  syncKey = "default",
  seed?: string,
  formats?: PlaylistFormat[],
): Promise<GeneratedPlaylist[]> {
  const ctx = await loadGenerationContext(syncKey, seed);
  const wanted = new Set<PlaylistFormat>(formats ?? ALL_GENERATED_FORMATS);
  const cacheKey = `${syncKey}|${ctx.seed}|${Array.from(wanted).sort().join(",")}`;
  const cached = playlistCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PLAYLIST_TTL_MS) {
    return cached.value;
  }
  const value = buildForFormats(ctx, wanted);
  playlistCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** Resolves any generated playlist id used by `/playlist/[id]`. */
export async function getGeneratedPlaylistById(
  id: string,
  syncKey = "default",
  seed?: string,
): Promise<GeneratedPlaylist | null> {
  const parsed = parseGeneratedPlaylistId(id);
  if (!parsed) return null;

  const playlists = await generateGeneratedPlaylists(syncKey, seed, [parsed.format]);
  return (
    playlists.find((playlist) => playlist.id === id) ??
    (parsed.format === "daily-mix"
      ? playlists[(parsed.index ?? 1) - 1] ?? null
      : null)
  );
}
