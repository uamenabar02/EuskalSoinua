import "server-only";
import { db } from "@/db";
import { artists, albums, tracks } from "@/db/schema";
import { eq, ilike, or, inArray, desc, and } from "drizzle-orm";
import {
  getFullDiscography,
  isValidMatchForArtist,
  persistMatch,
  BASQUE_DISAMBIGUATION,
  type OnlineMatch,
} from "@/lib/sources/online";
import { recordArtistExclusions } from "@/lib/artist-exclusions";

export type AlbumAuditStatus = "flagged_foreign" | "authentic" | "missing_online";
export type SuggestedAction = "remove" | "keep" | "import";

export interface AuditTrackDetail {
  id: number;
  title: string;
  status: "authentic" | "flagged_foreign";
  reason?: string;
}

export interface AuditAlbumItem {
  id: number | string;
  title: string;
  artistName: string;
  thumbnail: string | null;
  year: number | null;
  trackCount: number;
  tracks: string[];
  trackIds?: number[];
  trackItems?: AuditTrackDetail[];
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

  // 1. Fetch all local albums and tracks currently in DB (including homonym candidates)
  const localAlbums = await db
    .select()
    .from(albums)
    .where(
      or(
        eq(albums.artistId, artistRow.id),
        ilike(albums.artistName, artistName),
        ilike(albums.artistName, `%${artistName}%`),
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
        ilike(tracks.artistName, `%${artistName}%`),
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
    const isExactArtist =
      alb.artistId === artistRow.id ||
      (alb.artistName && alb.artistName.toLowerCase().trim() === artistName.toLowerCase().trim());

    const albTracks = albumTracksMap.get(alb.id) || [];
    const trackTitles = albTracks.map((t) => t.title);
    const trackIds = albTracks.map((t) => t.id);

    // Track-level disambiguation check
    const trackItems: AuditTrackDetail[] = albTracks.map((t) => {
      const isValid = isValidMatchForArtist(artistName, {
        title: t.title,
        album: t.albumName,
        genre: t.genre,
        artist: t.artistName,
      });
      return {
        id: t.id,
        title: t.title,
        status: isValid ? "authentic" : "flagged_foreign",
        reason: isValid ? "Verified authentic track" : "Foreign collision / genre mismatch",
      };
    });

    // Run disambiguation check on album
    const isAlbValid =
      isExactArtist &&
      isValidMatchForArtist(artistName, {
        title: alb.title,
        album: alb.title,
        genre: alb.genre,
        artist: alb.artistName,
      });

    // Run disambiguation check on each track in album
    const invalidTracks = trackItems.filter((t) => t.status === "flagged_foreign");

    const isFlagged = !isAlbValid || invalidTracks.length > 0;

    let reason = "Verified authentic release in artist discography.";
    let status: AlbumAuditStatus = "authentic";
    let suggestedAction: SuggestedAction = "keep";

    if (isFlagged) {
      status = "flagged_foreign";
      suggestedAction = "remove";
      if (!isExactArtist) {
        reason = `Foreign homonym artist collision ('${alb.artistName}').`;
      } else if (!isAlbValid) {
        reason = `Album title or genre ('${alb.genre || "unrelated"}') matches foreign namesake collision.`;
      } else {
        reason = `Contains ${invalidTracks.length} track(s) matching foreign homonym or genre mismatch (e.g., "${invalidTracks[0]?.title}").`;
      }
    } else {
      localAlbumNormTitles.add(normalize(alb.title));
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
      trackItems,
      status,
      reason,
      suggestedAction,
      isLocal: true,
    });
  }

