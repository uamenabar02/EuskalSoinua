import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { tracks, albums, playlists, playlistTracks, savedAlbums, listenEvents } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { mapAlbum } from "@/lib/mappers";
import type { Track, Album, Playlist } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface UnifiedMediaItem {
  type: "album" | "playlist";
  id: string | number;
  item: Album | Playlist;
  playCount: number;
  lastPlayed: string;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";

    // 1. Last heard tracks (ordered by most recent listening timestamp)
    const recentRows = await db
      .select({
        track: tracks,
        lastPlayed: sql<string>`MAX(${listenEvents.createdAt})`.as("last_played"),
        playCount: sql<number>`COUNT(${listenEvents.id})::int`.as("play_count"),
      })
      .from(listenEvents)
      .innerJoin(tracks, eq(listenEvents.trackId, tracks.id))
      .where(eq(listenEvents.syncKey, syncKey))
      .groupBy(tracks.id)
      .orderBy(desc(sql`MAX(${listenEvents.createdAt})`))
      .limit(100);

    // 2. Most heard tracks (ordered by user play count descending)
    const mostHeardRows = await db
      .select({
        track: tracks,
        playCount: sql<number>`COUNT(${listenEvents.id})::int`.as("user_play_count"),
        lastPlayed: sql<string>`MAX(${listenEvents.createdAt})`.as("last_played"),
      })
      .from(listenEvents)
      .innerJoin(tracks, eq(listenEvents.trackId, tracks.id))
      .where(eq(listenEvents.syncKey, syncKey))
      .groupBy(tracks.id)
      .orderBy(desc(sql`COUNT(${listenEvents.id})`), desc(sql`MAX(${listenEvents.createdAt})`))
      .limit(100);

    // 3. User albums: with play count and lastPlayed
    const listenedAlbumRows = await db
      .select({
        album: albums,
        playCount: sql<number>`COUNT(${listenEvents.id})::int`.as("play_count"),
        lastPlayed: sql<string>`MAX(${listenEvents.createdAt})`.as("last_played"),
      })
      .from(listenEvents)
      .innerJoin(tracks, eq(listenEvents.trackId, tracks.id))
      .innerJoin(albums, eq(tracks.albumId, albums.id))
      .where(eq(listenEvents.syncKey, syncKey))
      .groupBy(albums.id)
      .orderBy(desc(sql`MAX(${listenEvents.createdAt})`))
      .limit(100);

    const savedAlbumRows = await db
      .select({
        album: albums,
        savedAt: savedAlbums.savedAt,
      })
      .from(savedAlbums)
      .innerJoin(albums, eq(savedAlbums.albumId, albums.id))
      .where(eq(savedAlbums.syncKey, syncKey))
      .orderBy(desc(savedAlbums.savedAt))
      .limit(100);

    // 4. User playlists: with play count and lastPlayed
    const userPlaylistsRaw = await db
      .select({
        playlist: playlists,
        playCount: sql<number>`COUNT(${listenEvents.id})::int`.as("play_count"),
        lastPlayed: sql<string>`MAX(${listenEvents.createdAt})`.as("last_played"),
      })
      .from(playlists)
      .leftJoin(playlistTracks, eq(playlists.id, playlistTracks.playlistId))
      .leftJoin(
        listenEvents,
        and(eq(playlistTracks.trackId, listenEvents.trackId), eq(listenEvents.syncKey, syncKey))
      )
      .where(eq(playlists.syncKey, syncKey))
      .groupBy(playlists.id)
      .orderBy(desc(playlists.createdAt))
      .limit(100);

    // Map and collect album items
    const albumItems: UnifiedMediaItem[] = [];
    const seenAlbumIds = new Set<number>();

    for (const r of listenedAlbumRows as any[]) {
      if (!seenAlbumIds.has(r.album.id)) {
        seenAlbumIds.add(r.album.id);
        albumItems.push({
          type: "album",
          id: r.album.id,
          item: mapAlbum(r.album),
          playCount: Number(r.playCount || 0),
          lastPlayed: r.lastPlayed || new Date(0).toISOString(),
        });
      }
    }

    for (const r of savedAlbumRows as any[]) {
      if (!seenAlbumIds.has(r.album.id)) {
        seenAlbumIds.add(r.album.id);
        albumItems.push({
          type: "album",
          id: r.album.id,
          item: mapAlbum({ ...r.album, saved: true } as any),
          playCount: 0,
          lastPlayed: r.savedAt || new Date(0).toISOString(),
        });
      }
    }

    // Map and collect playlist items
    const playlistItems: UnifiedMediaItem[] = (userPlaylistsRaw as any[]).map((r) => {
      const pl = r.playlist;
      const mappedPl: Playlist = {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        coverSeed: pl.coverSeed,
        trackCount: pl.trackCount,
        type: pl.type as "user" | "radio",
      };
      return {
        type: "playlist",
        id: pl.id,
        item: mappedPl,
        playCount: Number(r.playCount || 0),
        lastPlayed: r.lastPlayed || pl.createdAt || new Date(0).toISOString(),
      };
    });

    // Unified collections for Playlists & Albums
    const allUnified = [...albumItems, ...playlistItems];

    // Sorted by Last heard
    const unifiedRecent = [...allUnified].sort(
      (a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime()
    );

    // Sorted by Most heard
    const unifiedMostHeard = [...allUnified].sort((a, b) => {
      if (b.playCount !== a.playCount) return b.playCount - a.playCount;
      return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
    });

    const recent: Track[] = (recentRows as any[]).map((r) => ({
      ...r.track,
      source: (r.track?.source as any) || "local",
    }));

    const mostHeard: Track[] = (mostHeardRows as any[]).map((r) => ({
      ...r.track,
      source: (r.track?.source as any) || "local",
    }));

    return NextResponse.json({
      recent,
      mostHeard,
      playlistsAndAlbums: {
        recent: unifiedRecent,
        mostHeard: unifiedMostHeard,
      },
      albums: albumItems.map((a) => a.item as Album),
      playlists: playlistItems.map((p) => p.item as Playlist),
      hasHistory:
        recent.length > 0 ||
        mostHeard.length > 0 ||
        unifiedRecent.length > 0,
    });
  } catch (err) {
    console.error("Failed to fetch user history:", err);
    return NextResponse.json(
      {
        recent: [],
        mostHeard: [],
        playlistsAndAlbums: { recent: [], mostHeard: [] },
        albums: [],
        playlists: [],
        hasHistory: false,
      },
      { status: 500 }
    );
  }
}
