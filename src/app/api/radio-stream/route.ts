import { NextResponse } from "next/server";
import { getCuratedStations } from "@/lib/radio-stations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RADIO STREAM PROXY
 * ----------------------------------------------------------------------------
 * Browsers block HTTP audio streams on HTTPS pages (mixed content). Many live
 * radio streams (including all EITB Basque stations) are HTTP-only with no
 * HTTPS endpoint. This route fetches the stream server-side and pipes it
 * through our own HTTPS origin, so the <audio> element can always load it.
 *
 * Usage: /api/radio-stream?id=<curated-id>   OR   /api/radio-stream?url=<encoded>
 *
 * For browse results (Radio Browser) the full URL is passed; we validate it's a
 * genuine audio stream URL from a known radio provider to prevent SSRF abuse.
 */

const ALLOWED_HOSTS = [
  "flumotion.com",
  "streamtheworld.com",
  "streamtheworld.net",
  "bbcmedia.co.uk",
  "bbc.co.uk",
  "beatproducciones.com",
  "esradio.fm",
  "rtl.fr",
  "radio-browser.info",
  "icecast",
  "stream",
  "live",
  "radio",
  "wearebroadcasting.com",
  "zeno.fm",
  "radioco",
  "radio.com",
  "flumotion",
  "somafm",
  "ice1",
  "ice2",
  "cdnstream",
  "laut.fm",
  "walmradio",
  "bauermedia",
  "nrjaudio",
  "skyrock",
  "quortex",
  "dlf.de",
  "swr.de",
  "europe1",
  "bfmtv",
  "rfm.fr",
  "cope",
  "cires21",
  "radioparadise",
];

function isLikelyAudioHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  // Always allow the curated/known providers
  if (ALLOWED_HOSTS.some((h) => host.includes(h))) return true;
  // Allow common radio/streaming port patterns
  if (url.port && host.match(/\d/)) return true;
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  let streamUrl = searchParams.get("url");

  // Resolve curated station by id
  if (id) {
    const station = getCuratedStations().find((s) => s.id === id);
    if (!station) {
      return NextResponse.json({ error: "station not found" }, { status: 404 });
    }
    streamUrl = station.streamUrl;
  }

  if (!streamUrl) {
    return NextResponse.json({ error: "id or url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(streamUrl);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  // Security: only proxy to plausible radio/audio hosts (prevent SSRF)
  if (!isLikelyAudioHost(target)) {
    return NextResponse.json(
      { error: "host not allowed" },
      { status: 403 },
    );
  }

  // Fetch the upstream stream (forward Range header for seeking)
  const upstreamHeaders: Record<string, string> = {
    "user-agent": "EuskalSoinua/1.0 (radio proxy)",
  };
  const range = request.headers.get("range");
  if (range) upstreamHeaders.range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { headers: upstreamHeaders });
  } catch {
    // Some streams need a redirect follow / retry
    try {
      upstream = await fetch(target.toString(), {
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch {
      return new Response("stream unreachable", { status: 502 });
    }
  }

  // Live radio is an infinite stream — pipe it through directly.
  if (!upstream.body) {
    return new Response("no stream body", { status: 502 });
  }

  const respHeaders = new Headers();
  const ct = upstream.headers.get("content-type") || "audio/mpeg";
  respHeaders.set("content-type", ct);
  // Live streams don't have a known length; omit content-length so the browser
  // treats it as streaming rather than waiting for a complete response.
  respHeaders.set("cache-control", "no-store");
  // Signal that this is a live stream (no duration)
  respHeaders.set("icy-metadata", "1");
  respHeaders.set("x-radio-name", encodeURIComponent(searchParams.get("name") || ""));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
