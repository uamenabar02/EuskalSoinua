import "server-only";
import { db } from "@/db";
import { tracks, artists, albums } from "@/db/schema";
import { eq, ilike, and, or } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";
import { matchesTitle } from "@/lib/sources/streaming";
import { splitArtistNames } from "@/lib/utils";

/**
 * REAL ONLINE METADATA SEARCH
 * ----------------------------------------------------------------------------
 * Searches the legal, key-free public APIs of iTunes and Deezer in parallel
 * and unifies the results. This is what makes the app find ANY artist
 * (La Txama, StreetWise, Berri Txarrak, …) on demand — no manual import.
 *
 * Both return real album artwork AND a playable ~30-second preview of the
 * ACTUAL song. That preview is used as a guaranteed-correct audio fallback so
 * the track that plays always corresponds to the card, even when YouTube
 * full-track extraction is unavailable.
 *
 * Full ad-free tracks are still resolved first via YouTube (Piped/Invidious).
 */

export interface OnlineMatch {
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  isrc: string | null;
  artwork: string | null;
  // playable ~30s previews of the real song
  previewUrl: string | null; // Deezer (mp3)
  previewUrlAlt: string | null; // iTunes (m4a)
  genre: string | null;
  source: "deezer" | "itunes";
}

export interface ArtistDisambiguation {
  searchQuery: string;
  searchQueries?: string[];
  knownMatches: string[];
  rejectedKeywords: string[];
}

export const BASQUE_DISAMBIGUATION: Record<string, ArtistDisambiguation> = {
  dupla: {
    searchQuery: "Dupla",
    searchQueries: [
      "Dupla De Un Pueblo Llamado Agurain",
      "Dupla Folklorea",
      "Dupla NAHIERAN",
      "Dupla Agurain"
    ],
    knownMatches: [
      "folklorea", "nahidudana", "concepto", "de agurain a kontrazaharra", "gure zakarra",
      "dantzatzera at", "hamen", "beldurrik ez", "dmt", "ezer ez da berdina", "agurain",
      "txoriak txori", "batu", "txikititan", "gazteak", "zikina", "kultura", "dantzatu",
      "mundua pitzatzear dago", "haizea", "euskal herriko gazteak", "de un pueblo llamado agurain",
      "30's", "30s", "ongi etorri", "tirikitrauki", "l_chawal_s", "chawals", "artista",
      "obaportillo", "el mejurjo", "konforme", "kontrasanak", "tururu", "animali",
      "un mal dia", "zugandek ihesi", "txiki", "mundua geldi", "01200", "eromeria",
      "nahieran", "kata", "batukada", "skapa", "milenials", "dantza gaua"
    ],
    rejectedKeywords: [
      "regional mexicano", "mariachi", "corridos", "salsa", "cumbia", "bachata",
      "ranchera", "norteño", "mexicano", "mexican", "mexico", "banda sinaloense",
      "dupla de la sierra", "dupla ranchera", "bolero", "vallenato", "zouk", "kompa",
      "afrobeat", "afrobeats", "amapiano", "congolese", "makossa", "kizomba", "rumba",
      "insatisfaite", "rythmo", "melodie", "mélodie", "chaleur", "inattendue", "portukonpa",
      "ambiance", "guarachita", "tololoche", "chochias", "jalisco", "que se joda", "des iles",
      "d'iles", "mon albi", "ti tèt", "souvenir", "danse-jauqu-matin", "l'heure", "gouyad"
    ],
  },
  bengo: {
    searchQuery: "Bengo",
    searchQueries: [
      "Bengo Denbora",
      "Bengo 453",
      "Bengo Bizitzak",
      "Bengo Oiartzun"
    ],
    knownMatches: [
      "453", "bizitzak", "bidean", "denbora", "orain", "bizi", "gogoan", "txatxarrak",
      "beste egun bat", "kantu bat", "ai ai ai", "zortzi", "basamortuan", "sayonara",
      "baimenik gabe", "bakarrik", "bueltan", "gelatxo honetan", "baleak", "bizitzari parre",
      "oiartzun"
    ],
    rejectedKeywords: [
      "afrobeats", "afrobeat", "amapiano", "bengo bengo", "congolese", "makossa",
      "kizomba", "regional mexicano", "mariachi", "cumbia", "banda", "rumba", "zouk",
      "kompa", "bachata"
    ],
  },
};

