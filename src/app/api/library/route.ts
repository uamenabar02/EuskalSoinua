import { NextResponse } from "next/server";
import {
  getLikedTracks,
  getPlaylists,
  getRadioPlaylists,
  getFollowedArtists,
  getSavedAlbums,
} from "@/lib/queries";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const [liked, playlists, radios, followed, albums] = await Promise.all([
    getLikedTracks(),
    getPlaylists(),
    getRadioPlaylists(),
    getFollowedArtists(),
    getSavedAlbums(),
  ]);
  return NextResponse.json({ liked, playlists, radios, followed, albums });
}
