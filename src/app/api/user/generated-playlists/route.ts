import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ALL_GENERATED_FORMATS,
  generateGeneratedPlaylists,
  getGeneratedPlaylistById,
} from "@/lib/playlists/generated";
import type { PlaylistFormat } from "@/lib/playlists/format-registry";

export const dynamic = "force-dynamic";

const VALID_FORMATS = new Set<string>(ALL_GENERATED_FORMATS);

function isFormat(value: string): value is PlaylistFormat {
  return VALID_FORMATS.has(value);
}

/**
 * GENERATED PLAYLISTS API (Layer 1)
 * ----------------------------------------------------------------------------
 * `GET /api/user/generated-playlists`
 *   → every algorithmic playlist (Daily Mix, Discover Weekly, Release Radar,
 *     On Repeat, Repeat Rewind, Topic/Artist mixes, Daily Drive).
 * `?formats=daily-mix,on-repeat` limits the payload.
 * `?id=daily-mix-2` resolves a single playlist (used by /playlist/[id]).
 * `?seed=...` forces a deterministic rotation.
 *
 * Zero AI calls: everything here is derived from the local catalog + signals.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const explicitSeed = searchParams.get("seed");
  const seed = explicitSeed || cookieStore.get("playlist_seed")?.value || undefined;
  const id = searchParams.get("id");

  try {
    if (id) {
      const playlist = await getGeneratedPlaylistById(id, syncKey, seed);
      if (!playlist) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({ playlist }, { headers: { "Cache-Control": "no-store" } });
    }

    const formatsParam = searchParams.get("formats");
    const formats = formatsParam
      ? formatsParam
          .split(",")
          .map((value) => value.trim())
          .filter(isFormat)
      : undefined;

    const playlists = await generateGeneratedPlaylists(
      syncKey,
      seed,
      formats && formats.length > 0 ? formats : undefined,
    );

    const response = NextResponse.json(
      { playlists, count: playlists.length, seed: seed ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );

    if (explicitSeed) {
      response.cookies.set("playlist_seed", explicitSeed, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
    }

    return response;
  } catch (err) {
    console.error("Failed to generate playlists:", err);
    return NextResponse.json({ playlists: [], count: 0 }, { status: 500 });
  }
}
