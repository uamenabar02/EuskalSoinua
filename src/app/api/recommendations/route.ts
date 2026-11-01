import { NextResponse } from "next/server";
import {
  getRecommendations,
  getRecommendationShelves,
  getTasteProfile,
} from "@/lib/recommender";
import { ensureSeed } from "@/lib/seed";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSeed();
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "24");
  const basqueBooster = searchParams.get("basqueBooster") === "true";
  const seedTrackId = searchParams.get("seedTrackId")
    ? Number(searchParams.get("seedTrackId"))
    : null;
  const excludeStr = searchParams.get("exclude") ?? "";
  const excludeTrackIds = excludeStr ? excludeStr.split(",").map(Number) : [];
  // Stable per-day rotation unless the client asks for a fresh seed.
  const seed = searchParams.get("seed") ?? undefined;
  const shelves = searchParams.get("shelves") === "1";

  if (shelves) {
    const [rows, taste] = await Promise.all([
      getRecommendationShelves({ syncKey, limit, seed, excludeTrackIds }),
      getTasteProfile(syncKey),
    ]);
    return NextResponse.json({ shelves: rows, taste });
  }

  const [recs, taste] = await Promise.all([
    getRecommendations({ limit, basqueBooster, seedTrackId, excludeTrackIds, syncKey, seed }),
    getTasteProfile(syncKey),
  ]);
  return NextResponse.json({ recommendations: recs, taste });
}
