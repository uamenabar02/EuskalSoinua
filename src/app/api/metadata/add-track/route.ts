import { NextResponse } from "next/server";
import { db } from "@/db";
import { tracks as tracksTable, artists as artistsTable, albums as albumsTable } from "@/db/schema";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      videoId,
      title,
      artistName,
      albumName,
      genre,
      region = "global",
      language = "und",
      duration = 180,
      artworkUrl,
    } = body;

    if (!videoId || !title || !artistName) {
      return NextResponse.json(
        { error: "videoId, title, and artistName are required" },
        { status: 400 }
      );
    }

    const cleanVideoId = String(videoId).trim();
    const cleanTitle = String(title).trim();
    const cleanArtist = String(artistName).trim();
    const cleanAlbum = albumName?.trim() || "Single";
    const cleanGenre = genre?.trim() || null;
    const thumbnail = artworkUrl || `https://i.ytimg.com/vi/${cleanVideoId}/hqdefault.jpg`;

    // 1. Resolve or match Artist (case-insensitive + normalized)
    // Avoid creating duplicate artists when casing or punctuation differs (e.g. "LA TXAMA" vs "La Txama")
    let artistId: number | null = null;
    let canonicalArtistName = cleanArtist;
    let artistWasExisting = false;

    const existingArtists = await db
      .select()
      .from(artistsTable)
      .where(
        or(
          ilike(artistsTable.name, cleanArtist),
          sql`LOWER(TRIM(${artistsTable.name})) = ${cleanArtist.toLowerCase()}`,
          sql`LOWER(REPLACE(REPLACE(${artistsTable.name}, '-', ' '), '.', '')) = ${cleanArtist.toLowerCase().replace(/[-.]/g, ' ')}`
        )
      )
      .limit(1);

    if (existingArtists.length > 0) {
      const match = existingArtists[0];
      artistId = match.id;
      canonicalArtistName = match.name; // Keep canonical casing!
      artistWasExisting = true;

      // Update thumbnail/genre if previously missing
      if (!match.thumbnail || !match.genre) {
        await db
          .update(artistsTable)
          .set({
            thumbnail: match.thumbnail || thumbnail,
            genre: match.genre || cleanGenre,
          })
          .where(eq(artistsTable.id, match.id));
      }
    } else {
      const [newArtist] = await db
        .insert(artistsTable)
        .values({
          name: cleanArtist,
          thumbnail: thumbnail,
          genre: cleanGenre,
          region: region || "global",
          language: language || "und",
          source: "youtube",
        })
        .returning();
      artistId = newArtist.id;
      canonicalArtistName = newArtist.name;
    }

    // 2. Resolve or match Album (scoped to the artist)
    // Avoid creating duplicate albums when casing differs (e.g. "SINGLE" vs "Single")
    let albumId: number | null = null;
    let canonicalAlbumName = cleanAlbum;
    let albumWasExisting = false;

    if (artistId) {
      // Find album matching this artist
      const existingAlbums = await db
        .select()
        .from(albumsTable)
        .where(
          and(
            eq(albumsTable.artistId, artistId),
            or(
              ilike(albumsTable.title, cleanAlbum),
              sql`LOWER(TRIM(${albumsTable.title})) = ${cleanAlbum.toLowerCase()}`
            )
          )
        )
        .limit(1);

      if (existingAlbums.length > 0) {
        const matchAlb = existingAlbums[0];
        albumId = matchAlb.id;
        canonicalAlbumName = matchAlb.title; // Keep canonical casing!
        albumWasExisting = true;

        // Increment track count on existing album
        await db
          .update(albumsTable)
          .set({
            trackCount: sql`COALESCE(${albumsTable.trackCount}, 0) + 1`,
            thumbnail: matchAlb.thumbnail || thumbnail,
          })
          .where(eq(albumsTable.id, matchAlb.id));
      } else {
        const [newAlbum] = await db
          .insert(albumsTable)
          .values({
            title: cleanAlbum,
            artistId,
            artistName: canonicalArtistName,
            thumbnail: thumbnail,
            genre: cleanGenre,
            region: region || "global",
            trackCount: 1,
            source: "youtube",
          })
          .returning();
        albumId = newAlbum.id;
        canonicalAlbumName = newAlbum.title;
      }
    }

    // 3. Check if track already exists with this YouTube videoId
    const existingByExternal = await db
      .select()
      .from(tracksTable)
      .where(eq(tracksTable.externalId, cleanVideoId))
      .limit(1);

    if (existingByExternal.length > 0) {
      const existing = existingByExternal[0];
      const [updated] = await db
        .update(tracksTable)
        .set({
          title: cleanTitle,
          artistId: artistId || existing.artistId,
          artistName: canonicalArtistName,
          albumId: albumId || existing.albumId,
          albumName: canonicalAlbumName,
          genre: cleanGenre || existing.genre,
          region: region || existing.region,
          artworkUrl: thumbnail,
          thumbnail: thumbnail,
        })
        .where(eq(tracksTable.id, existing.id))
        .returning();

      return NextResponse.json({
        success: true,
        alreadyExists: true,
        track: mapTrack(updated),
        resolvedArtist: {
          id: artistId,
          name: canonicalArtistName,
          wasExisting: artistWasExisting,
        },
        resolvedAlbum: {
          id: albumId,
          title: canonicalAlbumName,
          wasExisting: albumWasExisting,
        },
      });
    }

    // 4. Insert new Track with canonical artist and album names
    const [inserted] = await db
      .insert(tracksTable)
      .values({
        title: cleanTitle,
        artistId,
        artistName: canonicalArtistName,
        albumId,
        albumName: canonicalAlbumName,
        duration: Number(duration) || 180,
        genre: cleanGenre,
        region: region || "global",
        language: language || "und",
        artworkUrl: thumbnail,
        thumbnail: thumbnail,
        source: "youtube",
        externalId: cleanVideoId,
        playCount: 10,
      })
      .returning();

    return NextResponse.json({
      success: true,
      alreadyExists: false,
      track: mapTrack(inserted),
      resolvedArtist: {
        id: artistId,
        name: canonicalArtistName,
        wasExisting: artistWasExisting,
      },
      resolvedAlbum: {
        id: albumId,
        title: canonicalAlbumName,
        wasExisting: albumWasExisting,
      },
    });
  } catch (error: any) {
    console.error("Error adding YouTube track to metadata:", error);
    return NextResponse.json(
      { error: "Failed to add track to metadata", details: error?.message },
      { status: 500 }
    );
  }
}
