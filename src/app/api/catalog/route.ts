import { NextResponse, NextRequest } from "next/server";
import { getHomeSections } from "@/lib/queries";
import { ensureSeed } from "@/lib/seed";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const cookieStore = await cookies();
  const { searchParams } = new URL(req.url);
  const syncKey =
    req.headers.get("x-sync-key") ||
    searchParams.get("syncKey") ||
    cookieStore.get("sync_key")?.value ||
    cookieStore.get("euskalsoinua_sync_key")?.value ||
    "default";
  const section = searchParams.get("section") || undefined;
  const seed = searchParams.get("seed") || undefined;

  const data = await getHomeSections(syncKey, section, seed);
  return NextResponse.json(data);
}
