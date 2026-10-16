import { NextResponse } from "next/server";
import { db } from "@/db";
import { artists as artistsTable, albums as albumsTable, tracks as tracksTable } from "@/db/schema";
import { eq, ilike, or, and, sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export interface ArtistSuggestion {
  id: number;
  name: string;
  thumbnail: string | null;
  genre: string | null;
  region: string | null;
  language: string | null;
  trackCount: number;
  albumCount: number;
  isExactMatch: boolean;
  isDifferentCasing: boolean;
}

export interface AlbumSuggestion {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  thumbnail: string | null;
  year: number | null;
  genre: string | null;
  trackCount: number;
  isExactMatch: boolean;
  isDifferentCasing: boolean;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = searchParams.get("type") ?? "all"; // "artist" | "album" | "all"
    const artistName = (searchParams.get("artistName") ?? "").trim();
    const artistIdParam = searchParams.get("artistId");
    const artistId = artistIdParam ? Number(artistIdParam) : null;

    let artistSuggestions: ArtistSuggestion[] = [];
    let albumSuggestions: AlbumSuggestion[] = [];

    // 1. Artist suggestions
    if (type === "artist" || type === "all") {
      if (q.length > 0) {
        const cleanQ = q.toLowerCase();

        // Query artists matching query
        const artistRows = await db
          .select()
          .from(artistsTable)
          .where(
            or(
              ilike(artistsTable.name, `%${q}%`),
              sql`LOWER(REPLACE(REPLACE(${artistsTable.name}, '-', ' '), '.', '')) LIKE ${'%' + cleanQ.replace(/[-.]/g, ' ') + '%'}`
            )
          )
          .orderBy(
            sql`CASE 
              WHEN LOWER(${artistsTable.name}) = ${cleanQ} THEN 0 
              WHEN LOWER(${artistsTable.name}) LIKE ${cleanQ + '%'} THEN 1 
              ELSE 2 
            END`,
            desc(artistsTable.monthlyListeners)
          )
          .limit(10);

        // Fetch counts for matching artists
        const artistIds = artistRows.map((a: any) => a.id);
        const [albumCounts, trackCounts] = await Promise.all([
          artistIds.length > 0
            ? db
                .select({
                  artistId: albumsTable.artistId,
                  count: sql<number>`count(*)::int`,
                })
                .from(albumsTable)
                .where(sql`${albumsTable.artistId} IN (${sql.join(artistIds.map((id: number) => sql`${id}`), sql`, `)})`)
                .groupBy(albumsTable.artistId)
            : Promise.resolve([]),
          artistIds.length > 0
            ? db
                .select({
                  artistId: tracksTable.artistId,
                  count: sql<number>`count(*)::int`,
                })
                .from(tracksTable)
                .where(sql`${tracksTable.artistId} IN (${sql.join(artistIds.map((id: number) => sql`${id}`), sql`, `)})`)
                .groupBy(tracksTable.artistId)
            : Promise.resolve([]),
        ]);

        const albumCountMap = new Map<number, number>();
        for (const item of albumCounts) {
          if (item.artistId) albumCountMap.set(item.artistId, Number(item.count));
        }

        const trackCountMap = new Map<number, number>();
        for (const item of trackCounts) {
          if (item.artistId) trackCountMap.set(item.artistId, Number(item.count));
        }

        artistSuggestions = artistRows.map((a: any) => {
          const isExactMatch = a.name.trim().toLowerCase() === cleanQ;
          const isDifferentCasing = isExactMatch && a.name.trim() !== q;
          return {
            id: a.id,
            name: a.name,
            thumbnail: a.thumbnail,
            genre: a.genre,
            region: a.region,
            language: a.language,
            trackCount: trackCountMap.get(a.id) ?? 0,
            albumCount: albumCountMap.get(a.id) ?? 0,
            isExactMatch,
            isDifferentCasing,
          };
        });
      }
    }

    // 2. Album suggestions
    if (type === "album" || type === "all") {
      const cleanQ = q.toLowerCase();

      // First, resolve artistId if artistName was provided
      let resolvedArtistId = artistId;
      if (!resolvedArtistId && artistName) {
        const foundArtist = await db
          .select({ id: artistsTable.id })
          .from(artistsTable)
          .where(ilike(artistsTable.name, artistName))
          .limit(1);
        if (foundArtist.length > 0) {
          resolvedArtistId = foundArtist[0].id;
        }
      }

      let albumRows: any[] = [];

      if (resolvedArtistId) {
        // Fetch all albums belonging to this artist
        albumRows = await db
          .select()
          .from(albumsTable)
          .where(eq(albumsTable.artistId, resolvedArtistId))
          .orderBy(
            cleanQ
              ? sql`CASE 
                  WHEN LOWER(${albumsTable.title}) = ${cleanQ} THEN 0 
                  WHEN LOWER(${albumsTable.title}) LIKE ${cleanQ + '%'} THEN 1 
                  ELSE 2 
                END`
              : desc(albumsTable.year),
            desc(albumsTable.trackCount)
          )
          .limit(15);
      } else if (artistName) {
        // Search by artistName text on albums
        albumRows = await db
          .select()
          .from(albumsTable)
          .where(ilike(albumsTable.artistName, `%${artistName}%`))
          .orderBy(desc(albumsTable.trackCount))
          .limit(15);
      } else if (q.length > 0) {
        // General album title search
        albumRows = await db
          .select()
          .from(albumsTable)
          .where(ilike(albumsTable.title, `%${q}%`))
          .orderBy(
            sql`CASE 
              WHEN LOWER(${albumsTable.title}) = ${cleanQ} THEN 0 
              WHEN LOWER(${albumsTable.title}) LIKE ${cleanQ + '%'} THEN 1 
              ELSE 2 
            END`,
            desc(albumsTable.trackCount)
          )
          .limit(10);
      }

      albumSuggestions = albumRows.map((alb: any) => {
        const isExactMatch = cleanQ.length > 0 && alb.title.trim().toLowerCase() === cleanQ;
        const isDifferentCasing = isExactMatch && alb.title.trim() !== q;
        return {
          id: alb.id,
          title: alb.title,
          artistId: alb.artistId,
          artistName: alb.artistName,
          thumbnail: alb.thumbnail,
          year: alb.year,
          genre: alb.genre,
          trackCount: alb.trackCount ?? 0,
          isExactMatch,
          isDifferentCasing,
        };
      });
    }

    return NextResponse.json({
      artists: artistSuggestions,
      albums: albumSuggestions,
    });
  } catch (error: any) {
    console.error("Error in metadata suggestions route:", error);
    return NextResponse.json({ artists: [], albums: [], error: error?.message }, { status: 500 });
  }
}
