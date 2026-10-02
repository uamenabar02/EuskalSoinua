import { NextRequest, NextResponse } from "next/server";
import {
  getAdminConfig,
  verifyAdminPasscode,
  updateAdminPasscode,
  addAdminSessionToken,
  isValidAdminSessionToken,
  getAllDeviceAccessRequests,
  updateDeviceAccessStatus,
  deleteDeviceAccessRequest,
  saveDeviceAccessRequest,
  markAdminInitialized,
  isAdminInitialized,
  generateAdminRecoveryOtp,
  verifyAdminRecoveryOtpAndReset,
  generateMasterRecoveryKey,
  verifyMasterKeyAndReset,
  hasMasterRecoveryKey,
} from "@/lib/access-db";
import { getClientIp, checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { sendAdminPasswordRecoveryNotification } from "@/app/api/access/notify/route";
import crypto from "crypto";

export const dynamic = "force-dynamic";

async function isRequestAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("admin_session")?.value || req.headers.get("x-admin-token");
  if (!token) return false;
  return await isValidAdminSessionToken(token);
}

export async function GET(req: NextRequest) {
  const isAdmin = await isRequestAdmin(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
  }

  const requests = await getAllDeviceAccessRequests();
  const adminEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    accepted: requests.filter((r) => r.status === "accepted").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  return NextResponse.json({
    requests,
    stats,
    adminEmail,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const clientIp = getClientIp(req.headers);

    // --- Action: LOGIN ---
    if (action === "login") {
      // Rate Limit check: max 5 attempts per 15 min per IP
      const rateLimitKey = `admin_login:${clientIp}`;
      const rateStatus = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

      if (!rateStatus.allowed) {
        return NextResponse.json(
          {
            error: `Too many login attempts. Please wait ${Math.ceil(rateStatus.retryAfterSeconds / 60)} minutes before trying again.`,
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      const { email, passcode, deviceId, deviceName } = body;
      const expectedEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

      const emailMatches = email?.trim().toLowerCase() === expectedEmail.toLowerCase();
      const isPasscodeValid = emailMatches && (await verifyAdminPasscode(passcode?.trim() || ""));

      if (!emailMatches || !isPasscodeValid) {
        return NextResponse.json(
          {
            error: "Invalid admin email or passcode.",
            remainingAttempts: rateStatus.remaining,
          },
          { status: 401 }
        );
      }

      // Success! Reset login rate limit
      resetRateLimit(rateLimitKey);

      // Generate secure session token
      const token = `adm_${crypto.randomBytes(24).toString("hex")}`;
      await addAdminSessionToken(token);
      await markAdminInitialized();

      // Auto-accept the admin device
      if (deviceId) {
        await saveDeviceAccessRequest({
          deviceId,
          deviceName: deviceName || "Admin Device",
          userName: "Admin (uamenabar02@gmail.com)",
          userEmail: expectedEmail,
          ipAddress: clientIp,
          status: "accepted",
          adminNotes: "Admin Synced Device",
        });
      }

      const res = NextResponse.json({
        success: true,
        message: "Logged in as Administrator",
        token,
        adminEmail: expectedEmail,
      });

      // Set cookie valid for 30 days
      res.cookies.set("admin_session", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
      });

      return res;
    }

    // --- Action: VERIFY SESSION ---
    if (action === "verify") {
      const isAdmin = await isRequestAdmin(req);
      if (isAdmin) await markAdminInitialized();
      const adminEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");
      const adminInit = await isAdminInitialized();
      return NextResponse.json({ isAdmin, adminEmail, adminInitialized: adminInit });
    }

    // --- Action: REQUEST PASSWORD RECOVERY CODE ---
    if (action === "request_recovery") {
      // Rate Limit check: generous 15 attempts per 15 min per IP for developer usability
      const rateLimitKey = `admin_recovery_req:${clientIp}`;
      const rateStatus = checkRateLimit(rateLimitKey, 15, 15 * 60 * 1000);

      if (!rateStatus.allowed) {
        return NextResponse.json(
          {
            error: `Too many password recovery requests. Please wait ${Math.ceil(rateStatus.retryAfterSeconds / 60)} minutes before trying again.`,
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      const { email } = body;
      const expectedEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

      if (!email || email.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: "The provided email address does not match the configured administrator account." },
          { status: 400 }
        );
      }

      const { otp, expiresInMinutes } = await generateAdminRecoveryOtp();

      // Trigger email & console log
      await sendAdminPasswordRecoveryNotification({
        otp,
        expiresInMinutes,
        ipAddress: clientIp,
        userAgent: req.headers.get("user-agent") || undefined,
      });

      // Mask email for privacy (e.g. u***2@gmail.com)
      const parts = expectedEmail.split("@");
      const maskedName = parts[0].length > 2
        ? `${parts[0][0]}***${parts[0][parts[0].length - 1]}`
        : `${parts[0][0]}***`;
      const maskedEmail = `${maskedName}@${parts[1] || "gmail.com"}`;

      const hasEmailService = !!process.env.RESEND_API_KEY;

      return NextResponse.json({
        success: true,
        hasEmailService,
        simulatedOtp: !hasEmailService ? otp : undefined,
        message: hasEmailService
          ? `A 6-digit verification code has been dispatched to ${maskedEmail}.`
          : `External email dispatch is not active (RESEND_API_KEY not configured). Your verification code is: ${otp}`,
        maskedEmail,
        expiresInMinutes,
      });
    }

    // --- Action: VERIFY RECOVERY OTP & RESET PASSCODE ---
    if (action === "verify_recovery_otp") {
      // Rate Limit check: max 5 verify attempts per 15 min per IP
      const rateLimitKey = `admin_recovery_verify:${clientIp}`;
      const rateStatus = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

      if (!rateStatus.allowed) {
        return NextResponse.json(
          {
            error: `Too many verification attempts. Please wait ${Math.ceil(rateStatus.retryAfterSeconds / 60)} minutes before trying again.`,
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      const { email, otp, newPasscode, deviceId, deviceName } = body;
      const expectedEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

      if (!email || email.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: "Admin email does not match registered administrator account." },
          { status: 400 }
        );
      }

      const result = await verifyAdminRecoveryOtpAndReset(otp, newPasscode);
      if (!result.success || !result.token) {
        return NextResponse.json({ error: result.error || "Verification failed." }, { status: 400 });
      }

      resetRateLimit(rateLimitKey);
      resetRateLimit(`admin_login:${clientIp}`);

      // Auto-accept device if supplied
      if (deviceId) {
        await saveDeviceAccessRequest({
          deviceId,
          deviceName: deviceName || "Admin Device (Recovered)",
          userName: "Admin (uamenabar02@gmail.com)",
          userEmail: expectedEmail,
          ipAddress: clientIp,
          status: "accepted",
          adminNotes: "Admin Device (Password Reset via OTP)",
        });
      }

      const res = NextResponse.json({
        success: true,
        message: "Admin passcode successfully reset and device authenticated.",
        token: result.token,
        adminEmail: expectedEmail,
      });

      res.cookies.set("admin_session", result.token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
      });

      return res;
    }

    // --- Action: VERIFY EMERGENCY MASTER RECOVERY KEY ---
    if (action === "verify_master_key") {
      // Rate Limit check: max 5 attempts per 15 min per IP
      const rateLimitKey = `admin_master_key:${clientIp}`;
      const rateStatus = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

      if (!rateStatus.allowed) {
        return NextResponse.json(
          {
            error: `Too many attempts. Please wait ${Math.ceil(rateStatus.retryAfterSeconds / 60)} minutes before trying again.`,
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      const { masterKey, newPasscode, deviceId, deviceName } = body;
      const expectedEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

      const result = await verifyMasterKeyAndReset(masterKey, newPasscode);
      if (!result.success || !result.token) {
        return NextResponse.json({ error: result.error || "Invalid Emergency Master Recovery Key." }, { status: 400 });
      }

      resetRateLimit(rateLimitKey);
      resetRateLimit(`admin_login:${clientIp}`);

      // Auto-accept device if supplied
      if (deviceId) {
        await saveDeviceAccessRequest({
          deviceId,
          deviceName: deviceName || "Admin Device (Master Key Recovery)",
          userName: "Admin (uamenabar02@gmail.com)",
          userEmail: expectedEmail,
          ipAddress: clientIp,
          status: "accepted",
          adminNotes: "Admin Device (Master Key Reset)",
        });
      }

      const res = NextResponse.json({
        success: true,
        message: "Admin passcode reset successfully via Emergency Master Key.",
        token: result.token,
        adminEmail: expectedEmail,
      });

      res.cookies.set("admin_session", result.token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
      });

      return res;
    }

    // --- ALL OTHER ACTIONS REQUIRE ADMIN AUTH ---
    const isAdmin = await isRequestAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized. Only synced admin devices can modify device permissions." },
        { status: 403 }
      );
    }

    // --- Action: GET RECOVERY CONFIG & STATUS (ADMIN ONLY) ---
    if (action === "get_recovery_config") {
      const adminEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");
      const hasKey = await hasMasterRecoveryKey();
      const lastRecoveryAt = await getAdminConfig("admin_last_recovery_at", "");
      return NextResponse.json({
        adminEmail,
        hasMasterRecoveryKey: hasKey,
        lastRecoveryAt: lastRecoveryAt || null,
      });
    }

    // --- Action: GENERATE NEW EMERGENCY MASTER RECOVERY KEY (ADMIN ONLY) ---
    if (action === "generate_master_key") {
      const newKey = await generateMasterRecoveryKey();
      return NextResponse.json({
        success: true,
        masterKey: newKey,
        message: "New Emergency Master Recovery Key generated. Store it safely offline!",
      });
    }

    // --- Action: TEST RECOVERY EMAIL DISPATCH (ADMIN ONLY) ---
    if (action === "test_recovery_email") {
      const { otp, expiresInMinutes } = await generateAdminRecoveryOtp();
      await sendAdminPasswordRecoveryNotification({
        otp,
        expiresInMinutes,
        ipAddress: clientIp,
        userAgent: req.headers.get("user-agent") || undefined,
      });
      return NextResponse.json({
        success: true,
        message: "Test recovery code generated and dispatched.",
        otp,
      });
    }

    // --- Action: UPDATE PASSCODE ---
    if (action === "update_passcode") {
      const { oldPasscode, newPasscode } = body;
      const isOldValid = await verifyAdminPasscode(oldPasscode?.trim() || "");

      if (!isOldValid) {
        return NextResponse.json({ error: "Current passcode is incorrect." }, { status: 400 });
      }

      if (!newPasscode || newPasscode.trim().length < 6) {
        return NextResponse.json(
          { error: "New passcode must be at least 6 characters long." },
          { status: 400 }
        );
      }

      await updateAdminPasscode(newPasscode.trim());
      return NextResponse.json({ success: true, message: "Admin passcode updated successfully." });
    }

    // --- Action: UPDATE STATUS (ACCEPT / REJECT / PENDING) ---
    if (action === "update_status") {
      const { deviceId, status, adminNotes } = body;
      if (!deviceId || !["accepted", "rejected", "pending"].includes(status)) {
        return NextResponse.json({ error: "Invalid deviceId or status" }, { status: 400 });
      }

      await updateDeviceAccessStatus(deviceId, status, adminNotes);
      return NextResponse.json({
        success: true,
        message: `Device status changed to ${status}.`,
      });
    }

    // --- Action: EDIT DEVICE ---
    if (action === "edit_device") {
      const { deviceId, userName, userEmail, deviceName, adminNotes, status } = body;
      if (!deviceId) {
        return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
      }

      const existing = await getAllDeviceAccessRequests();
      const current = existing.find((r) => r.deviceId === deviceId);

      await saveDeviceAccessRequest({
        deviceId,
        deviceName: deviceName?.trim() || current?.deviceName || "Device",
        userName: userName?.trim() || current?.userName || null,
        userEmail: userEmail?.trim() || current?.userEmail || null,
        ipAddress: current?.ipAddress || clientIp,
        country: current?.country,
        city: current?.city,
        regionName: current?.regionName,
        locationCoords: current?.locationCoords,
        timezone: current?.timezone,
        userAgent: current?.userAgent,
        status: status || current?.status || "pending",
        adminNotes: adminNotes !== undefined ? adminNotes : current?.adminNotes,
      });

      return NextResponse.json({ success: true, message: "Device details updated." });
    }

    // --- Action: DELETE DEVICE ---
    if (action === "delete_device") {
      const { deviceId } = body;
      if (!deviceId) {
        return NextResponse.json({ error: "deviceId required" }, { status: 400 });
      }

      await deleteDeviceAccessRequest(deviceId);
      return NextResponse.json({ success: true, message: "Device request removed." });
    }

    // --- Action: ADD DEVICE / IP WHITELIST / BLACKLIST ---
    if (action === "add_device") {
      const { deviceId, deviceName, userName, ipAddress, status, adminNotes } = body;
      if (!ipAddress) {
        return NextResponse.json({ error: "ipAddress is required" }, { status: 400 });
      }

      const targetDeviceId = deviceId?.trim() || `manual_${Date.now()}`;

      await saveDeviceAccessRequest({
        deviceId: targetDeviceId,
        deviceName: deviceName?.trim() || "Manual Device / IP",
        userName: userName?.trim() || "Manual Entry",
        ipAddress: ipAddress.trim(),
        status: status || "accepted",
        adminNotes: adminNotes || "Added manually by admin",
      });

      return NextResponse.json({ success: true, message: "Device/IP added successfully." });
    }

    // --- Action: LOGOUT ---
    if (action === "logout") {
      const res = NextResponse.json({ success: true, message: "Admin session logged out." });
      res.cookies.delete("admin_session");
      return res;
    }

    return NextResponse.json({ error: "Unknown admin action" }, { status: 400 });
  } catch (err: any) {
    console.error("[Admin API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
