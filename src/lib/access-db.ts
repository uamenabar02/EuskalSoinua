import { pool } from "@/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface DeviceAccessRecord {
  id?: number;
  deviceId: string;
  deviceName: string;
  userName?: string | null;
  userEmail?: string | null;
  requestNote?: string | null;
  ipAddress: string;
  country?: string | null;
  city?: string | null;
  regionName?: string | null;
  locationCoords?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  status: "pending" | "accepted" | "rejected";
  adminNotes?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// Memory / File fallback store for environments where PostgreSQL pool is disconnected
const LOCAL_STORE_FILE = fs.existsSync("/tmp")
  ? path.join("/tmp", ".access_data.json")
  : path.join(process.cwd(), ".access_data.json");

interface LocalStore {
  adminEmail: string;
  adminPasscodeHash: string;
  adminInitialized?: boolean;
  adminMasterKeyHash?: string;
  adminRecoveryOtpHash?: string;
  adminRecoveryExpiresAt?: number;
  adminRecoveryAttempts?: number;
  adminSessions: string[]; // session tokens for authenticated admin devices
  requests: Record<string, DeviceAccessRecord>;
}

const defaultStore: LocalStore = {
  adminEmail: "uamenabar02@gmail.com",
  adminPasscodeHash: "",
  adminMasterKeyHash: "",
  adminRecoveryOtpHash: "",
  adminRecoveryExpiresAt: 0,
  adminRecoveryAttempts: 0,
  adminSessions: [],
  requests: {},
};

let memoryStore: LocalStore = { ...defaultStore };

function readLocalStore(): LocalStore {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const data = fs.readFileSync(LOCAL_STORE_FILE, "utf-8");
      memoryStore = { ...defaultStore, ...JSON.parse(data) };
      return memoryStore;
    }
  } catch (e) {
    // Fall back to in-memory store
  }
  return memoryStore;
}

function writeLocalStore(store: LocalStore) {
  memoryStore = { ...store };
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    // Non-fatal on read-only serverless filesystems
  }
}

/**
 * Generates a cryptographically strong 12-character random passcode.
 */
function generateRandom12CharPasscode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = crypto.randomBytes(12);
  let passcode = "";
  for (let i = 0; i < 12; i++) {
    passcode += chars[bytes[i] % chars.length];
  }
  return passcode;
}

/**
 * Generates an Emergency Master Recovery Key formatted as ESK-XXXX-XXXX-XXXX-XXXX.
 */
function generateFormattedMasterKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += chars[bytes[i] % chars.length];
  }
  return `ESK-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

let tablesInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureAccessTables(): Promise<void> {
  if (tablesInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (pool) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS device_access_requests (
            id SERIAL PRIMARY KEY,
            device_id TEXT NOT NULL UNIQUE,
            device_name TEXT NOT NULL,
            user_name TEXT,
            user_email TEXT,
            request_note TEXT,
            ip_address TEXT NOT NULL,
            country TEXT,
            city TEXT,
            region_name TEXT,
            location_coords TEXT,
            timezone TEXT,
            user_agent TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
          );
          CREATE INDEX IF NOT EXISTS dar_device_idx ON device_access_requests(device_id);
          CREATE INDEX IF NOT EXISTS dar_status_idx ON device_access_requests(status);
          CREATE INDEX IF NOT EXISTS dar_ip_idx ON device_access_requests(ip_address);

          CREATE TABLE IF NOT EXISTS admin_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
          );
        `);
      } catch (err) {
        console.error("[AccessDB] SQL init failed, using fallback:", err);
      }
    }

    // Check if admin passcode hash exists in DB or local store
    let currentHash = "";
    if (pool) {
      try {
        const res = await pool.query(`SELECT value FROM admin_config WHERE key = 'admin_passcode_hash'`);
        if (res.rows.length > 0) {
          currentHash = res.rows[0].value;
        }
      } catch {}
    }

    if (!currentHash) {
      const store = readLocalStore();
      if (store.adminPasscodeHash) {
        currentHash = store.adminPasscodeHash;
      }
    }

    // If no admin passcode hash exists, generate a brand new 12-char passcode, hash it with bcrypt, and print ONLY ONCE in server logs!
    if (!currentHash) {
      const generatedPasscode = generateRandom12CharPasscode();
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(generatedPasscode, salt);

      if (pool) {
        try {
          await pool.query(
            `INSERT INTO admin_config (key, value, updated_at)
             VALUES ('admin_email', 'uamenabar02@gmail.com', NOW())
             ON CONFLICT (key) DO NOTHING`
          );
          await pool.query(
            `INSERT INTO admin_config (key, value, updated_at)
             VALUES ('admin_passcode_hash', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [hash]
          );
        } catch (e) {
          console.error("[AccessDB] Failed to persist initial passcode hash in DB:", e);
        }
      }

      const store = readLocalStore();
      store.adminEmail = "uamenabar02@gmail.com";
      store.adminPasscodeHash = hash;

      // Also generate initial Emergency Master Key
      const initialMasterKey = generateFormattedMasterKey();
      const masterSalt = bcrypt.genSaltSync(10);
      const masterHash = bcrypt.hashSync(initialMasterKey, masterSalt);
      store.adminMasterKeyHash = masterHash;

      if (pool) {
        try {
          await pool.query(
            `INSERT INTO admin_config (key, value, updated_at)
             VALUES ('admin_master_key_hash', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [masterHash]
          );
        } catch (e) {
          console.error("[AccessDB] Failed to persist master key hash in DB:", e);
        }
      }

      writeLocalStore(store);

      // PRINT ONLY ONCE TO SERVER CONSOLE LOGS
      console.log("\n==================================================================");
      console.log("🔐 [EuskalSoinua Security] FIRST STARTUP ADMIN CREDENTIALS GENERATED");
      console.log("Admin Email: uamenabar02@gmail.com");
      console.log(`Generated Admin Passcode (12-char): ${generatedPasscode}`);
      console.log(`Emergency Master Recovery Key:     ${initialMasterKey}`);
      console.log("NOTE: These credentials are encrypted with bcrypt and logged ONLY ONCE.");
      console.log("Save the Emergency Master Recovery Key in a secure offline vault.");
      console.log("==================================================================\n");
    }

    // Ensure Emergency Master Recovery Key exists even if database was created earlier
    let currentMasterHash = "";
    if (pool) {
      try {
        const res = await pool.query(`SELECT value FROM admin_config WHERE key = 'admin_master_key_hash'`);
        if (res.rows.length > 0) {
          currentMasterHash = res.rows[0].value;
        }
      } catch {}
    }
    if (!currentMasterHash) {
      const store = readLocalStore();
      if (store.adminMasterKeyHash) {
        currentMasterHash = store.adminMasterKeyHash;
      }
    }
    if (!currentMasterHash) {
      const newMasterKey = generateFormattedMasterKey();
      const masterSalt = bcrypt.genSaltSync(10);
      const masterHash = bcrypt.hashSync(newMasterKey, masterSalt);

      if (pool) {
        try {
          await pool.query(
            `INSERT INTO admin_config (key, value, updated_at)
             VALUES ('admin_master_key_hash', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [masterHash]
          );
        } catch (e) {
          console.error("[AccessDB] Failed to persist master key hash in DB:", e);
        }
      }

      const store = readLocalStore();
      store.adminMasterKeyHash = masterHash;
      writeLocalStore(store);

      console.log("\n==================================================================");
      console.log("🔐 [EuskalSoinua Security] EMERGENCY MASTER RECOVERY KEY PROVISIONED");
      console.log(`Emergency Master Recovery Key: ${newMasterKey}`);
      console.log("==================================================================\n");
    }

    tablesInitialized = true;
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// ADMIN CONFIG HELPERS
// ---------------------------------------------------------------------------

export async function getAdminConfig(key: string, defaultValue = ""): Promise<string> {
  await ensureAccessTables();
  if (pool) {
    try {
      const res = await pool.query(`SELECT value FROM admin_config WHERE key = $1`, [key]);
      if (res.rows.length > 0) return res.rows[0].value;
    } catch (e) {
      console.error(`[AccessDB] Error getting admin config ${key}:`, e);
    }
  }
  const store = readLocalStore();
  if (key === "admin_email") return store.adminEmail;
  if (key === "admin_passcode_hash") return store.adminPasscodeHash;
  if (key === "admin_master_key_hash") return store.adminMasterKeyHash || defaultValue;
  if (key === "admin_recovery_otp_hash") return store.adminRecoveryOtpHash || defaultValue;
  if (key === "admin_recovery_expires_at") return store.adminRecoveryExpiresAt ? String(store.adminRecoveryExpiresAt) : defaultValue;
  if (key === "admin_recovery_attempts") return store.adminRecoveryAttempts !== undefined ? String(store.adminRecoveryAttempts) : defaultValue;
  if (key === "admin_initialized") return store.adminInitialized ? "true" : defaultValue;
  return defaultValue;
}

export async function setAdminConfig(key: string, value: string): Promise<boolean> {
  await ensureAccessTables();
  let dbSuccess = false;
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO admin_config (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
      dbSuccess = true;
    } catch (e) {
      console.error(`[AccessDB] Error setting admin config ${key}:`, e);
    }
  }
  const store = readLocalStore();
  if (key === "admin_email") store.adminEmail = value;
  if (key === "admin_passcode_hash") store.adminPasscodeHash = value;
  if (key === "admin_master_key_hash") store.adminMasterKeyHash = value;
  if (key === "admin_recovery_otp_hash") store.adminRecoveryOtpHash = value;
  if (key === "admin_recovery_expires_at") store.adminRecoveryExpiresAt = Number(value) || 0;
  if (key === "admin_recovery_attempts") store.adminRecoveryAttempts = Number(value) || 0;
  if (key === "admin_initialized") store.adminInitialized = value === "true";
  writeLocalStore(store);
  return dbSuccess || true;
}

/**
 * Securely verifies entered plain passcode against stored bcrypt hash.
 */
export async function verifyAdminPasscode(enteredPasscode: string): Promise<boolean> {
  if (!enteredPasscode) return false;
  await ensureAccessTables();
  const storedHash = await getAdminConfig("admin_passcode_hash", "");
  if (!storedHash) return false;

  try {
    return bcrypt.compareSync(enteredPasscode, storedHash);
  } catch (err) {
    console.error("[AccessDB] Passcode compare error:", err);
    return false;
  }
}

/**
 * Securely updates the admin passcode by hashing with bcrypt.
 */
export async function updateAdminPasscode(newPlainPasscode: string): Promise<boolean> {
  if (!newPlainPasscode || newPlainPasscode.length < 6) return false;
  await ensureAccessTables();
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPlainPasscode, salt);
  return await setAdminConfig("admin_passcode_hash", hash);
}

export async function isAdminInitialized(): Promise<boolean> {
  const val = await getAdminConfig("admin_initialized", "false");
  return val === "true";
}

export async function markAdminInitialized(): Promise<void> {
  await setAdminConfig("admin_initialized", "true");
}

// ---------------------------------------------------------------------------
// PASSWORD RECOVERY & EMERGENCY RECOVERY HELPERS
// ---------------------------------------------------------------------------

/**
 * Checks if an Emergency Master Recovery Key is provisioned.
 */
export async function hasMasterRecoveryKey(): Promise<boolean> {
  const hash = await getAdminConfig("admin_master_key_hash", "");
  return !!hash;
}

/**
 * Generates and saves a new Emergency Master Recovery Key.
 * Returns the raw key for the admin to record offline.
 */
export async function generateMasterRecoveryKey(): Promise<string> {
  const rawKey = generateFormattedMasterKey();
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(rawKey, salt);
  await setAdminConfig("admin_master_key_hash", hash);
  return rawKey;
}

/**
 * Verifies an Emergency Master Recovery Key against the stored bcrypt hash.
 */
export async function verifyMasterRecoveryKey(enteredKey: string): Promise<boolean> {
  if (!enteredKey) return false;
  const sanitized = enteredKey.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const storedHash = await getAdminConfig("admin_master_key_hash", "");
  if (!storedHash) return false;

  try {
    return bcrypt.compareSync(sanitized, storedHash);
  } catch (err) {
    console.error("[AccessDB] Master key verify error:", err);
    return false;
  }
}

/**
 * Uses the Emergency Master Recovery Key to reset the admin passcode.
 */
export async function verifyMasterKeyAndReset(
  masterKey: string,
  newPasscode: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!newPasscode || newPasscode.trim().length < 6) {
    return { success: false, error: "New passcode must be at least 6 characters long." };
  }

  const isValid = await verifyMasterRecoveryKey(masterKey);
  if (!isValid) {
    return { success: false, error: "Invalid Emergency Master Recovery Key." };
  }

  await updateAdminPasscode(newPasscode.trim());
  await markAdminInitialized();

  // Clear any pending OTP recovery sessions
  await setAdminConfig("admin_recovery_otp_hash", "");
  await setAdminConfig("admin_recovery_expires_at", "0");
  await setAdminConfig("admin_recovery_attempts", "0");

  const sessionToken = `adm_${crypto.randomBytes(24).toString("hex")}`;
  await addAdminSessionToken(sessionToken);

  return { success: true, token: sessionToken };
}

/**
 * Generates a 6-digit one-time password (OTP) for admin passcode recovery.
 * Valid for 15 minutes.
 */
export async function generateAdminRecoveryOtp(): Promise<{
  otp: string;
  expiresInMinutes: number;
  expiresAt: number;
}> {
  // Generate 6-digit numeric OTP (e.g. "492815")
  const otpNumber = crypto.randomInt(100000, 1000000);
  const otp = otpNumber.toString();
  const expiresInMinutes = 15;
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(otp, salt);

  await setAdminConfig("admin_recovery_otp_hash", hash);
  await setAdminConfig("admin_recovery_expires_at", String(expiresAt));
  await setAdminConfig("admin_recovery_attempts", "0");

  return {
    otp,
    expiresInMinutes,
    expiresAt,
  };
}

/**
 * Verifies the 6-digit OTP and resets the admin passcode if valid.
 */
export async function verifyAdminRecoveryOtpAndReset(
  otp: string,
  newPasscode: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!otp || !otp.trim()) {
    return { success: false, error: "Please enter the 6-digit recovery code." };
  }

  if (!newPasscode || newPasscode.trim().length < 6) {
    return { success: false, error: "New passcode must be at least 6 characters long." };
  }

  const storedOtpHash = await getAdminConfig("admin_recovery_otp_hash", "");
  const expiresAtStr = await getAdminConfig("admin_recovery_expires_at", "0");
  const attemptsStr = await getAdminConfig("admin_recovery_attempts", "0");

  const expiresAt = Number(expiresAtStr) || 0;
  const attempts = Number(attemptsStr) || 0;

  if (!storedOtpHash || expiresAt === 0) {
    return { success: false, error: "No active password recovery request found. Please request a new code." };
  }

  if (Date.now() > expiresAt) {
    // Expired
    await setAdminConfig("admin_recovery_otp_hash", "");
    await setAdminConfig("admin_recovery_expires_at", "0");
    return { success: false, error: "Recovery code has expired. Please request a fresh code." };
  }

  if (attempts >= 5) {
    await setAdminConfig("admin_recovery_otp_hash", "");
    await setAdminConfig("admin_recovery_expires_at", "0");
    return { success: false, error: "Too many incorrect attempts. For security, please request a new code." };
  }

  const cleanOtp = otp.trim().replace(/\s+/g, "");
  let isValid = false;
  try {
    isValid = bcrypt.compareSync(cleanOtp, storedOtpHash);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    const newAttempts = attempts + 1;
    await setAdminConfig("admin_recovery_attempts", String(newAttempts));
    const remaining = 5 - newAttempts;
    return {
      success: false,
      error: `Invalid recovery code. ${remaining > 0 ? `${remaining} attempts remaining.` : "Please request a new code."}`,
    };
  }

  // OTP is valid! Apply new passcode
  await updateAdminPasscode(newPasscode.trim());
  await markAdminInitialized();

  // Clear recovery state
  await setAdminConfig("admin_recovery_otp_hash", "");
  await setAdminConfig("admin_recovery_expires_at", "0");
  await setAdminConfig("admin_recovery_attempts", "0");
  await setAdminConfig("admin_last_recovery_at", new Date().toISOString());

  // Generate session token
  const sessionToken = `adm_${crypto.randomBytes(24).toString("hex")}`;
  await addAdminSessionToken(sessionToken);

  return { success: true, token: sessionToken };
}

// ---------------------------------------------------------------------------
// ADMIN SESSION HELPERS
// ---------------------------------------------------------------------------

export async function addAdminSessionToken(token: string) {
  const store = readLocalStore();
  if (!store.adminSessions.includes(token)) {
    store.adminSessions.push(token);
    writeLocalStore(store);
  }
  await setAdminConfig(`session_${token}`, "active");
}

export async function isValidAdminSessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  const dbVal = await getAdminConfig(`session_${token}`);
  if (dbVal === "active") return true;

  const store = readLocalStore();
  return store.adminSessions.includes(token);
}

// ---------------------------------------------------------------------------
// DEVICE REQUEST HELPERS
// ---------------------------------------------------------------------------

export async function getDeviceAccessRequest(deviceId: string): Promise<DeviceAccessRecord | null> {
  if (!deviceId) return null;
  await ensureAccessTables();

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, device_id as "deviceId", device_name as "deviceName", user_name as "userName",
                user_email as "userEmail", request_note as "requestNote", ip_address as "ipAddress",
                country, city, region_name as "regionName", location_coords as "locationCoords",
                timezone, user_agent as "userAgent", status, admin_notes as "adminNotes",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM device_access_requests WHERE device_id = $1`,
        [deviceId]
      );
      if (res.rows.length > 0) {
        return res.rows[0] as DeviceAccessRecord;
      }
    } catch (e) {
      console.error("[AccessDB] Error fetching device request from DB:", e);
    }
  }

  const store = readLocalStore();
  return store.requests[deviceId] || null;
}

export async function isDeviceAccepted(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  const record = await getDeviceAccessRequest(deviceId);
  return record?.status === "accepted";
}

export async function checkIPRejected(ipAddress: string): Promise<boolean> {
  if (!ipAddress) return false;
  await ensureAccessTables();

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT status FROM device_access_requests WHERE ip_address = $1 AND status = 'rejected'`,
        [ipAddress]
      );
      if (res.rows.length > 0) return true;
    } catch (e) {
      console.error("[AccessDB] Error checking IP rejection:", e);
    }
  }

  const store = readLocalStore();
  return Object.values(store.requests).some(
    (r) => r.ipAddress === ipAddress && r.status === "rejected"
  );
}

export async function saveDeviceAccessRequest(record: Omit<DeviceAccessRecord, "id" | "createdAt" | "updatedAt">): Promise<DeviceAccessRecord> {
  await ensureAccessTables();

  let savedRecord: DeviceAccessRecord | null = null;

  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO device_access_requests
         (device_id, device_name, user_name, user_email, request_note, ip_address, country, city, region_name, location_coords, timezone, user_agent, status, admin_notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           device_name = EXCLUDED.device_name,
           user_name = COALESCE(EXCLUDED.user_name, device_access_requests.user_name),
           user_email = COALESCE(EXCLUDED.user_email, device_access_requests.user_email),
           request_note = COALESCE(EXCLUDED.request_note, device_access_requests.request_note),
           ip_address = EXCLUDED.ip_address,
           country = COALESCE(EXCLUDED.country, device_access_requests.country),
           city = COALESCE(EXCLUDED.city, device_access_requests.city),
           region_name = COALESCE(EXCLUDED.region_name, device_access_requests.region_name),
           location_coords = COALESCE(EXCLUDED.location_coords, device_access_requests.location_coords),
           timezone = COALESCE(EXCLUDED.timezone, device_access_requests.timezone),
           user_agent = COALESCE(EXCLUDED.user_agent, device_access_requests.user_agent),
           status = EXCLUDED.status,
           admin_notes = COALESCE(EXCLUDED.admin_notes, device_access_requests.admin_notes),
           updated_at = NOW()
         RETURNING id, device_id as "deviceId", device_name as "deviceName", user_name as "userName",
                   user_email as "userEmail", request_note as "requestNote", ip_address as "ipAddress",
                   country, city, region_name as "regionName", location_coords as "locationCoords",
                   timezone, user_agent as "userAgent", status, admin_notes as "adminNotes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          record.deviceId,
          record.deviceName,
          record.userName || null,
          record.userEmail || null,
          record.requestNote || null,
          record.ipAddress,
          record.country || null,
          record.city || null,
          record.regionName || null,
          record.locationCoords || null,
          record.timezone || null,
          record.userAgent || null,
          record.status || "pending",
          record.adminNotes || null,
        ]
      );
      if (res.rows.length > 0) {
        savedRecord = res.rows[0];
      }
    } catch (e) {
      console.error("[AccessDB] Error saving request to DB:", e);
    }
  }

  // Backup to Local Store
  const store = readLocalStore();
  const existing = store.requests[record.deviceId];
  const now = new Date().toISOString();
  const updated: DeviceAccessRecord = {
    ...existing,
    ...record,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  store.requests[record.deviceId] = updated;
  writeLocalStore(store);

  return savedRecord || updated;
}

export async function getAllDeviceAccessRequests(): Promise<DeviceAccessRecord[]> {
  await ensureAccessTables();

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, device_id as "deviceId", device_name as "deviceName", user_name as "userName",
                user_email as "userEmail", request_note as "requestNote", ip_address as "ipAddress",
                country, city, region_name as "regionName", location_coords as "locationCoords",
                timezone, user_agent as "userAgent", status, admin_notes as "adminNotes",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM device_access_requests ORDER BY created_at DESC`
      );
      if (res.rows.length > 0) {
        return res.rows;
      }
    } catch (e) {
      console.error("[AccessDB] Error getting all requests from DB:", e);
    }
  }

  const store = readLocalStore();
  return Object.values(store.requests).sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export async function updateDeviceAccessStatus(
  deviceId: string,
  status: "accepted" | "rejected" | "pending",
  adminNotes?: string
): Promise<boolean> {
  await ensureAccessTables();

  let success = false;
  if (pool) {
    try {
      await pool.query(
        `UPDATE device_access_requests
         SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW()
         WHERE device_id = $3`,
        [status, adminNotes || null, deviceId]
      );
      success = true;
    } catch (e) {
      console.error("[AccessDB] Error updating status in DB:", e);
    }
  }

  const store = readLocalStore();
  if (store.requests[deviceId]) {
    store.requests[deviceId].status = status;
    if (adminNotes !== undefined) {
      store.requests[deviceId].adminNotes = adminNotes;
    }
    store.requests[deviceId].updatedAt = new Date().toISOString();
    writeLocalStore(store);
    success = true;
  }

  return success;
}

