import { NextResponse } from "next/server";
import { recordListenEvent } from "@/lib/recommender";
import { getTrack } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * RECOMMENDATION FEEDBACK
 * ----------------------------------------------------------------------------
 * Records a strong positive ("like") or negative ("dislike") signal that the
 * on-device recommendation engine uses immediately. A "like" is stored as a
 * completed listen (max positive weight); a "dislike" is stored as a skip with
 * zero seconds (max negative weight). The next reload of For You reflects it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    trackId?: number;
    feedback?: "like" | "dislike";
  };
  if (!body.trackId || !body.feedback) {
    return NextResponse.json({ error: "trackId and feedback required" }, { status: 400 });
  }
  const track = await getTrack(body.trackId);
  if (!track) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (body.feedback === "like") {
    // Strong positive: completed listen with full duration
    await recordListenEvent({
      trackId: track.id,
      artistId: track.artistId,
      genre: track.genre,
      region: track.region,
      completed: true,
      skipped: false,
      listenSeconds: track.duration,
    });
  } else {
    // Strong negative: skip at 0 seconds
    await recordListenEvent({
      trackId: track.id,
      artistId: track.artistId,
      genre: track.genre,
      region: track.region,
      completed: false,
      skipped: true,
      listenSeconds: 0,
    });
  }

  return NextResponse.json({ ok: true, feedback: body.feedback });
}
