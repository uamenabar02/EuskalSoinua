import { NextRequest, NextResponse } from "next/server";
import {
  getDeviceAccessRequest,
  saveDeviceAccessRequest,
  fetchIpGeolocation,
  checkIPRejected,
} from "@/lib/access-db";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { sendAdminNotification } from "../notify/route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req.headers);

    // Rate Limit check: max 5 requests per 15 min per IP
    const rateStatus = checkRateLimit(`access_request:${clientIp}`, 5, 15 * 60 * 1000);
    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: `Too many access requests from this IP. Please wait ${Math.ceil(rateStatus.retryAfterSeconds / 60)} minutes.`,
          retryAfterSeconds: rateStatus.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      deviceId,
      deviceName,
      userName,
      userEmail,
      requestNote,
      clientCoords,
      clientTimezone,
    } = body;

    if (!deviceId || !deviceName) {
      return NextResponse.json(
        { error: "deviceId and deviceName are required" },
        { status: 400 }
      );
    }

    // 1. Check if device is already rejected
    const existing = await getDeviceAccessRequest(deviceId);
    if (existing && existing.status === "rejected") {
      return NextResponse.json(
        { error: "This device has been permanently rejected by the administrator." },
        { status: 403 }
      );
    }

    // 2. Check if IP address is blocked
    const ipBlocked = await checkIPRejected(clientIp);
    if (ipBlocked) {
      return NextResponse.json(
        { error: "Access requests from this IP address have been rejected." },
        { status: 403 }
      );
    }

    // 3. Fetch localization & GeoIP info
    const geo = await fetchIpGeolocation(clientIp);
    const userAgent = req.headers.get("user-agent") || undefined;

    // 4. Create or update access request record with pending status
    const record = await saveDeviceAccessRequest({
      deviceId,
      deviceName: deviceName.trim(),
      userName: userName?.trim() || "Anonymous User",
      userEmail: userEmail?.trim() || null,
      requestNote: requestNote?.trim() || null,
      ipAddress: clientIp,
      country: geo.country,
      city: geo.city,
      regionName: geo.regionName,
      locationCoords: clientCoords || geo.locationCoords,
      timezone: clientTimezone || geo.timezone,
      userAgent,
      status: "pending",
    });

    // 5. Trigger notification to admin email (uamenabar02@gmail.com)
    try {
      await sendAdminNotification(record);
    } catch (e) {
      console.error("[Request] Failed sending admin notification:", e);
    }

    return NextResponse.json({
      success: true,
      record,
      message: "Access request submitted successfully. Waiting for administrator approval.",
    });
  } catch (err: any) {
    console.error("[Request Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
