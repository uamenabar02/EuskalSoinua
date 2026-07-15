import { NextResponse } from "next/server";
import { addTrackToPlaylist, removeTrackFromPlaylist } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { trackId } = (await request.json().catch(() => ({}))) as {
    trackId?: number;
  };
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });
  const result = await addTrackToPlaylist(Number(id), trackId);
  return NextResponse.json(result);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });
  await removeTrackFromPlaylist(Number(id), trackId);
  return NextResponse.json({ ok: true });
}
