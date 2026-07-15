import type { SponsorSegment, StreamResult } from "@/lib/types";
import { demoAudioForTrack } from "@/lib/utils";

/**
 * AD-FREE STREAM RESOLUTION LAYER
 * ----------------------------------------------------------------------------
 * Commercial platforms inject audio/visual ads through proprietary JavaScript
 * wrappers. EuskalSoinua never loads those wrappers. Instead it resolves a
 * *pure audio-only* direct stream URL through privacy-respecting open-source
 * proxies (Piped / Invidious), which extract the raw adaptive stream returned
 * by the platform's own backend — no ad pod, no tracking pixel, no JS player.
 *
 * Both Piped and Invidious expose public JSON endpoints. Instances are fully
 * configurable via environment variables so the operator picks their own
 * self-hosted (or trusted) nodes. URLs are comma separated:
 *
 *   PIPED_API_URLS=https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de
 *   INVIDIOUS_API_URLS=https://inv.nadeko.net,https://invidious.nerdvpn.de
 *
 * If no instance is reachable we fall back to the royalty-free demo audio bank
 * so the player is always functional.
 */

function csvEnv(key: string, fallback: string[] = []): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Bundled defaults — curated public community instances of the open-source
 * Piped / Invidious front-ends. These are used out-of-the-box so the app works
 * with NO configuration or personal API key. Operators can override them (or
 * point at a self-hosted node) via the PIPED_API_URLS / INVIDIOUS_API_URLS env
 * vars. If every instance is unreachable we still fall back to royalty-free
 * demo audio, so the player is always functional.
 */
const DEFAULT_PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.reallyaweso.me",
];

const DEFAULT_INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.jing.rocks",
];

const PIPED_INSTANCES = csvEnv("PIPED_API_URLS", DEFAULT_PIPED);
const INVIDIOUS_INSTANCES = csvEnv("INVIDIOUS_API_URLS", DEFAULT_INVIDIOUS);

export function configuredInstances() {
  return {
    piped: PIPED_INSTANCES,
    invidious: INVIDIOUS_INSTANCES,
    sponsorblock:
      process.env.SPONSORBLOCK_API_URL?.replace(/\/+$/, "") ||
      "https://sponsor.ajay.app",
  };
}

interface PipedAudioStream {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
  videoOnly?: boolean;
}

interface PipedStreamsResponse {
  audioStreams?: PipedAudioStream[];
  videoStreams?: PipedAudioStream[]; // may carry audio (e.g. LBRY mirror)
  duration?: number;
  previewFrames?: unknown;
}

interface InvidiousFormat {
  url?: string;
  mimeType?: string;
  type?: string;
  bitrate?: number;
  container?: string;
  audioQuality?: string;
  audioSampleRate?: number;
}

interface InvidiousVideoResponse {
  adaptiveFormats?: InvidiousFormat[];
  lengthSeconds?: number;
}

// Pick the best *audio-only* stream. We deliberately ignore any format that
// also carries video to save bandwidth and never render an ad-capable surface.
function pickBestPiped(streams: PipedAudioStream[]): PipedAudioStream | null {
  const audioOnly = streams.filter(
    (s) => !s.videoOnly && /audio/i.test(s.mimeType || ""),
  );
  const pool = audioOnly.length ? audioOnly : streams;
  if (pool.length === 0) return null;
  return pool.reduce((best, cur) => (cur.bitrate > best.bitrate ? cur : best));
}

