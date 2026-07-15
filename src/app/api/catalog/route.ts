import { NextResponse } from "next/server";
import { getHomeSections } from "@/lib/queries";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const data = await getHomeSections();
  return NextResponse.json(data);
}
