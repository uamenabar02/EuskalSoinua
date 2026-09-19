import { NextResponse } from "next/server";
import { getPlaylist } from "@/lib/queries";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { playlists } from "@/db/schema";
import { cookies } from "next/headers";
import { getDailyMixById } from "@/lib/daily-mixes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { id } = await params;

  // If this is a Daily Mix ID (e.g. daily-mix-1, daily-mix-2, etc.)
  if (id.startsWith("daily-")) {
    const mix = await getDailyMixById(id, syncKey);
    if (!mix) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      playlist: {
        id: mix.id,
        name: mix.title,
        description: `${mix.genre} • ${mix.description}`,
        coverSeed: mix.id,
        type: "daily_mix",
        trackCount: mix.tracks.length,
      },
      tracks: mix.tracks,
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
  if (id.startsWith("daily-")) {
    return NextResponse.json({ error: "Cannot delete a Daily Mix" }, { status: 400 });
  }

  await db.delete(playlists).where(and(eq(playlists.id, Number(id)), eq(playlists.syncKey, syncKey)));
  return NextResponse.json({ ok: true });
}