export function isValidMatchForArtist(
  artistName: string,
  m: { title: string; album?: string | null; genre?: string | null }
): boolean {
  const key = artistName.trim().toLowerCase();
  const disam = BASQUE_DISAMBIGUATION[key];
  if (!disam) return true;

  const targetText = `${m.title} ${m.album ?? ""} ${m.genre ?? ""}`.toLowerCase();

  // 1. Check rejected keywords
  for (const rejected of disam.rejectedKeywords) {
    if (targetText.includes(rejected.toLowerCase())) {
      return false;
    }
  }

  // 2. If knownMatches specified, target MUST match at least one known match
  if (disam.knownMatches && disam.knownMatches.length > 0) {
    const matched = disam.knownMatches.some((k) => targetText.includes(k.toLowerCase()));
    if (!matched) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// iTunes Search API (Apple) — fully public, no key, JSONP-free JSON.
// ---------------------------------------------------------------------------

interface ITunesResult {
  artistName: string;
  trackName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  isrc?: string;
  kind?: string;
}

async function searchItunes(query: string): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesResult[] };
    return (data.results ?? [])
      .filter((r) => r.trackName && r.previewUrl)
      .map((r) => ({
        title: r.trackName as string,
        artist: r.artistName,
        album: r.collectionName ?? null,
        duration: Math.round((r.trackTimeMillis ?? 0) / 1000),
        isrc: r.isrc ?? null,
        // upsize the 100px artwork to a higher resolution
        artwork: (r.artworkUrl100 ?? "").replace("100x100bb", "300x300bb") || null,
        previewUrl: null,
        previewUrlAlt: r.previewUrl ?? null,
        genre: r.primaryGenreName ?? null,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deezer API — fully public, no key.
// ---------------------------------------------------------------------------

interface DeezerResult {
  title: string;
  artist: { name: string };
  album: { title: string; cover_big?: string; cover_medium?: string };
  duration: number;
  preview: string;
  isrc?: string;
}

async function searchDeezer(query: string): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DeezerResult[] };
    return (data.data ?? [])
      .filter((r) => r.preview)
      .map((r) => ({
        title: r.title,
        artist: r.artist.name,
        album: r.album.title ?? null,
        duration: r.duration,
        isrc: r.isrc ?? null,
        artwork: r.album.cover_big ?? r.album.cover_medium ?? null,
        previewUrl: r.preview,
        previewUrlAlt: null,
        genre: null,
        source: "deezer" as const,
      }));
  } catch {
    return [];
  }
}

// Normalize text for dedup / matching.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*-\s*(single|remastered|deluxe|edit).*$/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(matches: OnlineMatch[]): OnlineMatch[] {
  const seen = new Map<string, OnlineMatch>();
  for (const m of matches) {
    const key = `${norm(m.artist)}::${norm(m.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, m);
    } else {
      // merge: keep best artwork + both previews
      if (!existing.previewUrl && m.previewUrl) existing.previewUrl = m.previewUrl;
      if (!existing.previewUrlAlt && m.previewUrlAlt) existing.previewUrlAlt = m.previewUrlAlt;
      if (!existing.artwork && m.artwork) existing.artwork = m.artwork;
      if (!existing.isrc && m.isrc) existing.isrc = m.isrc;
    }
  }
  return [...seen.values()];
}

export async function searchOnline(query: string): Promise<OnlineMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const [itunes, deezer] = await Promise.all([searchItunes(q), searchDeezer(q)]);
  const raw = [...deezer, ...itunes];
  
  const qLower = q.toLowerCase();
  const filtered = raw.filter((m) => {
    for (const artistKey of Object.keys(BASQUE_DISAMBIGUATION)) {
      if (qLower.includes(artistKey) || m.artist.toLowerCase().includes(artistKey)) {
        if (!isValidMatchForArtist(artistKey, m)) return false;
      }
    }
    return true;
  });

  return dedupe(filtered).slice(0, 24);
}

// ---------------------------------------------------------------------------
// FULL DISCOGRAPHY — fetch every song for a specific artist (not just search
// matches). This fixes "only 8 songs for ZETAK" by pulling the complete catalog.
// ---------------------------------------------------------------------------

/** iTunes: artistName -> artistId -> lookup up to 200 songs in one call. */
async function getItunesArtistId(term: string): Promise<number | null> {
  try {
    const key = term.trim().toLowerCase();
    const disam = BASQUE_DISAMBIGUATION[key];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=30`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        artistId?: number;
        artistName?: string;
        trackName?: string;
        collectionName?: string;
        primaryGenreName?: string;
      }>;
    };

    if (!data.results?.length) return null;

    if (disam) {
      // First try to find a track matching knownMatches
      const knownMatch = data.results.find((r) => {
        if (!r.artistId) return false;
        const text = `${r.trackName ?? ""} ${r.collectionName ?? ""}`.toLowerCase();
        return disam.knownMatches.some((k) => text.includes(k.toLowerCase()));
      });
      if (knownMatch?.artistId) return knownMatch.artistId;

      // Otherwise find first result passing isValidMatchForArtist
      const valid = data.results.find((r) => {
        if (!r.artistId) return false;
        return isValidMatchForArtist(key, { title: r.trackName ?? "", album: r.collectionName, genre: r.primaryGenreName });
      });
      return valid?.artistId ?? data.results[0]?.artistId ?? null;
    }

    return data.results[0]?.artistId ?? null;
  } catch {
    return null;
  }
}

