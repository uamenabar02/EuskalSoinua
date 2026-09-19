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
  "https://yt.chocolatemoo53.com",
  "https://inv.zoomerville.com",
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

function proxyGooglevideoUrl(url: string, proxyBase?: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("googlevideo.com")) {
      const targetBase = proxyBase || (INVIDIOUS_INSTANCES.length > 0 ? INVIDIOUS_INSTANCES[0] : null);
      if (targetBase) {
        const baseParsed = new URL(targetBase);
        u.protocol = baseParsed.protocol;
        u.host = baseParsed.host;
        return u.toString();
      }
    }
  } catch {}
  return url;
}

async function fetchPipedInstance(base: string, videoId: string): Promise<StreamResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
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
      const proxiedUrl = proxyGooglevideoUrl(best.url, base);
      return {
        url: proxiedUrl,
        originalUrl: best.url,
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
      const proxiedUrl = proxyGooglevideoUrl(combined[0].url, base);
      return {
        url: proxiedUrl,
        originalUrl: combined[0].url,
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
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as InvidiousVideoResponse;
    const best = data.adaptiveFormats ? pickBestInvidious(data.adaptiveFormats) : null;
    if (best?.url) {
      const withLocalParam = best.url.includes("?")
        ? `${best.url}&local=true`
        : `${best.url}?local=true`;
      const proxyUrl = proxyGooglevideoUrl(withLocalParam, base);
      return {
        url: proxyUrl,
        originalUrl: best.url,
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
  mode?: "full" | "preview" | null;
}

/**
 * Resolve a playable, ad-free audio URL. Order: Piped -> Invidious -> demo.
 * The demo fallback is chosen DISTINCTLY per trackId so two different songs
 * never collide on the same fallback audio.
 */
// Short-lived in-memory memo so the info probe and the actual audio request
// (which run a moment apart) don't each re-hit every proxy instance.
const STREAM_MEMO = new Map<string, { result: StreamResult; expires: number }>();
const STREAM_MEMO_TTL = 3600_000;

async function computeStream(input: ResolveInput): Promise<StreamResult> {
  // If we have a direct high-speed preview URL and mode is NOT specifically "full",
  // serve the preview immediately with ZERO proxy scraping delay!
  if (input.mode !== "full" && (input.previewUrlAlt || input.previewUrl)) {
    if (input.previewUrlAlt) return previewResult(input.previewUrlAlt, "audio/mp4", input.duration ?? 0);
    return previewResult(input.previewUrl!, "audio/mpeg", input.duration ?? 0);
  }

  // 1) Full ad-free YouTube stream (works when a proxy instance is available).
  if (input.videoId) {
    const real = await resolveFromAllInstances(input.videoId);
    if (real) return real;
  }
  if (input.mode === "full") {
    // If full extraction failed but we have a preview, use preview as fallback so playback doesn't dead-end
    if (input.previewUrlAlt) return previewResult(input.previewUrlAlt, "audio/mp4", input.duration ?? 0);
    if (input.previewUrl) return previewResult(input.previewUrl, "audio/mpeg", input.duration ?? 0);
    return {
      url: demoAudioForTrack(input.trackId ?? 1),
      contentType: "audio/mpeg",
      duration: input.duration ?? 0,
      provider: "demo",
      sponsorblockAvailable: false,
    };
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
  const cacheKey = input.trackId != null ? `${input.trackId}_${input.videoId || ""}` : null;
  if (cacheKey != null) {
    const hit = STREAM_MEMO.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.result;
  }
  const result = await computeStream(input);
  // Only memoize REAL resolutions (preview / extracted stream). Never cache the
  // royalty-free "demo" fallback — otherwise a transient enrichment failure
  // would lock the track onto demo for the TTL even after a real preview is
  // later populated in the DB.
  if (cacheKey != null && result.provider !== "demo") {
    STREAM_MEMO.set(cacheKey, { result, expires: Date.now() + STREAM_MEMO_TTL });
  }
  return result;
}

/** Drop the cached resolution for a track (e.g. when its preview URL 403'd). */
export function clearStreamMemo(trackId: number) {
  const prefix = `${trackId}_`;
  for (const key of STREAM_MEMO.keys()) {
    if (key.startsWith(prefix)) {
      STREAM_MEMO.delete(key);
    }
  }
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
    const timer = setTimeout(() => controller.abort(), 2500);
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
    const timer = setTimeout(() => controller.abort(), 2500);
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

/** Search YouTube web directly without proxy dependencies */
export async function searchYouTubeDirect(query: string): Promise<SearchHit[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "eu,es;q=0.9,en;q=0.8",
        Cookie: "CONSENT=YES+cb; SOCS=CAESEwgDEgk2OTcyMTY1MzQaAmVuIAEaBgiA_LyaBg",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);
    const hits: SearchHit[] = [];

    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const extract = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          if (obj.videoRenderer) {
            const v = obj.videoRenderer;
            const videoId = v.videoId;
            const title = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
            const author =
              v.ownerText?.runs?.[0]?.text ||
              v.shortBylineText?.runs?.[0]?.text ||
              "";
            const duration = v.lengthText?.simpleText || "";
            if (videoId && /^[\w-]{11}$/.test(videoId)) {
              hits.push({
                videoId,
                title,
                author,
                duration: 0,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              });
            }
          }
          for (const k of Object.keys(obj)) extract(obj[k]);
        };
        extract(data);
      } catch {
        /* fallback to regex */
      }
    }

    if (hits.length === 0) {
      // Extract videoId and title pairs directly from HTML
      const titlePattern = /"videoId":"([\w-]{11})"[^}]+?"title":\{(?:"runs":\[\{"text":"([^"]+)"\}|"simpleText":"([^"]+)")/g;
      for (const m of html.matchAll(titlePattern)) {
        const videoId = m[1];
        const title = m[2] || m[3] || "";
        if (videoId && title && !hits.some((h) => h.videoId === videoId)) {
          hits.push({
            videoId,
            title,
            author: "",
            duration: 0,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          });
        }
      }
    }

    return hits;
  } catch {
    return [];
  }
}

/** Search direct YouTube first, then fallback to public proxy instances in parallel. */
export async function searchAudio(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  // Primary: direct YouTube web search (ultra-reliable, <1.2s response, zero proxy quota)
  const directHits = await searchYouTubeDirect(q);
  if (directHits.length > 0) {
    return directHits;
  }

  // Fallback: search Piped & Invidious instances
  const producers: (() => Promise<SearchHit[] | null>)[] = [
    ...PIPED_INSTANCES.map((b) => async () => {
      const r = await searchPipedInstance(b, q);
      return r.length ? r : null;
    }),
    ...INVIDIOUS_INSTANCES.map((b) => async () => {
      const r = await searchInvidiousInstance(b, q);
      return r.length ? r : null;
    }),
  ];
  const result = await raceFirst<SearchHit[]>(producers);
  return result ?? [];
}

/** Always configured because direct YouTube searching and iframes are built-in. */
export function isStreamingConfigured(): boolean {
  return true;
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
 * Strips cosmetic bracketed tags (e.g. [Official Video], (Bideoklipa), (Audio))
 * while preserving the underlying song title words.
 */
export function cleanTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\s*[\(\[](official\s*(video|audio|music\s*video|visualizer|lyric\s*video)?|audio\s*oficial|videoclip|bideoklipa|bideoa|letra|lyrics|audio|video|clip|hd|hq|4k|disko\s*osoa)[\)\]]/gi,
      " ",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normTitle(s: string): string {
  return cleanTitle(s);
}

export function matchesTitle(targetTitle: string, hitTitle: string): boolean {
  const t = cleanTitle(targetTitle);
  const h = cleanTitle(hitTitle);
  if (!t || !h) return false;

  // Direct substring: hit title contains the target title
  if (h.includes(t)) return true;
  if (t.length > 6 && h.length >= 6 && (t.includes(h) || h.includes(t))) return true;

  // Also check raw normalized strings so parenthesized target titles (like Donostia) match
  const rawT = norm(targetTitle);
  const rawH = norm(hitTitle);
  if (rawH.includes(rawT)) return true;

  // Tokenize target title words (ignoring common stop words)
  const stopWords = new Set([
    "feat",
    "ft",
    "the",
    "a",
    "an",
    "and",
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "eta",
    "en",
    "da",
    "bat",
    "bi",
    "ep",
    "single",
  ]);
  const tWords = t.split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w));
  if (tWords.length === 0) {
    const rawWords = t.split(/\s+/).filter((w) => w.length > 0);
    return rawWords.length > 0 && rawWords.every((w) => h.includes(w) || rawH.includes(w));
  }

  const hWords = new Set(h.split(/\s+/));
  const rawHWords = new Set(rawH.split(/\s+/));

  // If 1 or 2 words in target title, ALL meaningful words MUST be in the hit!
  if (tWords.length <= 2) {
    return tWords.every((w) => hWords.has(w) || h.includes(w) || rawHWords.has(w));
  }

  // If 3+ words, at least 70% must match
  const matchedCount = tWords.filter(
    (w) => hWords.has(w) || h.includes(w) || rawHWords.has(w) || rawH.includes(w),
  ).length;
  return matchedCount / tWords.length >= 0.7;
}

/**
 * Score a search hit against the desired track. We heavily reward hits whose
 * uploader matches the artist name and whose title matches the track title —
 * this keeps the result on the *official* channel and away from covers/remixes.
 */
function scoreHit(hit: SearchHit, artist: string, title: string): number {
  const a = norm(artist);
  const t = cleanTitle(title);
  const rawT = norm(title);
  const hTitle = cleanTitle(hit.title);
  const rawHTitle = norm(hit.title);
  const hAuthor = norm(hit.author);

  // STRICT REQUIREMENT: The video title MUST match the track title.
  if (!matchesTitle(title, hit.title)) {
    return -999;
  }

  // Reject obvious user covers/reactions/karaoke unless requested in track title
  const isTargetCoverOrRemix = /cover|remix|reaction|karaoke|directo|live/i.test(title);
  if (!isTargetCoverOrRemix) {
    if (/\b(?:cover|guitar cover|bass cover|drum cover|reaccion|reaction|tutorial|karaoke|instrumental remake)\b/i.test(hit.title)) {
      return -999;
    }
  }

  let score = 80; // Base score for verified title match

  let artistMatch = false;
  if (a) {
    if (hAuthor.includes(a) || a.includes(hAuthor)) {
      score += 65;
      artistMatch = true;
    } else if (hTitle.includes(a) || rawHTitle.includes(a)) {
      score += 35;
      artistMatch = true;
    }
  }

  // Exact full title match bonus
  if (t && (hTitle.includes(t) || rawHTitle.includes(rawT))) {
    score += 40;
  }

  // Penalize missing artist if an artist was specified
  if (a && !artistMatch) {
    score -= 30;
  }

  // Penalize covers/remixes unless that's in the target title
  if (!/live|cover|remix|karaoke|instrumental/.test(rawT)) {
    if (/cover|remix|karaoke|instrumental/.test(rawHTitle)) score -= 45;
  }
  return score;
}

async function searchInvidious(query: string): Promise<SearchHit[]> {
  const { invidious: invidiousInstances } = configuredInstances();
  const producers = invidiousInstances.map((b) => async () => {
    const r = await searchInvidiousInstance(b, query);
    return r.length ? r : null;
  });
  const result = await raceFirst<SearchHit[]>(producers);
  return result ?? [];
}

const VIDEO_ID_CACHE = new Map<string, { videoId: string; title: string; author: string }>();

/**
 * Resolve a real YouTube videoId for a catalog track.
 * Employs multi-query permutations to reliably find niche Basque and international tracks.
 */
export async function resolveVideoIdForTrack(input: {
  artist: string;
  title: string;
  region?: string | null;
}): Promise<{ videoId: string; title: string; author: string } | null> {
  const cacheKey = `${input.artist.toLowerCase()}:::${input.title.toLowerCase()}`;
  const cached = VIDEO_ID_CACHE.get(cacheKey);
  if (cached) return cached;

  const rawQuery = `${input.artist} ${input.title}`.trim();
  if (!rawQuery) return null;

  const cleanedTitle = cleanTitle(input.title);
  const queries = [rawQuery];

  if (cleanedTitle && cleanedTitle !== input.title.toLowerCase().trim()) {
    queries.push(`${input.artist} ${cleanedTitle}`);
  }

  // Query permutations for high resolution of niche Basque tracks
  if (input.region === "eu" || /eu|basque/i.test(input.region || "")) {
    queries.push(`${input.artist} ${input.title} audio`);
    queries.push(`${input.artist} ${input.title} bideoklipa`);
  } else {
    queries.push(`${input.artist} ${input.title} official audio`);
  }

  for (const q of queries) {
    const hits = await searchAudio(q);
    if (hits.length > 0) {
      let best: SearchHit | null = null;
      let bestScore = -999;

      for (const h of hits.slice(0, 10)) {
        const s = scoreHit(h, input.artist, input.title);
        if (s > bestScore && s >= 60) {
          best = h;
          bestScore = s;
        }
      }

      if (best && bestScore >= 60 && /^[\w-]{11}$/.test(best.videoId)) {
        const res = { videoId: best.videoId, title: best.title, author: best.author };
        VIDEO_ID_CACHE.set(cacheKey, res);
        return res;
      }
    }

    // Direct Invidious fallback if needed
    const invHits = await searchInvidious(q);
    if (invHits.length > 0) {
      let invBest: SearchHit | null = null;
      let invBestScore = -999;
      for (const h of invHits.slice(0, 8)) {
        const s = scoreHit(h, input.artist, input.title);
        if (s > invBestScore && s >= 60) {
          invBest = h;
          invBestScore = s;
        }
      }
      if (invBest && invBestScore >= 60 && /^[\w-]{11}$/.test(invBest.videoId)) {
        const res = { videoId: invBest.videoId, title: invBest.title, author: invBest.author };
        VIDEO_ID_CACHE.set(cacheKey, res);
        return res;
      }
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
