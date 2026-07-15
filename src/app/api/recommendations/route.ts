import { NextResponse } from "next/server";
import { getRecommendations, getTasteProfile } from "@/lib/recommender";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSeed();
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "24");
  const basqueBooster = searchParams.get("basqueBooster") === "true";
  const seedTrackId = searchParams.get("seedTrackId")
    ? Number(searchParams.get("seedTrackId"))
    : null;

  const [recs, taste] = await Promise.all([
    getRecommendations({ limit, basqueBooster, seedTrackId }),
    getTasteProfile(),
  ]);
  return NextResponse.json({ recommendations: recs, taste });
}
