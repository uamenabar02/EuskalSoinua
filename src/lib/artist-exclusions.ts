import "server-only";
import { db, pool } from "@/db";
import { artistExclusions } from "@/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import fs from "fs";
import path from "path";

export interface ExclusionRecord {
  id?: number;
  artistId?: number | null;
  artistName: string;
  entityType: "album" | "track";
  title: string;
  normalizedTitle: string;
  reason?: string;
  createdAt?: Date | string;
}

const LOCAL_STORE_FILE = fs.existsSync("/tmp")
  ? path.join("/tmp", ".artist_exclusions.json")
  : path.join(process.cwd(), ".artist_exclusions.json");

let memoryExclusions: ExclusionRecord[] = [];
let isTableInitialized = false;

function loadLocalExclusions(): ExclusionRecord[] {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const data = fs.readFileSync(LOCAL_STORE_FILE, "utf-8");
      return JSON.parse(data) || [];
    }
  } catch {}
  return [];
}

function saveLocalExclusions(records: ExclusionRecord[]) {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch {}
}

export function normalizeTitleForBlacklist(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function ensureExclusionsTable(): Promise<void> {
  if (isTableInitialized) return;
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS artist_exclusions (
          id SERIAL PRIMARY KEY,
          artist_id INTEGER,
          artist_name TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          title TEXT NOT NULL,
          normalized_title TEXT NOT NULL,
          reason TEXT DEFAULT 'manual_removal',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ae_artist_idx ON artist_exclusions(artist_name);
        CREATE INDEX IF NOT EXISTS ae_type_norm_idx ON artist_exclusions(entity_type, normalized_title);
      `);
      isTableInitialized = true;
    } catch (err) {
      console.warn("[Exclusions] Pool query error:", err);
    }
  }
}

function isMatchingArtistName(candidate: string, target: string): boolean {
  const a = candidate.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return true;
  if (a.startsWith(`${b} & `) || a.startsWith(`${b} feat `) || a.startsWith(`${b} ft. `)) return true;
  if (b.startsWith(`${a} & `) || b.startsWith(`${a} feat `) || b.startsWith(`${a} ft. `)) return true;
  return false;
}

/** Synchronous check against local memory/file store */
export function isArtistEntityBlacklistedSync(
  artistName: string,
  title: string,
  entityType?: "album" | "track",
): boolean {
  if (!artistName || !title) return false;
  const normTitle = normalizeTitleForBlacklist(title);
  if (!normTitle) return false;
  const normArtist = artistName.toLowerCase().trim();

  const localList = loadLocalExclusions();
  return localList.some((e) => {
    if (entityType && e.entityType !== entityType) return false;
    if (e.normalizedTitle !== normTitle) return false;
    return isMatchingArtistName(e.artistName, normArtist);
  });
}

/** Check if an album or track title is blacklisted for an artist */
export async function isArtistEntityBlacklisted(
  artistName: string,
  title: string,
  entityType: "album" | "track",
): Promise<boolean> {
  if (!artistName || !title) return false;
  const normTitle = normalizeTitleForBlacklist(title);
  if (!normTitle) return false;
  const normArtist = artistName.toLowerCase().trim();

  // 1. Check local memory / file store first (instant)
  const localList = loadLocalExclusions();
  const foundLocal = localList.some(
    (e) =>
      e.entityType === entityType &&
      e.normalizedTitle === normTitle &&
      isMatchingArtistName(e.artistName, normArtist),
  );
  if (foundLocal) return true;

  // 2. Check PostgreSQL database
  try {
    await ensureExclusionsTable();
    const rows = await db
      .select({ id: artistExclusions.id })
      .from(artistExclusions)
      .where(
        and(
          eq(artistExclusions.entityType, entityType),
          eq(artistExclusions.normalizedTitle, normTitle),
          ilike(artistExclusions.artistName, normArtist),
        ),
      )
      .limit(1);

    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Record exclusions / blacklists for an artist */
export async function recordArtistExclusions(
  artistName: string,
  items: Array<{
    entityType: "album" | "track";
    title: string;
    artistId?: number | null;
    reason?: string;
  }>,
): Promise<void> {
  if (!artistName || !items.length) return;
  const cleanArtist = artistName.trim();

  // 1. Save to local fallback store
  const localList = loadLocalExclusions();
  for (const item of items) {
    const normTitle = normalizeTitleForBlacklist(item.title);
    if (!normTitle) continue;
    const exists = localList.some(
      (e) =>
        e.entityType === item.entityType &&
        e.normalizedTitle === normTitle &&
        e.artistName.toLowerCase().trim() === cleanArtist.toLowerCase(),
    );
    if (!exists) {
      localList.push({
        artistId: item.artistId ?? null,
        artistName: cleanArtist,
        entityType: item.entityType,
        title: item.title,
        normalizedTitle: normTitle,
        reason: item.reason || "manual_removal",
        createdAt: new Date().toISOString(),
      });
    }
  }
  saveLocalExclusions(localList);
  memoryExclusions = localList;

  // 2. Save to database
  try {
    await ensureExclusionsTable();
    for (const item of items) {
      const normTitle = normalizeTitleForBlacklist(item.title);
      if (!normTitle) continue;

      // Check existing
      const existing = await db
        .select({ id: artistExclusions.id })
        .from(artistExclusions)
        .where(
          and(
            eq(artistExclusions.entityType, item.entityType),
            eq(artistExclusions.normalizedTitle, normTitle),
            ilike(artistExclusions.artistName, cleanArtist),
          ),
        )
        .limit(1);

      if (!existing.length) {
        await db.insert(artistExclusions).values({
          artistId: item.artistId ?? null,
          artistName: cleanArtist,
          entityType: item.entityType,
          title: item.title,
          normalizedTitle: normTitle,
          reason: item.reason || "manual_removal",
        });
      }
    }
  } catch (err) {
    console.warn("[Exclusions] DB insert error:", err);
  }
}

/** Remove an exclusion (un-blacklist) */
export async function removeArtistExclusion(
  artistName: string,
  title: string,
  entityType: "album" | "track",
): Promise<void> {
  const normTitle = normalizeTitleForBlacklist(title);
  const normArtist = artistName.toLowerCase().trim();

  // Local store
  const localList = loadLocalExclusions().filter(
    (e) =>
      !(
        e.entityType === entityType &&
        e.normalizedTitle === normTitle &&
        e.artistName.toLowerCase().trim() === normArtist
      ),
  );
  saveLocalExclusions(localList);
  memoryExclusions = localList;

  // DB
  try {
    await ensureExclusionsTable();
    await db
      .delete(artistExclusions)
      .where(
        and(
          eq(artistExclusions.entityType, entityType),
          eq(artistExclusions.normalizedTitle, normTitle),
          ilike(artistExclusions.artistName, normArtist),
        ),
      );
  } catch (err) {
    console.warn("[Exclusions] DB delete error:", err);
  }
}

/** Retrieve all exclusions for an artist */
export async function getArtistExclusions(artistName: string): Promise<ExclusionRecord[]> {
  const normArtist = artistName.toLowerCase().trim();
  const localList = loadLocalExclusions().filter(
    (e) => e.artistName.toLowerCase().trim() === normArtist,
  );

  try {
    await ensureExclusionsTable();
    const rows = await db
      .select()
      .from(artistExclusions)
      .where(ilike(artistExclusions.artistName, normArtist));

    if (rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.id,
        artistId: r.artistId,
        artistName: r.artistName,
        entityType: r.entityType as "album" | "track",
        title: r.title,
        normalizedTitle: r.normalizedTitle,
        reason: r.reason,
        createdAt: r.createdAt,
      }));
    }
  } catch {}

  return localList;
}
