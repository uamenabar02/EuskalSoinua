import { NextResponse } from "next/server";
import { getCuratedStations, searchRadioStations } from "@/lib/radio-stations";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** LIVE RADIO — curated stations + optional Radio Browser API search. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const country = searchParams.get("country") ?? undefined;

  if (query.trim() || country) {
    const browse = await searchRadioStations(query, country);
    return NextResponse.json({ curated: getCuratedStations(), browse });
  }

  return NextResponse.json({ curated: getCuratedStations(), browse: [] });
}
