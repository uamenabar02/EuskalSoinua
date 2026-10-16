import { NextResponse } from "next/server";
import { searchAudio, searchYouTubeDirect, cleanTitle } from "@/lib/sources/streaming";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseYouTubeInput(input: string): { isDirectId: boolean; videoId?: string; cleanQuery: string } {
  const trimmed = input.trim();
  // Check direct URL: youtube.com/watch?v=... or youtu.be/...
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (watchMatch) {
    return { isDirectId: true, videoId: watchMatch[1], cleanQuery: watchMatch[1] };
  }
  // Check if exactly 11 characters video ID
  if (/^[\w-]{11}$/.test(trimmed)) {
    return { isDirectId: true, videoId: trimmed, cleanQuery: trimmed };
  }
  return { isDirectId: false, cleanQuery: trimmed };
}

function parseSmartMeta(rawTitle: string, rawAuthor: string) {
  let title = rawTitle.trim();
  let artist = rawAuthor.replace(/ - Topic$/i, "").replace(/VEVO$/i, "").trim();

  // Try extracting "Artist - Title" pattern often found on YouTube
  const splitHyphen = title.split(/\s+[-–—]\s+/);
  if (splitHyphen.length >= 2) {
    artist = splitHyphen[0].trim();
    title = splitHyphen.slice(1).join(" - ").trim();
  }

  // Remove common YouTube fluff from title
  title = title
    .replace(/\s*[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer)?|videoclip|bideoklipa|audio\s*oficial|letra|lyrics|video|audio|hd|4k|hq|live|zuzenean)[\)\]]/gi, "")
    .replace(/\s*\|\s*.*$/gi, "")
    .trim();

  return {
    guessedTitle: title || rawTitle,
    guessedArtist: artist || rawAuthor || "YouTube",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const trimmed = q.trim();

  if (!trimmed) {
    return NextResponse.json({ hits: [], directId: null });
  }

  const { isDirectId, videoId, cleanQuery } = parseYouTubeInput(trimmed);

  try {
    let rawHits = await searchAudio(cleanQuery);

    // If direct video ID was entered and not present in results, prepend it
    if (isDirectId && videoId && !rawHits.some((h) => h.videoId === videoId)) {
      rawHits.unshift({
        videoId,
        title: `YouTube Audio (${videoId})`,
        author: "YouTube",
        duration: 0,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
    }

    const hits = rawHits.map((h) => {
      const { guessedTitle, guessedArtist } = parseSmartMeta(h.title, h.author);
      return {
        videoId: h.videoId,
        title: h.title,
        author: h.author,
        duration: h.duration || 180,
        thumbnail: h.thumbnail || `https://i.ytimg.com/vi/${h.videoId}/hqdefault.jpg`,
        guessedTitle,
        guessedArtist,
      };
    });

    return NextResponse.json({ hits, isDirectId, videoId: videoId ?? null });
  } catch (error) {
    console.error("YouTube direct search error:", error);
    return NextResponse.json({ hits: [], error: "Search failed" }, { status: 500 });
  }
}
