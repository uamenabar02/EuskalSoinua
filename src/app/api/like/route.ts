import { NextResponse } from "next/server";
import { toggleLike } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { trackId } = (await request.json().catch(() => ({}))) as { trackId?: number };
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });
  const liked = await toggleLike(trackId);
  return NextResponse.json({ liked });
}
