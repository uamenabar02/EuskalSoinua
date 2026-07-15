import { NextResponse } from "next/server";
import { getEqPresets } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const presets = await getEqPresets();
  return NextResponse.json(
    presets.map((p: any) => ({ ...p, bands: JSON.parse(p.bands) as number[] })),
  );
}
