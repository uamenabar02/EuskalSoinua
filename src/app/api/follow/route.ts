import { NextResponse } from "next/server";
import { toggleFollow } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { artistId } = (await request.json().catch(() => ({}))) as {
    artistId?: number;
  };
  if (!artistId)
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  const followed = await toggleFollow(artistId);
  return NextResponse.json({ followed });
}
