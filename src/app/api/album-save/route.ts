import { NextResponse } from "next/server";
import { toggleSaveAlbum } from "@/lib/queries";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { albumId } = (await request.json().catch(() => ({}))) as {
    albumId?: number;
  };
  if (!albumId) return NextResponse.json({ error: "albumId required" }, { status: 400 });
  const saved = await toggleSaveAlbum(albumId, syncKey);
  return NextResponse.json({ saved });
}
