import { NextRequest, NextResponse } from "next/server";
import {
  getDeviceAccessRequest,
  checkIPRejected,
  isValidAdminSessionToken,
  fetchIpGeolocation,
  isAdminInitialized,
  markAdminInitialized,
} from "@/lib/access-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = req.cookies;
  const deviceId = cookieStore.get("device_id")?.value || req.nextUrl.searchParams.get("deviceId");
  const adminToken = cookieStore.get("admin_session")?.value;

  // Extract client public IP
  const forwardedFor = req.headers.get("x-forwarded-for");
  let ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";

  const adminInit = await isAdminInitialized();

  if (!deviceId) {
    return NextResponse.json({
      status: "unrequested",
      isAdmin: false,
      ipAddress,
      adminInitialized: adminInit,
    });
  }

  // Check if current device has valid admin session
  const isAdmin = adminToken ? await isValidAdminSessionToken(adminToken) : false;
  if (isAdmin) {
    await markAdminInitialized();
    return NextResponse.json({
      status: "accepted",
      isAdmin: true,
      deviceId,
      ipAddress,
      adminInitialized: true,
    });
  }

  // Check if IP is globally rejected
  const ipBlocked = await checkIPRejected(ipAddress);
  if (ipBlocked) {
    return NextResponse.json({
      status: "rejected",
      isAdmin: false,
      deviceId,
      ipAddress,
      reason: "IP Address blocked by administrator",
      adminInitialized: adminInit,
    });
  }

  // Check device access request record
  const record = await getDeviceAccessRequest(deviceId);
  if (record) {
    return NextResponse.json({
      status: record.status,
      record,
      isAdmin: false,
      deviceId,
      ipAddress,
      adminInitialized: adminInit,
    });
  }

  // Attempt IP geolocation pre-fetch for user convenience
  const geo = await fetchIpGeolocation(ipAddress);

  return NextResponse.json({
    status: "unrequested",
    isAdmin: false,
    deviceId,
    ipAddress,
    geo,
    adminInitialized: adminInit,
  });
}
