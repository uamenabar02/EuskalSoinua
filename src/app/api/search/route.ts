import { NextResponse } from "next/server";
import { searchCatalog, likedIds } from "@/lib/queries";
import { ingestOnlineTracks, ingestDiscography } from "@/lib/sources/online";
import { mapArtist } from "@/lib/mappers";
import { db } from "@/db";
import { artists } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Unified high-performance search:
 * 1. Checks local catalog first with multi-token ranking.
 * 2. If local results are sparse (< 5 tracks), concurrently queries online sources
 *    (iTunes + Deezer) with a strict timeout and ingests new tracks into the DB.
 * 3. Never blocks user search on full multi-album discography ingestion.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const trimmed = q.trim();
  if (!trimmed) {
    return NextResponse.json({ tracks: [], artists: [], albums: [], online: false });
  }

  // 1. Fast local catalog search
  const [local, likedSet] = await Promise.all([
    searchCatalog(trimmed),
    likedIds(),
  ]);

  // If local catalog already has solid results, return immediately (sub-20ms response time!)
  if (local.tracks.length >= 6 || (local.artists.length > 0 && local.tracks.length >= 3)) {
    return NextResponse.json({
      tracks: local.tracks,
      artists: local.artists,
      albums: local.albums,
      online: false,
    });
  }

  // 2. Local catalog is sparse -> query online sources (iTunes + Deezer)
  let onlineTracks: any[] = [];
  try {
    const onlinePromise = ingestOnlineTracks(trimmed);
    const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2800));
    onlineTracks = await Promise.race([onlinePromise, timeoutPromise]);
  } catch {
    onlineTracks = [];
  }

  // If online tracks found, trigger background full discography ingestion without blocking response
  if (onlineTracks.length >= 3) {
    const counts = new Map<string, number>();
    for (const t of onlineTracks) {
      counts.set(t.artistName, (counts.get(t.artistName) ?? 0) + 1);
    }
    let topArtist = "";
    let topCount = 0;
    for (const [name, c] of counts) {
      if (c > topCount) {
        topArtist = name;
        topCount = c;
      }
    }
    if (topArtist && topCount >= 3) {
      // Run in background without awaiting so the user gets instant response
      ingestDiscography(topArtist).catch(() => {});
    }
  }

  // Merge online tracks into local results (deduping by id)
  const seenIds = new Set(local.tracks.map((t: any) => t.id));
  const mergedTracks = [...local.tracks];
  for (const t of onlineTracks) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      mergedTracks.push({ ...t, liked: likedSet.has(t.id) });
    }
  }

  // Include any newly ingested online artists
  let mergedArtists = local.artists;
  const newArtistIds = [...new Set(onlineTracks.map((t: any) => t.artistId).filter(Boolean))] as number[];
  const existingArtistIds = new Set(local.artists.map((a: any) => a.id));
  const missingArtistIds = newArtistIds.filter((id) => !existingArtistIds.has(id));

  if (missingArtistIds.length > 0) {
    try {
      const extraRows = await db
        .select()
        .from(artists)
        .where(inArray(artists.id, missingArtistIds.slice(0, 5)));
      for (const a of extraRows) {
        mergedArtists = [...mergedArtists, { ...mapArtist(a), followed: false }];
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    tracks: mergedTracks,
    artists: mergedArtists,
    albums: local.albums,
    online: onlineTracks.length > 0,
  });
}