async function getItunesDiscography(artistId: number): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=200`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesResult[] };
    return (data.results ?? [])
      .filter((r) => r.trackName && r.previewUrl)
      .map((r) => ({
        title: r.trackName as string,
        artist: r.artistName,
        album: r.collectionName ?? null,
        duration: Math.round((r.trackTimeMillis ?? 0) / 1000),
        isrc: r.isrc ?? null,
        artwork: (r.artworkUrl100 ?? "").replace("100x100bb", "300x300bb") || null,
        previewUrl: null,
        previewUrlAlt: r.previewUrl ?? null,
        genre: r.primaryGenreName ?? null,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

/** Deezer: artistName -> artistId -> all albums -> all tracks (with previews). */
async function getDeezerDiscography(artistName: string): Promise<OnlineMatch[]> {
  try {
    const key = artistName.trim().toLowerCase();
    const disam = BASQUE_DISAMBIGUATION[key];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const sres = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(artistName)}&limit=30`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!sres.ok) return [];
    const sdata = (await sres.json()) as {
      data?: Array<{
        artist?: { id?: number; name?: string };
        album?: { title?: string };
        title?: string;
      }>;
    };

    let artistId: number | null = null;
    if (disam && sdata.data?.length) {
      const known = sdata.data.find((d) => {
        if (!d.artist?.id) return false;
        const text = `${d.title ?? ""} ${d.album?.title ?? ""}`.toLowerCase();
        return disam.knownMatches.some((k) => text.includes(k.toLowerCase()));
      });
      if (known?.artist?.id) {
        artistId = known.artist.id;
      } else {
        const valid = sdata.data.find((d) => {
          if (!d.artist?.id) return false;
          return isValidMatchForArtist(key, { title: d.title ?? "", album: d.album?.title });
        });
        artistId = valid?.artist?.id ?? sdata.data[0]?.artist?.id ?? null;
      }
    } else {
      artistId = sdata.data?.[0]?.artist?.id ?? null;
    }

    if (!artistId) return [];

    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 8000);
    const ares = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=50`, {
      signal: c2.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(t2);
    if (!ares.ok) return [];
    const adata = (await ares.json()) as {
      data?: Array<{ id: number; title: string; cover_big?: string; cover_medium?: string }>;
    };
    const albumsList = adata.data ?? [];

    // fetch tracks for each album in parallel (bounded)
    const out: OnlineMatch[] = [];
    const batches = albumsList.slice(0, 25);
    const results = await Promise.all(
      batches.map(async (alb) => {
        const c3 = new AbortController();
        const t3 = setTimeout(() => c3.abort(), 8000);
        const r = await fetch(`https://api.deezer.com/album/${alb.id}/tracks?limit=50`, {
          signal: c3.signal,
          headers: { accept: "application/json" },
        });
        clearTimeout(t3);
        if (!r.ok) return [];
        const d = (await r.json()) as { data?: DeezerResult[] };
        return (d.data ?? [])
          .filter((tr) => tr.preview)
          .map((tr): OnlineMatch => ({
            title: tr.title,
            artist: tr.artist?.name || artistName,
            album: alb.title || tr.album?.title || null,
            duration: tr.duration,
            isrc: tr.isrc ?? null,
            artwork: alb.cover_big ?? alb.cover_medium ?? tr.album?.cover_big ?? null,
            previewUrl: tr.preview,
            previewUrlAlt: null,
            genre: null,
            source: "deezer" as const,
          }));
      }),
    );
    for (const r of results) {
      for (const item of r) {
        if (isValidMatchForArtist(artistName, item)) {
          out.push(item);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch the COMPLETE catalog for an artist by combining iTunes + Deezer
 * discographies plus search queries. Returns a large, deduped set.
 */
export async function getFullDiscography(artistName: string): Promise<OnlineMatch[]> {
  const name = artistName.trim();
  if (!name) return [];
  const key = name.toLowerCase();
  const disam = BASQUE_DISAMBIGUATION[key];

  const artistId = await getItunesArtistId(name);
  const extraQueries = disam?.searchQueries ?? [];
  const extraItunesPromises = extraQueries.map((q) => searchItunes(q));

  const [itunes, deezer, ...extraResults] = await Promise.all([
    artistId ? getItunesDiscography(artistId) : Promise.resolve([] as OnlineMatch[]),
    getDeezerDiscography(name),
    ...extraItunesPromises,
  ]);

  const allExtras = extraResults.flat();
  const combined = [...itunes, ...deezer, ...allExtras].filter((m) => isValidMatchForArtist(name, m));
  return dedupe(combined);
}

// ---------------------------------------------------------------------------
// Ingest: persist online matches as catalog tracks so they get stable ids,
// cover art, ISRC (for YouTube full-track mapping), like / playlist support.
// ---------------------------------------------------------------------------

/**
 * Ingest a full artist discography as catalog tracks. Used by the artist detail
 * page and "see all songs" so every track by an artist is available + playable.
 */
export async function ingestDiscography(artistName: string): Promise<Track[]> {
  const matches = await getFullDiscography(artistName);
  if (matches.length === 0) return [];
  // Normalize the artist to the searched name so collaborations & features
  // (e.g. "ZETAK & Bomba Estéreo", "ZETAK feat. X") all appear on the main
  // artist's page. Matches Spotify's behaviour of showing the full catalog.
  const out: Track[] = [];
  for (const m of matches) {
    out.push(...(await persistMatch({ ...m, artist: artistName })));
  }
  return out;
}

/**
 * Resolve the Deezer artist id for a name (used for related-artists lookup).
 */
async function getDeezerArtistId(artistName: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&limit=1`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ artist?: { id?: number } }> };
    return data.data?.[0]?.artist?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Get related/similar artists via Deezer. Used by song radio to build a queue
 * of similar music (Spotify-style "Go to song radio").
 */
async function getRelatedArtists(artistName: string): Promise<string[]> {
  const id = await getDeezerArtistId(artistName);
  if (!id) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.deezer.com/artist/${id}/related?limit=8`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ name: string }> };
    return (data.data ?? []).map((a) => a.name).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * SONG RADIO — build a Spotify-style radio queue seeded by one track.
 * Mixes: more songs by the same artist + songs by related artists + a few
 * genre-matched tracks. All results are ingested as playable catalog tracks.
 */
export async function buildRadio(seedTrackId: number): Promise<Track[]> {
  const seedRows = await db.select().from(tracks).where(eq(tracks.id, seedTrackId)).limit(1);
  const seed = seedRows[0];
  if (!seed) return [];

  const artistName = seed.artistName;
  const seen = new Set<number>([seedTrackId]);
  const queue: Track[] = [{ ...mapTrack(seed) }];

  // 1) more from the same artist (ensure full catalog is loaded)
  const ownTracks = await ingestDiscography(artistName).catch(() => []);
  const ownShuffled = ownTracks
    .filter((t) => !seen.has(t.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
  for (const t of ownShuffled) {
    seen.add(t.id);
    queue.push(t);
  }

  // 2) related artists
  const related = await getRelatedArtists(artistName);
  for (const r of related.slice(0, 5)) {
    const rTracks = await ingestDiscography(r).catch(() => []);
    const picks = rTracks
      .filter((t) => !seen.has(t.id))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 3);
    for (const t of picks) {
      seen.add(t.id);
      queue.push(t);
    }
  }

  // 3) if we still need more, top up with a genre/artist search
  if (queue.length < 12) {
    const extra = await searchOnline(`${artistName} ${seed.genre ?? ""}`.trim());
    for (const m of extra.slice(0, 10)) {
      const [t] = await persistMatch(m);
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        queue.push(t);
      }
      if (queue.length >= 15) break;
    }
  }

  // shuffle everything after the seed for a radio feel
  const tail = queue.slice(1).sort(() => Math.random() - 0.5);
  return [queue[0], ...tail];
}

/** Find or create an album row for (artistId, albumName); returns its id. */
async function resolveAlbumId(
  artistId: number,
  artistName: string,
  albumName: string | null,
  artwork: string | null,
): Promise<number | null> {
  if (!albumName || !albumName.trim()) return null;
  const name = albumName.trim();
  if (!isValidMatchForArtist(artistName, { title: name, album: name })) {
    return null;
  }
  const existing = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.artistId, artistId), ilike(albums.title, name)))
    .limit(1);
  if (existing.length) return existing[0].id;
  const [a] = await db
    .insert(albums)
    .values({
      title: name,
      artistId,
      artistName,
      thumbnail: artwork,
      genre: null,
      region: "global",
      trackCount: 0,
      source: "local",
    })
    .returning({ id: albums.id });
  return a.id;
}

