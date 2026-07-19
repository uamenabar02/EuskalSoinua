import { NextResponse } from "next/server";
import { recordListenEvent } from "@/lib/recommender";
import { getTrack, setLikeState } from "@/lib/queries";
import { cookies } from "next/headers";
import { db } from "@/db";
import { listenEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

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
      syncKey,
    });
    await setLikeState(track.id, true, syncKey);
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
      syncKey,
    });
    await setLikeState(track.id, false, syncKey);
  }

  return NextResponse.json({ ok: true, feedback: body.feedback });
}

/**
 * DELETE FEEDBACK
 * ----------------------------------------------------------------------------
 * Deletes all recorded listen events for the given trackId, resetting its
 * recommendation signals.
 */
export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const body = (await request.json().catch(() => ({}))) as {
    trackId?: number;
  };
  if (!body.trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  await db.delete(listenEvents).where(and(eq(listenEvents.trackId, body.trackId), eq(listenEvents.syncKey, syncKey)));

  return NextResponse.json({ ok: true });
}

/**
 * UPDATE FEEDBACK
 * ----------------------------------------------------------------------------
 * Deletes existing listen events for a track and records a fresh positive or
 * negative swipe signal.
 */
export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

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

  // Wipe old events first to start fresh
  await db.delete(listenEvents).where(and(eq(listenEvents.trackId, track.id), eq(listenEvents.syncKey, syncKey)));

  if (body.feedback === "like") {
    await recordListenEvent({
      trackId: track.id,
      artistId: track.artistId,
      genre: track.genre,
      region: track.region,
      completed: true,
      skipped: false,
      listenSeconds: track.duration,
      syncKey,
    });
    await setLikeState(track.id, true, syncKey);
  } else {
    await recordListenEvent({
      trackId: track.id,
      artistId: track.artistId,
      genre: track.genre,
      region: track.region,
      completed: false,
      skipped: true,
      listenSeconds: 0,
      syncKey,
    });
    await setLikeState(track.id, false, syncKey);
  }

  return NextResponse.json({ ok: true, feedback: body.feedback });
}
