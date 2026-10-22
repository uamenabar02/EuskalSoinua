import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateDailyMixes } from "@/lib/daily-mixes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";
    const explicitSeed = searchParams.get("seed");
    const seed = explicitSeed || cookieStore.get("daily_mix_seed")?.value || undefined;

    const mixes = await generateDailyMixes(syncKey, seed);
    const response = NextResponse.json({ mixes, seed });
    if (explicitSeed) {
      response.cookies.set("daily_mix_seed", explicitSeed, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
    }
    return response;
  } catch (err) {
    console.error("Failed to generate daily mixes:", err);
    return NextResponse.json({ mixes: [] }, { status: 500 });
  }
}
