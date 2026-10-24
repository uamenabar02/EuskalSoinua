import { NextResponse } from "next/server";
import { db } from "@/db";
import { artists, albums, tracks } from "@/db/schema";
import { eq, ilike, inArray, and, or } from "drizzle-orm";
import { recordArtistExclusions, removeArtistExclusion } from "@/lib/artist-exclusions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { entityType, title, itemId } = body as {
      entityType: "album" | "track";
      title: string;
      itemId?: number;
    };

    if (!entityType || !title) {
      return NextResponse.json({ error: "Missing entityType or title" }, { status: 400 });
    }

    // Resolve artist
    let artistRow: any = null;
    const isNumeric =
      typeof id === "number" ||
      (!isNaN(Number(id)) && !String(id).includes("%") && String(id).trim() !== "");

    if (isNumeric) {
      const rows = await db
        .select()
        .from(artists)
        .where(eq(artists.id, Number(id)))
        .limit(1);
      artistRow = rows[0];
    } else {
      const nameStr = decodeURIComponent(String(id)).trim();
      if (nameStr) {
        const rows = await db
          .select()
          .from(artists)
          .where(ilike(artists.name, nameStr))
          .limit(1);
        artistRow = rows[0];
      }
    }

    if (!artistRow) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    const artistName = artistRow.name;

    // Record in persistent blacklist
    await recordArtistExclusions(artistName, [
      {
        entityType,
        title,
        artistId: artistRow.id,
        reason: "direct_page_removal",
      },
    ]);

    if (entityType === "album") {
      // Find matching album ID if not provided
      let targetAlbumId = itemId;
      if (!targetAlbumId) {
        const found = await db
          .select({ id: albums.id })
          .from(albums)
          .where(
            and(
              ilike(albums.title, title.trim()),
              or(eq(albums.artistId, artistRow.id), ilike(albums.artistName, artistName)),
            ),
          )
          .limit(1);
        targetAlbumId = found[0]?.id;
      }

      // Also record all tracks in this album to blacklist
      if (targetAlbumId) {
        const trs = await db
          .select({ title: tracks.title })
          .from(tracks)
          .where(eq(tracks.albumId, targetAlbumId));

        if (trs.length > 0) {
          await recordArtistExclusions(
            artistName,
            trs.map((t: { title: string }) => ({
              entityType: "track" as const,
              title: t.title,
              artistId: artistRow.id,
              reason: "album_direct_removal_track",
            })),
          );
        }

        // Delete album tracks
        await db.delete(tracks).where(eq(tracks.albumId, targetAlbumId));
        // Delete album
        await db.delete(albums).where(eq(albums.id, targetAlbumId));
      } else {
        // Delete by albumName if no id
        await db
          .delete(tracks)
          .where(
            and(
              ilike(tracks.albumName, title.trim()),
              or(eq(tracks.artistId, artistRow.id), ilike(tracks.artistName, artistName)),
            ),
          );
      }
    } else if (entityType === "track") {
      if (itemId) {
        await db.delete(tracks).where(eq(tracks.id, itemId));
      } else {
        await db
          .delete(tracks)
          .where(
            and(
              ilike(tracks.title, title.trim()),
              or(eq(tracks.artistId, artistRow.id), ilike(tracks.artistName, artistName)),
            ),
          );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully removed and blacklisted ${entityType} "${title}"`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to exclude item" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title");
    const entityType = searchParams.get("entityType") as "album" | "track";

    if (!title || !entityType) {
      return NextResponse.json({ error: "Missing title or entityType" }, { status: 400 });
    }

    const artistName = decodeURIComponent(id);
    await removeArtistExclusion(artistName, title, entityType);

    return NextResponse.json({ success: true, message: "Exclusion removed" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to remove exclusion" },
      { status: 500 },
    );
  }
}
