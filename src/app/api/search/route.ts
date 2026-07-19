import { NextResponse } from "next/server";
import { searchCatalog, likedIds } from "@/lib/queries";
import { ensureSeed } from "@/lib/seed";
import { ingestOnlineTracks, ingestDiscography } from "@/lib/sources/online";
import { mapTrack, mapArtist } from "@/lib/mappers";
import { db } from "@/db";
import { artists } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Unified search: local catalog + REAL online sources (iTunes + Deezer).
 * Online matches are ingested as catalog tracks (with real artwork + a
 * playable preview) so they become first-class: playable, likeable, addable
 * to playlists. This lets users find ANY artist (La Txama, StreetWise, …)
 * without importing anything.
 */
export async function GET(request: Request) {
  await ensureSeed();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ tracks: [], artists: [], albums: [], online: false });
  }

  // Run local + online concurrently. Online results are saved to the DB.
  const [local, online, likedSet] = await Promise.all([
    searchCatalog(q),
    ingestOnlineTracks(q).catch(() => []),
    likedIds(),
  ]);

  // Detect a dominant artist in the online results and pull their FULL
  // discography so searches like "ZETAK" surface all their songs, not just a
  // handful of keyword matches.
  let discography: Awaited<ReturnType<typeof ingestDiscography>> = [];
  if (online.length >= 3) {
    const counts = new Map<string, number>();
    for (const t of online) {
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
      discography = await ingestDiscography(topArtist).catch(() => []);
    }
  }

  // Merge online + discography tracks into the list (dedupe by id).
  const seenIds = new Set(local.tracks.map((t: any) => t.id));
  const mergedTracks = [...local.tracks];
  for (const t of [...online, ...discography]) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      mergedTracks.push({ ...t, liked: likedSet.has(t.id) });
    }
  }

  // Pull any newly-created online artists too.
  const onlineArtistIds = [...new Set(online.map((t: any) => t.artistId).filter(Boolean))] as number[];
  let extraArtists = local.artists;
  if (onlineArtistIds.length) {
    const rows = await db
      .select()
      .from(artists)
      .where(eq(artists.id, onlineArtistIds[0]));
    const existingArtistIds = new Set(local.artists.map((a: any) => a.id));
    for (const a of rows) {
      if (!existingArtistIds.has(a.id)) {
        extraArtists = [...extraArtists, { ...mapArtist(a), followed: false }];
      }
    }
  }

  return NextResponse.json({
    tracks: mergedTracks,
    artists: extraArtists,
    albums: local.albums,
    online: online.length > 0,
  });
}
