import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig, DeviceAccessRecord } from "@/lib/access-db";

export const dynamic = "force-dynamic";

export async function sendAdminNotification(requestRecord: DeviceAccessRecord) {
  const adminEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

  const subject = `🚨 [EuskalSoinua Access Request] New Device Request: ${requestRecord.deviceName}`;
  const textBody = `
New App Access Request Received!
----------------------------------
User Name: ${requestRecord.userName || "Anonymous User"}
User Email: ${requestRecord.userEmail || "Not provided"}
Device Name: ${requestRecord.deviceName}
Device ID: ${requestRecord.deviceId}

Localization & Connection Details:
Public IP Address: ${requestRecord.ipAddress}
Country: ${requestRecord.country || "Unknown"}
City / Region: ${requestRecord.city || ""} ${requestRecord.regionName ? "(" + requestRecord.regionName + ")" : ""}
Coordinates: ${requestRecord.locationCoords || "N/A"}
Timezone: ${requestRecord.timezone || "N/A"}
User Agent: ${requestRecord.userAgent || "N/A"}
User Note: ${requestRecord.requestNote || "None"}

To Accept or Decline this device request, open the EuskalSoinua Admin Dashboard in your browser.
Admin Email: ${adminEmail}
`;

  console.log("\n=======================================================");
  console.log(`[ACCESS NOTIFICATION SENT TO ${adminEmail}]`);
  console.log(`SUBJECT: ${subject}`);
  console.log(textBody);
  console.log("=======================================================\n");

  // If a RESEND_API_KEY or SMTP configuration exists in process.env, attempt sending real email:
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "EuskalSoinua Security <notifications@resend.dev>",
          to: [adminEmail],
          subject: subject,
          text: textBody,
        }),
      });
    } catch (e) {
      console.error("[Notify] Failed sending email via Resend:", e);
    }
  }

  return { ok: true, recipient: adminEmail };
}

export async function sendAdminPasswordRecoveryNotification({
  otp,
  expiresInMinutes,
  ipAddress,
  country,
  city,
  userAgent,
}: {
  otp: string;
  expiresInMinutes: number;
  ipAddress: string;
  country?: string;
  city?: string;
  userAgent?: string;
}) {
  const adminEmail = await getAdminConfig("admin_email", "uamenabar02@gmail.com");

  const subject = `🔐 [EuskalSoinua Security] Admin Passcode Recovery Code: ${otp}`;
  const textBody = `
Admin Passcode Recovery Request
==================================================
Your 6-digit one-time passcode recovery code is:

                 ${otp}

This verification code is valid for ${expiresInMinutes} minutes.
Enter this code along with your new admin passcode on the Admin Login screen.

Request Origin & Security Details:
- Recipient: ${adminEmail}
- Requesting IP: ${ipAddress}
- Location: ${city || ""} ${country ? `(${country})` : ""}
- Device Agent: ${userAgent || "N/A"}
- Requested At: ${new Date().toISOString()}

Security Notice:
If you did NOT request this recovery code, someone may be attempting to access
your Admin Dashboard. Your current passcode remains unchanged until this code is submitted.
==================================================
`;

  console.log("\n==================================================================");
  console.log("🔐 [EuskalSoinua Security] ADMIN PASSCODE RECOVERY CODE GENERATED");
  console.log(`Recipient:                  ${adminEmail}`);
  console.log(`6-Digit Verification OTP:   ${otp}`);
  console.log(`Expires In:                 ${expiresInMinutes} minutes`);
  console.log(`Requesting IP:              ${ipAddress}`);
  console.log("==================================================================\n");

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "EuskalSoinua Security <security@resend.dev>",
          to: [adminEmail],
          subject: subject,
          text: textBody,
        }),
      });
    } catch (e) {
      console.error("[Notify] Failed sending recovery email via Resend:", e);
    }
  }

  return { ok: true, recipient: adminEmail };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.record) {
      return NextResponse.json({ error: "Missing record payload" }, { status: 400 });
    }
    const res = await sendAdminNotification(body.record);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
