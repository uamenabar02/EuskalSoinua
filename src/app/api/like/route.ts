import { NextResponse } from "next/server";
import { toggleLike } from "@/lib/queries";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { trackId } = (await request.json().catch(() => ({}))) as { trackId?: number };
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });
  const liked = await toggleLike(trackId, syncKey);
  return NextResponse.json({ liked });
}