export async function deleteDeviceAccessRequest(deviceId: string): Promise<boolean> {
  await ensureAccessTables();

  let success = false;
  if (pool) {
    try {
      await pool.query(`DELETE FROM device_access_requests WHERE device_id = $1`, [deviceId]);
      success = true;
    } catch (e) {
      console.error("[AccessDB] Error deleting device request in DB:", e);
    }
  }

  const store = readLocalStore();
  if (store.requests[deviceId]) {
    delete store.requests[deviceId];
    writeLocalStore(store);
    success = true;
  }

  return success;
}

// Helper to fetch IP geolocation details
export async function fetchIpGeolocation(ip: string) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return {
      country: "Local Environment",
      city: "Localhost",
      regionName: "Development",
      locationCoords: "0.0000, 0.0000",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName,lat,lon,timezone`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success") {
        return {
          country: data.country || "Unknown",
          city: data.city || "Unknown",
          regionName: data.regionName || "",
          locationCoords: data.lat && data.lon ? `${data.lat}, ${data.lon}` : null,
          timezone: data.timezone || null,
        };
      }
    }
  } catch (e) {
    // Silently handle lookup timeout or errors
  }

  return {
    country: "Detected IP",
    city: "Remote Location",
    regionName: "",
    locationCoords: null,
    timezone: null,
  };
}

const HMAC_SECRET = process.env.ACCESS_HMAC_SECRET || "euskalsoinua-device-auth-secret-key-2026";

/**
 * Creates a cryptographically signed device authorization token.
 */
export function signDeviceId(deviceId: string): string {
  const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(deviceId).digest("hex");
  return `${deviceId}.${hmac}`;
}

/**
 * Verifies a cryptographically signed device authorization token.
 */
export function verifySignedDeviceId(token: string | null | undefined): { valid: boolean; deviceId: string | null } {
  if (!token || typeof token !== "string") return { valid: false, deviceId: null };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, deviceId: null };
  const [deviceId, hmac] = parts;
  if (!deviceId || !hmac) return { valid: false, deviceId: null };

  const expected = crypto.createHmac("sha256", HMAC_SECRET).update(deviceId).digest("hex");
  try {
    const a = Buffer.from(hmac, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { valid: true, deviceId };
    }
  } catch {
    return { valid: false, deviceId: null };
  }
  return { valid: false, deviceId: null };
}
