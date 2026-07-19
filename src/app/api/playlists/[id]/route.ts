import { NextResponse } from "next/server";
import { getPlaylist } from "@/lib/queries";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { playlists } from "@/db/schema";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { id } = await params;
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
  await db.delete(playlists).where(and(eq(playlists.id, Number(id)), eq(playlists.syncKey, syncKey)));
  return NextResponse.json({ ok: true });
}
