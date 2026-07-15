import { searchAudio } from "@/lib/sources/streaming";

/**
 * METADATA AGGREGATION LAYER
 * ----------------------------------------------------------------------------
 * EuskalSoinua aggregates *metadata only* (title, artist, ISRC, cover art)
 * from legal public sources and never hosts audio. The primary working source
 * is the locally cached catalog (seeded with Basque + general catalog). When an
 * operator supplies API credentials, the adapters below enrich the catalog from
 * Spotify public metadata and Deezer's public API.
 *
 *   SPOTIFY_DC_COOKIE=...      (optional, for public-metadata scraping)
 *   DEEZER_BASE=https://api.deezer.com   (public, no key required)
 *
 * Every metadata record carries a stable source tag so the resolver knows how
 * to fetch audio. Records from Spotify/Deezer are mapped to a clean YouTube
 * audio stream via the open-source proxies (see streaming.ts).
 */

export interface MetadataMatch {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  isrc?: string | null;
  thumbnail?: string | null;
  genre?: string | null;
  source: "spotify" | "deezer";
}

export interface DeezerTrack {
  title: string;
  artist: { name: string };
  album: { title: string; cover: string };
  duration: number;
  isrc: string;
}

/** Deezer exposes a fully public, key-free JSON API — perfect for metadata. */
export async function searchDeezer(query: string): Promise<MetadataMatch[]> {
  if (!query.trim()) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${process.env.DEEZER_BASE ?? "https://api.deezer.com"}/search?q=${encodeURIComponent(query)}&limit=12`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DeezerTrack[] };
    return (data.data ?? []).map((t) => ({
      title: t.title,
      artist: t.artist.name,
      album: t.album.title,
      duration: t.duration,
      isrc: t.isrc,
      thumbnail: t.album.cover?.replace("/120x120", "/500x500") ?? null,
      source: "deezer",
    }));
  } catch {
    return [];
  }
}

/**
 * METADATA -> CLEAN AUDIO FALLBACK
 * Given metadata from any source, find the best audio-only stream by querying
 * the open-source proxies. We bias the query toward official artist channels
 * and append "audio" to reduce video-only noise.
 */
export async function mapMetadataToAudio(match: MetadataMatch) {
  const query = `${match.artist} ${match.title} audio`;
  const hits = await searchAudio(query);
  return hits[0] ?? null;
}

/**
 * Basque-source prioritization helper. When a track is flagged as Basque we
 * prefer known official channel uploads by injecting the language hint.
 */
export async function mapBasqueMetadataToAudio(match: MetadataMatch) {
  const query = `${match.artist} ${match.title} euskara ofiziala audio`;
  const hits = await searchAudio(query);
  if (hits.length) return hits[0];
  // Fall back to a plain query if the language-biased one yields nothing.
  return mapMetadataToAudio(match);
}
