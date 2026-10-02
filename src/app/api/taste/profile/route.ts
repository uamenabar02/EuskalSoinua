import { NextResponse } from "next/server";
import { getTasteProfile } from "@/lib/recommender";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const taste = await getTasteProfile(syncKey);
  return NextResponse.json(taste);
}