/** Persist a single OnlineMatch as a catalog track (dedup by ISRC/title+artist). */
async function persistMatch(m: OnlineMatch): Promise<Track[]> {
  if (!isValidMatchForArtist(m.artist, m)) {
    return [];
  }

  const whereClause = m.isrc
    ? eq(tracks.isrc, m.isrc)
    : and(ilike(tracks.title, m.title), ilike(tracks.artistName, m.artist));
  const existing = await db.select().from(tracks).where(whereClause).limit(1);
  if (existing.length) {
    const row = existing[0];
    const albumId = row.albumId ?? (row.artistId
      ? await resolveAlbumId(row.artistId, row.artistName, m.album ?? row.albumName, m.artwork)
      : null);
    const needsUpdate =
      (!row.previewUrl || !row.artworkUrl || (!row.albumId && albumId)) &&
      (m.previewUrl || m.artwork || albumId);
    if (needsUpdate) {
      await db
        .update(tracks)
        .set({
          previewUrl: row.previewUrl ?? m.previewUrl,
          previewUrlAlt: row.previewUrlAlt ?? m.previewUrlAlt,
          artworkUrl: row.artworkUrl ?? m.artwork,
          isrc: row.isrc ?? m.isrc,
          albumId: row.albumId ?? albumId,
          albumName: row.albumName ?? m.album,
        })
        .where(eq(tracks.id, row.id));
    }
    return [
      mapTrack({
        ...row,
        previewUrl: row.previewUrl ?? m.previewUrl,
        previewUrlAlt: row.previewUrlAlt ?? m.previewUrlAlt,
        artworkUrl: row.artworkUrl ?? m.artwork,
        albumId: row.albumId ?? albumId,
        albumName: row.albumName ?? m.album,
      }),
    ];
  }

  let artistId: number | null = null;
  const parts = splitArtistNames(m.artist);
  const primaryName = parts[0] || m.artist;

  const artistRow = await db
    .select()
    .from(artists)
    .where(ilike(artists.name, primaryName))
    .limit(1);
  if (artistRow.length) {
    if (isValidMatchForArtist(artistRow[0].name, m)) {
      artistId = artistRow[0].id;
    }
  } else {
    const [a] = await db
      .insert(artists)
      .values({ name: primaryName, genre: m.genre, region: "global", language: "und", source: m.source })
      .returning({ id: artists.id });
    artistId = a.id;
  }

  // Ensure other collaborating artists exist as individual artists
  for (const part of parts.slice(1)) {
    const existing = await db
      .select({ id: artists.id })
      .from(artists)
      .where(ilike(artists.name, part))
      .limit(1);
    if (!existing.length) {
      await db
        .insert(artists)
        .values({ name: part, genre: m.genre, region: "global", language: "und", source: m.source })
        .catch(() => {});
    }
  }

  const albumId = artistId
    ? await resolveAlbumId(artistId, m.artist, m.album, m.artwork)
    : null;

  const [row] = await db
    .insert(tracks)
    .values({
      title: m.title,
      artistId,
      artistName: m.artist,
      albumId,
      albumName: m.album,
      duration: m.duration,
      genre: m.genre,
      region: "global",
      language: "und",
      isrc: m.isrc,
      previewUrl: m.previewUrl,
      previewUrlAlt: m.previewUrlAlt,
      artworkUrl: m.artwork,
      source: m.source,
      playCount: Math.floor(Math.random() * 800) + 50,
    })
    .returning();
  if (albumId) {
    await db
      .update(albums)
      .set({ trackCount: (await db.select({ c: albums.trackCount }).from(albums).where(eq(albums.id, albumId)))[0]?.c ?? 0 })
      .where(eq(albums.id, albumId));
  }
  return [mapTrack(row)];
}

