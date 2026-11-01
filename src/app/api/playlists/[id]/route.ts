import { NextResponse } from "next/server";
import { getPlaylist } from "@/lib/queries";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { playlists } from "@/db/schema";
import { cookies } from "next/headers";
import { getGeneratedPlaylistById } from "@/lib/playlists/generated";
import { isGeneratedPlaylistId } from "@/lib/playlists/format-registry";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { id } = await params;

  // Generated playlists (daily-mix-N, discover-weekly, topic-mix-*, ...)
  if (isGeneratedPlaylistId(id)) {
    const url = new URL(_request.url);
    const querySeed = url.searchParams.get("seed");
    const cookieSeed = cookieStore.get("playlist_seed")?.value || cookieStore.get("daily_mix_seed")?.value;
    const seed = querySeed || cookieSeed || undefined;

    const generated = await getGeneratedPlaylistById(id, syncKey, seed);
    if (!generated) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({
      playlist: {
        id: generated.id,
        name: generated.title,
        description: `${generated.genre} • ${generated.description}`,
        coverSeed: generated.id,
        // `daily_mix` is kept for backwards compatibility with the player UI;
        // every generated format is read-only and refreshed automatically.
        type: generated.format === "daily-mix" ? "daily_mix" : generated.format,
        trackCount: generated.tracks.length,
      },
      tracks: generated.tracks,
      format: generated.format,
      accentColor: generated.accentColor,
      requestId: generated.requestId,
    });
  }

  const data = await getPlaylist(Number(id), syncKey);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { id } = await params;
  if (isGeneratedPlaylistId(id)) {
    return NextResponse.json({ error: "Cannot delete a generated playlist" }, { status: 400 });
  }

  await db.delete(playlists).where(and(eq(playlists.id, Number(id)), eq(playlists.syncKey, syncKey)));
  return NextResponse.json({ ok: true });
}
