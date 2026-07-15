import { NextResponse } from "next/server";
import { toggleSaveAlbum } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { albumId } = (await request.json().catch(() => ({}))) as {
    albumId?: number;
  };
  if (!albumId) return NextResponse.json({ error: "albumId required" }, { status: 400 });
  const saved = await toggleSaveAlbum(albumId);
  return NextResponse.json({ saved });
}
