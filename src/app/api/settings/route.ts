import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const dynamic = "force-dynamic";

const KEYS = ["basque_booster", "eq_preset", "sponsorblock", "shuffle", "full_track", "crossfade", "music_preferences"] as const;

export async function GET() {
  const rows = await db.select().from(settings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  let musicPrefs = { genres: [], regions: [] };
  if (map.music_preferences) {
    try {
      musicPrefs = JSON.parse(map.music_preferences);
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }
  return NextResponse.json({
    basque_booster: map.basque_booster === "true",
    eq_preset: map.eq_preset ?? "Flat",
    sponsorblock: map.sponsorblock !== "false",
    shuffle: map.shuffle === "true",
    full_track: map.full_track === "true",
    crossfade: Number(map.crossfade ?? "0") || 0,
    music_preferences: musicPrefs,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of KEYS) {
    if (key in body) {
      const value = String(body[key]);
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
  }
  return NextResponse.json({ ok: true });
}
