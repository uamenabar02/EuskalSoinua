import { NextResponse } from "next/server";
import { recordListenEvent } from "@/lib/recommender";
import { getTrack } from "@/lib/queries";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** Record a privacy-local listening signal (completed / skipped). */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const body = (await request.json().catch(() => ({}))) as {
    trackId?: number;
    completed?: boolean;
    skipped?: boolean;
    listenSeconds?: number;
  };
  if (!body.trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }
  const track = await getTrack(body.trackId);
  if (!track) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordListenEvent({
    trackId: track.id,
    artistId: track.artistId,
    genre: track.genre,
    region: track.region,
    completed: body.completed ?? false,
    skipped: body.skipped ?? false,
    listenSeconds: body.listenSeconds ?? 0,
    syncKey,
  });
  return NextResponse.json({ ok: true });
}
