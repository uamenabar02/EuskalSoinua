import { NextResponse } from "next/server";
import { configuredInstances } from "@/lib/sources/streaming";

export const dynamic = "force-dynamic";

/** Surface the configured streaming backend (no secrets) for the Settings UI. */
export async function GET() {
  const { piped, invidious, sponsorblock } = configuredInstances();
  const all = [...piped, ...invidious];
  return NextResponse.json({
    streamingConfigured: all.length > 0,
    instanceList: all.join(", ") || "none (demo audio)",
    sponsorblockBase: sponsorblock,
  });
}
