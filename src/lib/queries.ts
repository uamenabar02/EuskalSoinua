import "server-only";
import { db } from "@/db";
import {
  tracks,
  artists,
  albums,
  likedTracks,
  followedArtists,
  savedAlbums,
  playlistTracks,
  playlists,
  eqPresets,
} from "@/db/schema";
import {
  eq,
  desc,
  ilike,
  or,
  sql,
  asc,
  inArray,
  and,
} from "drizzle-orm";
import { mapTrack, mapArtist, mapAlbum } from "@/lib/mappers";
import type { Track, Artist, Album } from "@/lib/types";

export async function isLiked(trackId: number): Promise<boolean> {
  const r = await db
    .select()
    .from(likedTracks)
    .where(eq(likedTracks.trackId, trackId))
    .limit(1);
  return r.length > 0;
}

export async function likedIds(): Promise<Set<number>> {
  const rows = await db.select().from(likedTracks);
  return new Set(rows.map((r: any) => r.trackId));
}

export async function followedIds(): Promise<Set<number>> {
  const rows = await db.select().from(followedArtists);
  return new Set(rows.map((r: any) => r.artistId));
}

export async function savedAlbumIds(): Promise<Set<number>> {
  const rows = await db.select().from(savedAlbums);
  return new Set(rows.map((r: any) => r.albumId));
}

export async function getTrack(id: number): Promise<Track | null> {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return row ? mapTrack(row) : null;
}

export async function getTrackWithLike(id: number): Promise<(Track & { liked: boolean }) | null> {
  const t = await getTrack(id);
  if (!t) return null;
  return { ...t, liked: await isLiked(id) };
}

/** Cache a resolved YouTube videoId onto a track so we never re-search it. */
export async function setTrackExternalId(trackId: number, externalId: string) {
  await db
    .update(tracks)
    .set({ externalId, source: "youtube" })
    .where(eq(tracks.id, trackId));
}

/** Clear a track's cached preview URLs (e.g. when a Deezer token expired). */
export async function clearTrackPreview(trackId: number) {
  await db
    .update(tracks)
    .set({ previewUrl: null, previewUrlAlt: null })
    .where(eq(tracks.id, trackId));
}

export async function getHomeSections() {
  const [liked, followed, saved] = await Promise.all([
    likedIds(),
    followedIds(),
    savedAlbumIds(),
  ]);

  const trending = (
    await db.select().from(tracks).orderBy(desc(tracks.playCount)).limit(10)
  ).map(mapTrack);

  const basqueHighlights = (
    await db
      .select()
      .from(tracks)
      .where(eq(tracks.region, "eu"))
      .orderBy(desc(tracks.createdAt))
      .limit(10)
  ).map(mapTrack);

  const topArtists = (
    await db.select().from(artists).orderBy(desc(artists.monthlyListeners)).limit(10)
  ).map((a: any) => ({ ...mapArtist(a), followed: followed.has(a.id) }));

  const newReleases = (
    await db.select().from(albums).orderBy(desc(albums.year)).limit(10)
  ).map((a: any) => ({ ...mapAlbum(a), saved: saved.has(a.id) }));

  const basqueArtists = (
    await db
      .select()
      .from(artists)
      .where(eq(artists.region, "eu"))
      .orderBy(desc(artists.monthlyListeners))
      .limit(10)
  ).map((a: any) => ({ ...mapArtist(a), followed: followed.has(a.id) }));

  return {
    trending: trending.map((t: any) => ({ ...t, liked: liked.has(t.id) })),
    basqueHighlights: basqueHighlights.map((t: any) => ({ ...t, liked: liked.has(t.id) })),
    topArtists,
    newReleases,
    basqueArtists,
  };
}

export async function searchCatalog(q: string) {
  const term = `%${q.trim()}%`;
  const [liked, followed, saved] = await Promise.all([
    likedIds(),
    followedIds(),
    savedAlbumIds(),
  ]);

  const trackRows = await db
    .select()
    .from(tracks)
    .where(
      or(ilike(tracks.title, term), ilike(tracks.artistName, term)),
    )
    .orderBy(desc(tracks.playCount))
    .limit(25);

  const artistRows = await db
    .select()
    .from(artists)
    .where(or(ilike(artists.name, term), ilike(artists.genre, term)))
    .orderBy(desc(artists.monthlyListeners))
    .limit(12);

  const albumRows = await db
    .select()
    .from(albums)
    .where(or(ilike(albums.title, term), ilike(albums.artistName, term)))
    .orderBy(desc(albums.year))
    .limit(12);

  return {
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: liked.has(t.id) })),
    artists: artistRows.map((a: any) => ({ ...mapArtist(a), followed: followed.has(a.id) })),
    albums: albumRows.map((a: any) => ({ ...mapAlbum(a), saved: saved.has(a.id) })),
  };
}