  // Check unassigned tracks for foreign collisions and authentic singles
  if (unassignedTracks.length > 0) {
    const invalidUnassigned = unassignedTracks.filter(
      (t) =>
        !isValidMatchForArtist(artistName, {
          title: t.title,
          album: t.albumName,
          genre: t.genre,
        }),
    );
    const validUnassigned = unassignedTracks.filter(
      (t) =>
        isValidMatchForArtist(artistName, {
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
        trackItems: invalidUnassigned.map((t) => ({
          id: t.id,
          title: t.title,
          status: "flagged_foreign",
          reason: "Standalone track detected as foreign namesake collision.",
        })),
        status: "flagged_foreign",
        reason: `${invalidUnassigned.length} standalone track(s) detected as foreign namesake collisions.`,
        suggestedAction: "remove",
        isLocal: true,
      });
    }

    if (validUnassigned.length > 0) {
      auditedItems.push({
        id: "unassigned_authentic",
        title: "Singles & Other Authentic Releases",
        artistName,
        thumbnail: null,
        year: null,
        trackCount: validUnassigned.length,
        tracks: validUnassigned.map((t) => t.title),
        trackIds: validUnassigned.map((t) => t.id),
        trackItems: validUnassigned.map((t) => ({
          id: t.id,
          title: t.title,
          status: "authentic",
          reason: "Verified authentic track",
        })),
        status: "authentic",
        reason: `${validUnassigned.length} standalone authentic track(s).`,
        suggestedAction: "keep",
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
  artistIdOrName: number | string,
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

  let removedAlbumsCount = 0;
  let removedTracksCount = 0;
  let importedAlbumsCount = 0;

  const exclusionsToRecord: Array<{
    entityType: "album" | "track";
    title: string;
    artistId?: number | null;
    reason?: string;
  }> = [];

  // 1. Remove selected albums and ALL associated tracks
  if (options.removeAlbumIds && options.removeAlbumIds.length > 0) {
    const numericAlbumIds = options.removeAlbumIds
      .filter(
        (id): id is number =>
          typeof id === "number" ||
          (!isNaN(Number(id)) && !String(id).startsWith("online_")),
      )
      .map(Number);

    if (numericAlbumIds.length > 0) {
      // Find albums to get their titles and artist names before deletion
      const albsToDelete = await db
        .select()
        .from(albums)
        .where(inArray(albums.id, numericAlbumIds));

      const albTitles = albsToDelete
        .map((a: { title?: string | null }) => a.title)
        .filter((t: string | null | undefined): t is string => Boolean(t));
      const foreignArtistNames = albsToDelete
        .map((a: { artistName?: string | null }) => a.artistName)
        .filter(
          (name: string | null | undefined): name is string =>
            Boolean(name && name.toLowerCase().trim() !== artistRow.name.toLowerCase().trim()),
        );

      // Record albums in blacklist
      for (const a of albsToDelete) {
        if (a.title) {
          exclusionsToRecord.push({
            entityType: "album",
            title: a.title,
            artistId: artistRow.id,
            reason: "manual_audit_removal",
          });
        }
      }

      // Record tracks inside those albums in blacklist so they won't re-ingest as orphan singles
      const tracksInAlbs = await db
        .select({ title: tracks.title })
        .from(tracks)
        .where(inArray(tracks.albumId, numericAlbumIds));
      for (const tr of tracksInAlbs) {
        if (tr.title) {
          exclusionsToRecord.push({
            entityType: "track",
            title: tr.title,
            artistId: artistRow.id,
            reason: "manual_audit_album_removal",
          });
        }
      }

      // A) Delete tracks by albumId
      const del1 = await db
        .delete(tracks)
        .where(inArray(tracks.albumId, numericAlbumIds))
        .returning({ id: tracks.id });
      removedTracksCount += del1.length;

      // B) Delete tracks by albumName if any were unlinked or had null albumId
      if (albTitles.length > 0) {
        const del2 = await db
          .delete(tracks)
          .where(
            and(
              inArray(tracks.albumName, albTitles),
              or(
                eq(tracks.artistId, artistRow.id),
                ilike(tracks.artistName, artistRow.name),
                ilike(tracks.artistName, `%${artistRow.name}%`),
              ),
            ),
          )
          .returning({ id: tracks.id });
        removedTracksCount += del2.length;
      }

      // C) If albums were by a foreign homonym (e.g. "Dupla Real", "DUPLA 02"), delete their tracks too
      for (const fName of foreignArtistNames) {
        const del3 = await db
          .delete(tracks)
          .where(ilike(tracks.artistName, fName))
          .returning({ id: tracks.id });
        removedTracksCount += del3.length;
      }

      // D) Delete the album records themselves
      const delAlbums = await db
        .delete(albums)
        .where(inArray(albums.id, numericAlbumIds))
        .returning({ id: albums.id });
      removedAlbumsCount += delAlbums.length;
    }
  }

  // 2. Remove any individual tracks explicitly selected (e.g., from unassigned tracks or single songs in albums)
  if (options.removeTrackIds && options.removeTrackIds.length > 0) {
    const tracksToDelete = await db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .where(inArray(tracks.id, options.removeTrackIds));

    for (const tr of tracksToDelete) {
      if (tr.title) {
        exclusionsToRecord.push({
          entityType: "track",
          title: tr.title,
          artistId: artistRow.id,
          reason: "manual_individual_track_removal",
        });
      }
    }

    const deletedTracks = await db
      .delete(tracks)
      .where(inArray(tracks.id, options.removeTrackIds))
      .returning({ id: tracks.id });
    removedTracksCount += deletedTracks.length;
  }

  // Persist all exclusions to blacklist permanently
  if (exclusionsToRecord.length > 0) {
    await recordArtistExclusions(artistRow.name, exclusionsToRecord);
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