async function fetchPipedInstance(base: string, videoId: string): Promise<StreamResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/streams/${videoId}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as PipedStreamsResponse;
    // 1) preferred: a true audio-only stream
    const best = data.audioStreams ? pickBestPiped(data.audioStreams) : null;
    if (best?.url) {
      return {
        url: best.url,
        contentType: best.mimeType || "audio/mp4",
        duration: data.duration ?? 0,
        provider: "piped",
        sponsorblockAvailable: true,
      };
    }
    // 2) fallback: a combined stream that still carries audio (e.g. a
    //    LBRY/Odysee mirror) — better than silence when YouTube audio-only
    //    extraction is throttled by the platform.
    const combined = data.videoStreams
      ? data.videoStreams.filter((s) => !s.videoOnly && s.url)
      : [];
    if (combined.length) {
      return {
        url: combined[0].url,
        contentType: combined[0].mimeType || "audio/mp4",
        duration: data.duration ?? 0,
        provider: "lbry",
        sponsorblockAvailable: true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function pickBestInvidious(formats: InvidiousFormat[]): InvidiousFormat | null {
  const audioOnly = formats.filter((f) => f.type === "audio");
  const pool = audioOnly.length ? audioOnly : formats;
  if (pool.length === 0) return null;
  return pool.reduce(
    (best, cur) => ((cur.bitrate ?? 0) > (best.bitrate ?? 0) ? cur : best),
    pool[0],
  );
}

async function fetchInvidiousInstance(base: string, videoId: string): Promise<StreamResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as InvidiousVideoResponse;
    const best = data.adaptiveFormats ? pickBestInvidious(data.adaptiveFormats) : null;
    if (best?.url) {
      return {
        url: best.url,
        contentType: best.mimeType || `audio/${best.container ?? "mp4"}`,
        duration: data.lengthSeconds ?? 0,
        provider: "invidious",
        sponsorblockAvailable: true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Race many async producers in PARALLEL and resolve with the first non-null
 * result. Crucially, it returns `null` as soon as EVERY producer has settled
 * (without waiting for the per-call timeout), so when instances respond fast
 * but empty (the common "audio blocked" case) we settle quickly instead of
 * blocking the player for seconds.
 */
function raceFirst<T>(producers: (() => Promise<T | null>)[]): Promise<T | null> {
  if (producers.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let remaining = producers.length;
    let settled = false;
    const finish = (val: T | null) => {
      if (settled) return;
      if (val) {
        settled = true;
        resolve(val);
      } else {
        remaining -= 1;
        if (remaining === 0) {
          settled = true;
          resolve(null);
        }
      }
    };
    for (const produce of producers) produce().then(finish, () => finish(null));
  });
}

async function resolveFromAllInstances(videoId: string): Promise<StreamResult | null> {
  return raceFirst<StreamResult>([
    ...PIPED_INSTANCES.map((b) => () => fetchPipedInstance(b, videoId)),
    ...INVIDIOUS_INSTANCES.map((b) => () => fetchInvidiousInstance(b, videoId)),
  ]);
}

export interface ResolveInput {
  videoId?: string | null;
  trackId?: number;
  duration?: number;
  previewUrl?: string | null;
  previewUrlAlt?: string | null;
}

/**
 * Resolve a playable, ad-free audio URL. Order: Piped -> Invidious -> demo.
 * The demo fallback is chosen DISTINCTLY per trackId so two different songs
 * never collide on the same fallback audio.
 */
// Short-lived in-memory memo so the info probe and the actual audio request
// (which run a moment apart) don't each re-hit every proxy instance.
const STREAM_MEMO = new Map<number, { result: StreamResult; expires: number }>();
const STREAM_MEMO_TTL = 3600_000;

async function computeStream(input: ResolveInput): Promise<StreamResult> {
  // 1) Full ad-free YouTube stream (works when a proxy instance is available).
  if (input.videoId) {
    const real = await resolveFromAllInstances(input.videoId);
    if (real) return real;
  }
  // 2) Real ~30s preview of the ACTUAL song. Prefer iTunes (stable CDN URLs
  //    that never expire) over Deezer (token URLs that expire after a while),
  //    so the audio reliably corresponds to the selected track.
  if (input.previewUrlAlt) return previewResult(input.previewUrlAlt, "audio/mp4", input.duration ?? 0);
  if (input.previewUrl) return previewResult(input.previewUrl, "audio/mpeg", input.duration ?? 0);
  // 3) Last resort: a distinct royalty-free track per catalog id.
  return {
    url: demoAudioForTrack(input.trackId ?? 1),
    contentType: "audio/mpeg",
    duration: input.duration ?? 0,
    provider: "demo",
    sponsorblockAvailable: false,
  };
}

export async function resolveStream(input: ResolveInput): Promise<StreamResult> {
  if (input.trackId != null) {
    const hit = STREAM_MEMO.get(input.trackId);
    if (hit && hit.expires > Date.now()) return hit.result;
  }
  const result = await computeStream(input);
  // Only memoize REAL resolutions (preview / extracted stream). Never cache the
  // royalty-free "demo" fallback — otherwise a transient enrichment failure
  // would lock the track onto demo for the TTL even after a real preview is
  // later populated in the DB.
  if (input.trackId != null && result.provider !== "demo") {
    STREAM_MEMO.set(input.trackId, { result, expires: Date.now() + STREAM_MEMO_TTL });
  }
  return result;
}

/** Drop the cached resolution for a track (e.g. when its preview URL 403'd). */
export function clearStreamMemo(trackId: number) {
  STREAM_MEMO.delete(trackId);
}

function previewResult(url: string, contentType: string, duration: number): StreamResult {
  return {
    url,
    contentType,
    duration: duration || 30,
    provider: "preview",
    sponsorblockAvailable: false,
  };
}

/**
 * Find the highest-quality audio match for arbitrary metadata (ISRC/title) by
 * searching the open-source proxies. This is the "metadata -> YouTube fallback"
 * used when a track originates from Spotify/Deezer.
 */
export interface SearchHit {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string | null;
}

async function searchPipedInstance(base: string, query: string): Promise<SearchHit[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    return (data.items ?? [])
      .filter((i) => typeof i.url === "string")
      .map((i) => {
        const url = i.url as string;
        const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
        return {
          videoId: m ? m[1] : url,
          title: String(i.title ?? ""),
          author: String(i.uploaderName ?? i.uploader ?? ""),
          duration: Number(i.duration ?? 0),
          thumbnail: (i.thumbnail as string) ?? (i.uploaderAvatar as string) ?? null,
        };
      });
  } catch {
    return [];
  }
}

async function searchInvidiousInstance(base: string, query: string): Promise<SearchHit[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as Array<Record<string, unknown>>;
    return data.map((i) => ({
      videoId: String(i.videoId ?? ""),
      title: String(i.title ?? ""),
      author: String(i.author ?? ""),
      duration: Number(i.lengthSeconds ?? 0),
      thumbnail: (i.videoThumbnails as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
    }));
  } catch {
    return [];
  }
}

/** Search every instance in parallel; return the first non-empty result set. */
export async function searchAudio(query: string): Promise<SearchHit[]> {
  if (query.trim().length === 0) return [];
  // Empty result sets are folded to null so raceFirst keeps waiting for an
  // instance that actually has hits.
  const producers: (() => Promise<SearchHit[] | null>)[] = [
    ...PIPED_INSTANCES.map((b) => async () => {
      const r = await searchPipedInstance(b, query);
      return r.length ? r : null;
    }),
    ...INVIDIOUS_INSTANCES.map((b) => async () => {
      const r = await searchInvidiousInstance(b, query);
      return r.length ? r : null;
    }),
  ];
  const result = await raceFirst<SearchHit[]>(producers);
  return result ?? [];
}

/** True when at least one proxy instance is configured & likely reachable. */
export function isStreamingConfigured(): boolean {
  return PIPED_INSTANCES.length > 0 || INVIDIOUS_INSTANCES.length > 0;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score a search hit against the desired track. We heavily reward hits whose
 * uploader matches the artist name and whose title matches the track title —
 * this keeps the result on the *official* channel and away from covers/remixes
 * (critical for underrepresented Basque catalog where community uploads abound).
 */
function scoreHit(hit: SearchHit, artist: string, title: string): number {
  const a = norm(artist);
  const t = norm(title);
  const hTitle = norm(hit.title);
  const hAuthor = norm(hit.author);
  let score = 0;
  if (a && hAuthor.includes(a)) score += 60;
  if (a && hTitle.includes(a)) score += 20;
  if (t && hTitle.includes(t)) score += 40;
  // penalise obvious "live", "cover", "remix", "karaoke" unless that's the title
  if (!/live|cover|remix|karaoke|instrumental/.test(t)) {
    if (/live|cover|remix|karaoke|instrumental/.test(hTitle)) score -= 35;
  }
  // duration closeness (within 15s is great)
  return score;
}

/**
 * Resolve a real YouTube videoId for a catalog track by searching the
 * open-source proxies. Basque tracks (region 'eu') query with the native
 * artist+title (which is itself unique), surfacing the official channel upload.
 * Returns null if no usable hit / no reachable instance.
 */
export async function resolveVideoIdForTrack(input: {
  artist: string;
  title: string;
  region?: string | null;
}): Promise<{ videoId: string; title: string; author: string } | null> {
  const query = `${input.artist} ${input.title}`.trim();
  if (!query) return null;

  // Basque: also try the music_songs filter first (artist + title is unique);
  // if nothing matches well, retry with a broader query.
  const queries = [query];
  if (input.region === "eu") {
    queries.push(`${input.artist} ${input.title} official audio`);
  }

  for (const q of queries) {
    const hits = await searchAudio(q);
    if (!hits.length) continue;
    let best = hits[0];
    let bestScore = scoreHit(best, input.artist, input.title);
    for (const h of hits.slice(1, 8)) {
      const s = scoreHit(h, input.artist, input.title);
      if (s > bestScore) {
        best = h;
        bestScore = s;
      }
    }
    if (/^[\w-]{11}$/.test(best.videoId)) {
      return { videoId: best.videoId, title: best.title, author: best.author };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SponsorBlock — skip non-music / sponsor / intro / outro segments.
// ---------------------------------------------------------------------------

const SPONSORBLOCK_BASE =
  process.env.SPONSORBLOCK_API_URL?.replace(/\/+$/, "") ||
  "https://sponsor.ajay.app";

interface SbCategory {
  segment: [number, number];
  category: string;
}

export async function getSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
  const categories = [
    "sponsor",
    "intro",
    "outro",
    "selfpromo",
    "interaction",
    "music_offtopic",
  ];
  const url =
    `${SPONSORBLOCK_BASE}/api/skipSegments?videoID=${videoId}` +
    `&categories=${encodeURIComponent(JSON.stringify(categories))}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (res.status === 404) return []; // no segments -> fine
    if (!res.ok) return [];
    const data = (await res.json()) as SbCategory[];
    return data.map((d) => ({
      start: d.segment[0],
      end: d.segment[1],
      category: d.category,
    }));
  } catch {
    return [];
  }
}
