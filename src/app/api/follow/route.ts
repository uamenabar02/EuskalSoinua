import { NextResponse } from "next/server";
import { toggleFollow } from "@/lib/queries";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { artistId } = (await request.json().catch(() => ({}))) as {
    artistId?: number;
  };
  if (!artistId)
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  const followed = await toggleFollow(artistId, syncKey);
  return NextResponse.json({ followed });
}
