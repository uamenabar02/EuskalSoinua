import { NextResponse } from "next/server";
import {
  auditArtistDiscography,
  applyArtistAuditChanges,
} from "@/lib/artist-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await auditArtistDiscography(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to audit artist discography" },
      { status: 404 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = await applyArtistAuditChanges(id, {
      removeAlbumIds: body.removeAlbumIds || [],
      importAlbumTitles: body.importAlbumTitles || [],
      removeTrackIds: body.removeTrackIds || [],
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to apply discography changes" },
      { status: 400 },
    );
  }
}
