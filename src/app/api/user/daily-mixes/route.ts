import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateDailyMixes } from "@/lib/daily-mixes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seed = searchParams.get("seed") || undefined;
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";

    const mixes = await generateDailyMixes(syncKey, seed);
    return NextResponse.json({ mixes });
  } catch (err) {
    console.error("Failed to generate daily mixes:", err);
    return NextResponse.json({ mixes: [] }, { status: 500 });
  }
}
