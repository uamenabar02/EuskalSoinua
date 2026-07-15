import { NextResponse } from "next/server";
import { getSponsorSegments } from "@/lib/sources/streaming";

export const dynamic = "force-dynamic";

/** Non-music / sponsor segment list for auto-skip. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ segments: [] });
  }
  const segments = await getSponsorSegments(videoId);
  return NextResponse.json({ segments });
}
