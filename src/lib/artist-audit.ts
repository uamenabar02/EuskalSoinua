import "server-only";
import { db } from "@/db";
import { artists, albums, tracks } from "@/db/schema";
import { eq, ilike, or, inArray, desc } from "drizzle-orm";
import {
  getFullDiscography,
  isValidMatchForArtist,
  persistMatch,
  BASQUE_DISAMBIGUATION,
  type OnlineMatch,
} from "@/lib/sources/online";

export type AlbumAuditStatus = "flagged_foreign" | "authentic" | "missing_online";
export type SuggestedAction = "remove" | "keep" | "import";

export interface AuditAlbumItem {
  id: number | string;
  title: string;
  artistName: string;
  thumbnail: string | null;
  year: number | null;
  trackCount: number;
  tracks: string[];
  trackIds?: number[];
  status: AlbumAuditStatus;
  reason: string;
  suggestedAction: SuggestedAction;
  isLocal: boolean;
}

export interface ArtistAuditResult {
  artist: {
    id: number;
    name: string;
    region: string | null;
    genre: string | null;
    thumbnail: string | null;
  };
  isBasque: boolean;
  hasIssues: boolean;
  summary: {
    totalAlbums: number;
    authenticCount: number;
    flaggedCount: number;
    missingCount: number;
  };
  albums: AuditAlbumItem[];
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Audits an artist's discography in the database against Basque disambiguation rules
 * and online streaming metadata sources (Deezer / iTunes).
 */
export async function auditArtistDiscography(
  artistIdOrName: number | string,
): Promise<ArtistAuditResult> {
  let artistRow: any = null;
  const isNumeric =
    typeof artistIdOrName === "number" ||
    (!isNaN(Number(artistIdOrName)) &&
      !String(artistIdOrName).includes("%") &&
      String(artistIdOrName).trim() !== "");

  if (isNumeric) {
    const rows = await db
      .select()
      .from(artists)
      .where(eq(artists.id, Number(artistIdOrName)))
      .limit(1);
    artistRow = rows[0];
  } else {
    const nameStr = decodeURIComponent(String(artistIdOrName)).trim();
    if (nameStr) {
      const rows = await db
        .select()
        .from(artists)
        .where(ilike(artists.name, nameStr))
        .limit(1);
      artistRow = rows[0];
    }
  }

  if (!artistRow) {
    throw new Error("Artist not found");
  }

  const artistName = artistRow.name;
  const isBasque =
    artistRow.region === "eu" ||
    (artistRow.genre && artistRow.genre.toLowerCase().includes("basque")) ||
    Boolean(BASQUE_DISAMBIGUATION[artistName.toLowerCase().trim()]);

  // 1. Fetch all local albums and tracks currently in DB
  const localAlbums = await db
    .select()
    .from(albums)
    .where(
      or(
        eq(albums.artistId, artistRow.id),
        ilike(albums.artistName, artistName),
      ),
    )
    .orderBy(desc(albums.year));

  const localTracks = await db
    .select()
    .from(tracks)
    .where(
      or(
        eq(tracks.artistId, artistRow.id),
        ilike(tracks.artistName, artistName),
      ),
    )
    .orderBy(desc(tracks.playCount));

  // Map tracks to album IDs and album names
  type LocalTrack = (typeof localTracks)[number];
  const albumTracksMap = new Map<number, LocalTrack[]>();
  const unassignedTracks: LocalTrack[] = [];

  for (const t of localTracks) {
    if (t.albumId) {
      const list = albumTracksMap.get(t.albumId) || [];
      list.push(t);
      albumTracksMap.set(t.albumId, list);
    } else {
      unassignedTracks.push(t);
    }
  }

  const auditedItems: AuditAlbumItem[] = [];
  const localAlbumNormTitles = new Set<string>();

  // 2. Audit each local album
  for (const alb of localAlbums) {
    localAlbumNormTitles.add(normalize(alb.title));
    const albTracks = albumTracksMap.get(alb.id) || [];
    const trackTitles = albTracks.map((t) => t.title);
    const trackIds = albTracks.map((t) => t.id);

    // Run disambiguation check on album
    const isAlbValid = isValidMatchForArtist(artistName, {
      title: alb.title,
      album: alb.title,
      genre: alb.genre,
    });

    // Run disambiguation check on each track in album
    const invalidTracks = albTracks.filter(
      (t) =>
        !isValidMatchForArtist(artistName, {
          title: t.title,
          album: t.albumName,
          genre: t.genre,
        }),
    );

    const isFlagged = !isAlbValid || invalidTracks.length > 0;

    let reason = "Verified authentic release in artist discography.";
    let status: AlbumAuditStatus = "authentic";
    let suggestedAction: SuggestedAction = "keep";

    if (isFlagged) {
      status = "flagged_foreign";
      suggestedAction = "remove";
      if (!isAlbValid) {
        reason = `Album title or genre ('${alb.genre || "unrelated"}') matches foreign namesake collision.`;
      } else {
        reason = `Contains ${invalidTracks.length} track(s) matching foreign homonym or genre mismatch (e.g., "${invalidTracks[0]?.title}").`;
      }
    }

    auditedItems.push({
      id: alb.id,
      title: alb.title,
      artistName: alb.artistName || artistName,
      thumbnail: alb.thumbnail,
      year: alb.year,
      trackCount: albTracks.length || alb.trackCount || 0,
      tracks: trackTitles,
      trackIds,
      status,
      reason,
      suggestedAction,
      isLocal: true,
    });
  }

  // Check unassigned tracks for foreign collisions
  if (unassignedTracks.length > 0) {
    const invalidUnassigned = unassignedTracks.filter(
      (t) =>
        !isValidMatchForArtist(artistName, {
          title: t.title,
          album: t.albumName,
          genre: t.genre,
        }),
    );

    if (invalidUnassigned.length > 0) {
      auditedItems.push({
        id: "unassigned_flagged",
        title: "Singles & Unassigned Flagged Tracks",
        artistName,
        thumbnail: null,
        year: null,
        trackCount: invalidUnassigned.length,
        tracks: invalidUnassigned.map((t) => t.title),
        trackIds: invalidUnassigned.map((t) => t.id),
        status: "flagged_foreign",
        reason: `${invalidUnassigned.length} standalone track(s) detected as foreign namesake collisions.`,
        suggestedAction: "remove",
        isLocal: true,
      });
    }
  }

  // 3. Query online sources for authentic releases that might be MISSING from DB
  let onlineMatches: OnlineMatch[] = [];
  try {
    onlineMatches = await getFullDiscography(artistName);
  } catch {
    onlineMatches = [];
  }

  const validOnlineMatches = onlineMatches.filter((m) =>
    isValidMatchForArtist(artistName, m),
  );

  // Group online matches by album title
  const onlineAlbumsMap = new Map<string, OnlineMatch[]>();
  for (const m of validOnlineMatches) {
    const albName = m.album?.trim();
    if (!albName) continue;
    const normKey = normalize(albName);
    const existing = onlineAlbumsMap.get(normKey) || [];
    existing.push(m);
    onlineAlbumsMap.set(normKey, existing);
  }

  for (const [normKey, matches] of onlineAlbumsMap.entries()) {
    if (!localAlbumNormTitles.has(normKey)) {
      const first = matches[0];
      const albTitle = first.album || normKey;
      auditedItems.push({
        id: `online_${encodeURIComponent(albTitle)}`,
        title: albTitle,
        artistName,
        thumbnail: first.artwork,
        year: null,
        trackCount: matches.length,
        tracks: matches.map((m) => m.title),
        status: "missing_online",
        reason:
          "Official authentic release found on streaming sources; available to import into your library.",
        suggestedAction: "import",
        isLocal: false,
      });
    }
  }

  // 4. Calculate summaries
  const authenticCount = auditedItems.filter((i) => i.status === "authentic").length;
  const flaggedCount = auditedItems.filter((i) => i.status === "flagged_foreign").length;
  const missingCount = auditedItems.filter((i) => i.status === "missing_online").length;

  return {
    artist: {
      id: artistRow.id,
      name: artistRow.name,
      region: artistRow.region,
      genre: artistRow.genre,
      thumbnail: artistRow.thumbnail,
    },
    isBasque,
    hasIssues: flaggedCount > 0 || missingCount > 0,
    summary: {
      totalAlbums: auditedItems.length,
      authenticCount,
      flaggedCount,
      missingCount,
    },
    albums: auditedItems,
  };
}

/**
 * Applies the user-confirmed changes to the artist's discography.
 */
export async function applyArtistAuditChanges(
  artistId: number,
  options: {
    removeAlbumIds?: (number | string)[];
    importAlbumTitles?: string[];
    removeTrackIds?: number[];
  },
): Promise<{
  success: boolean;
  removedAlbumsCount: number;
  importedAlbumsCount: number;
  removedTracksCount: number;
}> {
  const [artistRow] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);

