import "server-only";
import {
  generateGeneratedPlaylists,
  type GeneratedPlaylist,
} from "@/lib/playlists/generated";
import type { Track } from "@/lib/types";

/**
 * DAILY MIXES (Layer 1)
 * ----------------------------------------------------------------------------
 * Thin adapter over the shared playlist generators. The heavy lifting lives in
 * `src/lib/playlists/generated.ts`, which anchors mixes on the user's own
 * artist clusters instead of seven hard-coded themes.
 *
 * Six artist-cluster mixes per user, refreshed daily, no forced Basque slot —
 * Basque music surfaces naturally when it is what the user actually plays.
 */

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  genre: string;
  tracks: Track[];
}

function toDailyMix(playlist: GeneratedPlaylist): DailyMix {
  return {
    id: playlist.id,
    title: playlist.title,
    subtitle: playlist.subtitle,
    description: playlist.description,
    accentColor: playlist.accentColor,
    genre: playlist.genre,
    tracks: playlist.tracks,
  };
}

/**
 * Generates the user's Daily Mixes. `seedValue` lets the UI request a fresh
 * deterministic rotation; when omitted the daily refresh seed is used.
 */
export async function generateDailyMixes(
  syncKey: string = "default",
  seedValue?: string,
): Promise<DailyMix[]> {
  const playlists = await generateGeneratedPlaylists(syncKey, seedValue, ["daily-mix"]);
  return playlists.map(toDailyMix);
}

export async function getDailyMixById(
  mixId: string,
  syncKey: string = "default",
  seedValue?: string,
): Promise<DailyMix | null> {
  const mixes = await generateDailyMixes(syncKey, seedValue);
  return mixes.find((mix) => mix.id === mixId) ?? null;
}
