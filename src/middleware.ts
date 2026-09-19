import { NextRequest, NextResponse } from "next/server";
import { isDeviceAccepted, isValidAdminSessionToken } from "@/lib/access-db";

export const runtime = "nodejs";

export const config = {
  matcher: ["/api/:path*"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Exclude public and access-management endpoints
  if (
    pathname.startsWith("/api/access/") ||
    pathname === "/api/access" ||
    pathname === "/api/health" ||
    pathname === "/api/status"
  ) {
    return NextResponse.next();
  }

  // 2. Extract admin session token and device ID from cookies or headers
  const adminToken = req.cookies.get("admin_session")?.value || req.headers.get("x-admin-token");
  const deviceId = req.cookies.get("device_id")?.value || req.headers.get("x-device-id");

  // 3. Check admin session first
  if (adminToken) {
    const isAdmin = await isValidAdminSessionToken(adminToken);
    if (isAdmin) {
      return NextResponse.next();
    }
  }

  // 4. Check if device is accepted
  if (deviceId) {
    const accepted = await isDeviceAccepted(deviceId);
    if (accepted) {
      return NextResponse.next();
    }
  }

  // 5. Unauthorized
  return NextResponse.json(
    {
      error: "Forbidden: Device access not authorized or approval pending.",
      code: "DEVICE_ACCESS_DENIED",
    },
    { status: 403 }
  );
}
