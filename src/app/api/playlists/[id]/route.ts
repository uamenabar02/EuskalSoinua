import { NextResponse } from "next/server";
import { getPlaylist } from "@/lib/queries";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { playlists } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getPlaylist(Number(id));
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(playlists).where(eq(playlists.id, Number(id)));
  return NextResponse.json({ ok: true });
}
