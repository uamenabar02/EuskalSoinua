import { db, pool } from "@/db";
import { deviceAccessRequests, adminConfig } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import fs from "fs";
import path from "path";

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
const LOCAL_STORE_FILE = path.join(process.cwd(), ".access_data.json");

interface LocalStore {
  adminEmail: string;
  adminPasscode: string;
  adminInitialized?: boolean;
  adminSessions: string[]; // session tokens for authenticated admin devices
  requests: Record<string, DeviceAccessRecord>;
}

const defaultStore: LocalStore = {
  adminEmail: "uamenabar02@gmail.com",
  adminPasscode: "EuskalAdmin2026",
  adminSessions: [],
  requests: {},
};

function readLocalStore(): LocalStore {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const data = fs.readFileSync(LOCAL_STORE_FILE, "utf-8");
      return { ...defaultStore, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error("[AccessDB] Failed reading local store file:", e);
  }
  return defaultStore;
}

function writeLocalStore(store: LocalStore) {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.error("[AccessDB] Failed writing local store file:", e);
  }
}

let tablesInitialized = false;

export async function ensureAccessTables() {
  if (tablesInitialized) return;
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

      // Ensure default admin config values in DB
      await pool.query(`
        INSERT INTO admin_config (key, value)
        VALUES ('admin_email', 'uamenabar02@gmail.com')
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO admin_config (key, value)
        VALUES ('admin_passcode', 'EuskalAdmin2026')
        ON CONFLICT (key) DO NOTHING;
      `);

      tablesInitialized = true;
    } catch (err) {
      console.error("[AccessDB] SQL init failed, using fallback:", err);
    }
  }
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
  if (key === "admin_passcode") return store.adminPasscode;
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
  if (key === "admin_passcode") store.adminPasscode = value;
  if (key === "admin_initialized") store.adminInitialized = value === "true";
  writeLocalStore(store);
  return dbSuccess || true;
}

export async function isAdminInitialized(): Promise<boolean> {
  const val = await getAdminConfig("admin_initialized", "false");
  return val === "true";
}

export async function markAdminInitialized(): Promise<void> {
  await setAdminConfig("admin_initialized", "true");
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
