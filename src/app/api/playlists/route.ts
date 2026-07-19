import { NextResponse } from "next/server";
import { getPlaylists, createPlaylist } from "@/lib/queries";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const playlists = await getPlaylists(syncKey);
  return NextResponse.json({ playlists });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { name, description } = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  if (!name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  const playlist = await createPlaylist(name.trim(), description?.trim(), "user", syncKey);
  return NextResponse.json({ playlist });
}
