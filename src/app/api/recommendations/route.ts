import { NextResponse } from "next/server";
import { getRecommendations, getTasteProfile } from "@/lib/recommender";
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

  const [recs, taste] = await Promise.all([
    getRecommendations({ limit, basqueBooster, seedTrackId, excludeTrackIds, syncKey }),
    getTasteProfile(syncKey),
  ]);
  return NextResponse.json({ recommendations: recs, taste });
}
