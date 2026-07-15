import type { LyricLine } from "@/lib/types";
import { hashString } from "@/lib/utils";

/**
 * SYNCHRONIZED LYRICS
 * ----------------------------------------------------------------------------
 * Tries a configurable public lyrics API first:
 *   LYRICS_API_URL=https://lrclib.net/api   (free, no key, synced + plain)
 * Falls back to a deterministic procedural lyric line set so the scrolling UI
 * is always demonstrable. No commercial lyrics API key is required.
 */

const LYRICS_BASE =
  process.env.LYRICS_API_URL?.replace(/\/+$/, "") || "https://lrclib.net/api";

interface LrcLibSynced {
  id: number;
  trackName: string;
  artistName: string;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeRe = /\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(timeRe, "").trim();
    let m: RegExpExecArray | null;
    timeRe.lastIndex = 0;
    const stamps: number[] = [];
    while ((m = timeRe.exec(raw))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) / 1000 : 0;
      stamps.push(min * 60 + sec + frac);
    }
    if (stamps.length === 0) {
      if (text) lines.push({ time: -1, text });
    } else {
      for (const t of stamps) lines.push({ time: t, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export async function getLyrics(
  track: string,
  artist: string,
  duration: number,
): Promise<{ synced: boolean; lines: LyricLine[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const url =
      `${LYRICS_BASE}/get?track_name=${encodeURIComponent(track)}` +
      `&artist_name=${encodeURIComponent(artist)}&duration=${Math.round(duration)}`;
    let res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (res.status === 404) {
      // try the search endpoint as a looser fallback
      const s = await fetch(
        `${LYRICS_BASE}/search?q=${encodeURIComponent(`${artist} ${track}`)}`,
        { signal: controller.signal, headers: { accept: "application/json" } },
      );
      if (s.ok) {
        const arr = (await s.json()) as LrcLibSynced[];
        if (arr.length) {
          res = new Response(JSON.stringify(arr[0]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
    }
    if (res.ok) {
      const data = (await res.json()) as LrcLibSynced;
      if (data.syncedLyrics) {
        return { synced: true, lines: parseLrc(data.syncedLyrics) };
      }
      if (data.plainLyrics) {
        return {
          synced: false,
          lines: data.plainLyrics
            .split(/\r?\n/)
            .filter(Boolean)
            .map((t) => ({ time: -1, text: t })),
        };
      }
    }
  } catch {
    // fall through to procedural fallback
  }
  return { synced: false, lines: proceduralLyrics(track, artist, duration) };
}

// Deterministic, non-copyrighted placeholder lyric lines so the scrolling UI
// always renders. Repeats a small set of original, neutral lines.
const FRAGMENTS = [
  "Eguzkiaren argia leihoan sartu da",
  "The morning light comes through the glass",
  "Aingeru gauean zehar dabil",
  "We keep on moving through the silent streets",
  "Hots urrun bat entzuten dut",
  "Every heartbeat writes another line",
  "Maitasuna hitzetan galdu da",
  "And the rhythm carries us away",
  "Ez da amaitzen, ez da inoiz amaitzen",
  "Hold on, the song is never done",
];

function proceduralLyrics(track: string, artist: string, duration: number): LyricLine[] {
  const total = Math.max(8, Math.floor(duration / 6));
  const seed = hashString(`${track}-${artist}`);
  const lines: LyricLine[] = [{ time: -1, text: "♪ instrumental intro ♪" }];
  for (let i = 0; i < total; i++) {
    lines.push({ time: -1, text: FRAGMENTS[(seed + i) % FRAGMENTS.length] });
  }
  return lines;
}
