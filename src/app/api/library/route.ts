import { NextResponse } from "next/server";
import {
  getLikedTracks,
  getPlaylists,
  getRadioPlaylists,
  getFollowedArtists,
  getSavedAlbums,
} from "@/lib/queries";
import { ensureSeed } from "@/lib/seed";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const [liked, playlists, radios, followed, albums] = await Promise.all([
    getLikedTracks(syncKey),
    getPlaylists(syncKey),
    getRadioPlaylists(syncKey),
    getFollowedArtists(syncKey),
    getSavedAlbums(syncKey),
  ]);
  return NextResponse.json({ liked, playlists, radios, followed, albums });
}
