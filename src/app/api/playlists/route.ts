import { NextResponse } from "next/server";
import { getPlaylists, createPlaylist } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const playlists = await getPlaylists();
  return NextResponse.json({ playlists });
}

export async function POST(request: Request) {
  const { name, description } = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  if (!name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  const playlist = await createPlaylist(name.trim(), description?.trim());
  return NextResponse.json({ playlist });
}
