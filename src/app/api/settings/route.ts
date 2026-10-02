import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KEYS = ["basque_booster", "eq_preset", "sponsorblock", "shuffle", "full_track", "crossfade", "music_preferences"] as const;

export async function GET() {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const rows = await db.select().from(settings).where(eq(settings.syncKey, syncKey));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  let musicPrefs = {
    genres: [] as string[],
    regions: ["eu", "global"] as string[],
    favoriteArtists: [] as string[],
    energy: 3,
    discoveryMode: "balanced",
    eras: ["contemporary_20s", "modern_10s"] as string[],
    languagePreference: "multilingual",
    moods: ["chill", "focus"] as string[],
  };
  if (map.music_preferences) {
    try {
      const parsed = JSON.parse(map.music_preferences);
      musicPrefs = { ...musicPrefs, ...parsed };
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }
  return NextResponse.json({
    basque_booster: map.basque_booster === "true",
    eq_preset: map.eq_preset ?? "Flat",
    sponsorblock: map.sponsorblock !== "false",
    shuffle: map.shuffle === "true",
    full_track: map.full_track !== undefined ? map.full_track === "true" : true,
    crossfade: Number(map.crossfade ?? "0") || 0,
    music_preferences: musicPrefs,
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of KEYS) {
    if (key in body) {
      const rawVal = body[key];
      const value = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal);
      await db
        .insert(settings)
        .values({ syncKey, key, value })
        .onConflictDoUpdate({ target: [settings.syncKey, settings.key], set: { value } });
    }
  }
  return NextResponse.json({ ok: true });
}