  if (!artistRow) {
    throw new Error("Artist not found");
  }

  let removedAlbumsCount = 0;
  let removedTracksCount = 0;
  let importedAlbumsCount = 0;

  // 1. Remove selected albums and their tracks
  if (options.removeAlbumIds && options.removeAlbumIds.length > 0) {
    const numericAlbumIds = options.removeAlbumIds
      .filter(
        (id): id is number =>
          typeof id === "number" ||
          (!isNaN(Number(id)) && !String(id).startsWith("online_")),
      )
      .map(Number);

    if (numericAlbumIds.length > 0) {
      // Delete all tracks associated with these albums
      const deletedTracks = await db
        .delete(tracks)
        .where(inArray(tracks.albumId, numericAlbumIds))
        .returning({ id: tracks.id });
      removedTracksCount += deletedTracks.length;

      // Delete the albums themselves
      const deletedAlbums = await db
        .delete(albums)
        .where(inArray(albums.id, numericAlbumIds))
        .returning({ id: albums.id });
      removedAlbumsCount += deletedAlbums.length;
    }
  }

  // 2. Remove any individual tracks explicitly selected (e.g., from unassigned tracks)
  if (options.removeTrackIds && options.removeTrackIds.length > 0) {
    const deletedTracks = await db
      .delete(tracks)
      .where(inArray(tracks.id, options.removeTrackIds))
      .returning({ id: tracks.id });
    removedTracksCount += deletedTracks.length;
  }

  // 3. Import selected missing albums from online sources
  if (options.importAlbumTitles && options.importAlbumTitles.length > 0) {
    const onlineMatches = await getFullDiscography(artistRow.name);
    const validMatches = onlineMatches.filter((m) =>
      isValidMatchForArtist(artistRow.name, m),
    );

    const normTargetTitles = new Set(
      options.importAlbumTitles.map((t) => normalize(t)),
    );

    const matchesToPersist = validMatches.filter((m) => {
      const alb = m.album?.trim();
      return alb && normTargetTitles.has(normalize(alb));
    });

    for (const m of matchesToPersist) {
      await persistMatch({ ...m, artist: artistRow.name });
    }

    importedAlbumsCount = options.importAlbumTitles.length;
  }

  return {
    success: true,
    removedAlbumsCount,
    importedAlbumsCount,
    removedTracksCount,
  };
}