export async function getArtist(id: number) {
  const [row] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  if (!row) return null;
  const followedSet = await followedIds();
  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.artistId, id))
    .orderBy(desc(tracks.playCount));
  const likedSet = await likedIds();
  const albumRows = await db
    .select()
    .from(albums)
    .where(eq(albums.artistId, id))
    .orderBy(desc(albums.year));
  const savedSet = await savedAlbumIds();
  return {
    artist: { ...mapArtist(row), followed: followedSet.has(row.id) },
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: likedSet.has(t.id) })),
    albums: albumRows.map((a: any) => ({ ...mapAlbum(a), saved: savedSet.has(a.id) })),
  };
}

export async function getAlbum(id: number) {
  const [row] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  if (!row) return null;
  const savedSet = await savedAlbumIds();
  const likedSet = await likedIds();
  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.albumId, id))
    .orderBy(asc(tracks.id));
  return {
    album: { ...mapAlbum(row), saved: savedSet.has(row.id) },
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: likedSet.has(t.id) })),
  };
}

export async function getLikedTracks() {
  const likedSet = await likedIds();
  if (likedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(tracks)
    .where(inArray(tracks.id, [...likedSet]))
    .orderBy(desc(tracks.playCount));
  return rows.map((t: any) => ({ ...mapTrack(t), liked: true }));
}

export async function getPlaylists() {
  return db
    .select()
    .from(playlists)
    .where(eq(playlists.type, "user"))
    .orderBy(desc(playlists.createdAt));
}

export async function getRadioPlaylists() {
  return db
    .select()
    .from(playlists)
    .where(eq(playlists.type, "radio"))
    .orderBy(desc(playlists.createdAt));
}

export async function getPlaylist(id: number) {
  const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!pl) return null;
  const likedSet = await likedIds();
  const joins = await db
    .select()
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, id))
    .orderBy(asc(playlistTracks.position));
  return {
    playlist: pl,
    tracks: joins.map((j: any) => ({ ...mapTrack(j.tracks), liked: likedSet.has(j.tracks.id) })),
  };
}

export async function getFollowedArtists() {
  const followedSet = await followedIds();
  if (followedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(artists)
    .where(inArray(artists.id, [...followedSet]))
    .orderBy(desc(artists.monthlyListeners));
  return rows.map((a: any) => ({ ...mapArtist(a), followed: true }));
}

export async function getSavedAlbums() {
  const savedSet = await savedAlbumIds();
  if (savedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(albums)
    .where(inArray(albums.id, [...savedSet]))
    .orderBy(desc(albums.year));
  return rows.map((a: any) => ({ ...mapAlbum(a), saved: true }));
}

// ---- mutations ----

export async function toggleLike(trackId: number): Promise<boolean> {
  if (await isLiked(trackId)) {
    await db.delete(likedTracks).where(eq(likedTracks.trackId, trackId));
    return false;
  }
  await db.insert(likedTracks).values({ trackId });
  return true;
}

export async function toggleFollow(artistId: number): Promise<boolean> {
  const existing = await db
    .select()
    .from(followedArtists)
    .where(eq(followedArtists.artistId, artistId))
    .limit(1);
  if (existing.length) {
    await db.delete(followedArtists).where(eq(followedArtists.artistId, artistId));
    return false;
  }
  await db.insert(followedArtists).values({ artistId });
  return true;
}

export async function toggleSaveAlbum(albumId: number): Promise<boolean> {
  const existing = await db
    .select()
    .from(savedAlbums)
    .where(eq(savedAlbums.albumId, albumId))
    .limit(1);
  if (existing.length) {
    await db.delete(savedAlbums).where(eq(savedAlbums.albumId, albumId));
    return false;
  }
  await db.insert(savedAlbums).values({ albumId });
  return true;
}

export async function createPlaylist(name: string, description?: string, type: string = "user") {
  const [row] = await db
    .insert(playlists)
    .values({
      name,
      description,
      type,
      coverSeed: `${name}-${Date.now()}`,
    })
    .returning();
  await db
    .update(playlists)
    .set({ coverSeed: `${name}-${row.id}` })
    .where(eq(playlists.id, row.id));
  return row;
}

export async function addTrackToPlaylist(playlistId: number, trackId: number) {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId));
  const position = rows[0]?.c ?? 0;
  await db.insert(playlistTracks).values({ playlistId, trackId, position });
  await db
    .update(playlists)
    .set({ trackCount: sql`${playlists.trackCount} + 1` })
    .where(eq(playlists.id, playlistId));
  return { position };
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number) {
  await db
    .delete(playlistTracks)
    .where(
      and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)),
    );
  await db
    .update(playlists)
    .set({ trackCount: sql`greatest(${playlists.trackCount} - 1, 0)` })
    .where(eq(playlists.id, playlistId));
}

export async function getEqPresets() {
  return db.select().from(eqPresets).orderBy(asc(eqPresets.id));
}