/**
 * Look up a REAL preview + artwork + ISRC for an existing track (by ISRC, or
 * title+artist) and cache it onto the DB row. This is what makes the seeded
 * Basque catalog play the ACTUAL song instead of a royalty-free placeholder.
 */
export async function enrichTrackPreview(input: {
  trackId: number;
  title: string;
  artist: string;
  isrc: string | null;
}): Promise<{ previewUrl: string | null; previewUrlAlt: string | null; artworkUrl: string | null; isrc: string | null } | null> {
  // prefer an exact ISRC lookup on Deezer, else search by title+artist
  const matches = await searchOnline(input.isrc ? input.isrc : `${input.artist} ${input.title}`);
  const key = `${norm(input.artist)}::${norm(input.title)}`;
  const best =
    matches.find((m) => Boolean(input.isrc && m.isrc && m.isrc === input.isrc)) ??
    matches.find((m) => `${norm(m.artist)}::${norm(m.title)}` === key) ??
    matches.find((m) => matchesTitle(input.title, m.title));
  if (!best) return null;
  const payload = {
    previewUrl: best.previewUrl,
    previewUrlAlt: best.previewUrlAlt,
    artworkUrl: best.artwork,
    isrc: best.isrc ?? input.isrc,
  };
  await db
    .update(tracks)
    .set(payload)
    .where(eq(tracks.id, input.trackId));
  return payload;
}

export async function ingestOnlineTracks(query: string): Promise<Track[]> {
  const matches = await searchOnline(query);
  if (matches.length === 0) return [];

  const out: Track[] = [];
  for (const m of matches) {
    out.push(...(await persistMatch(m)));
  }
  return out;
}
