import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  likedTracks,
  followedArtists,
  savedAlbums,
  listenEvents,
  playlists,
  settings,
  playlistTracks,
  syncDevices,
} from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const headersList = await headers();

  const syncKey = cookieStore.get("sync_key")?.value || "default";
  const deviceId = cookieStore.get("device_id")?.value;
  let deviceName = cookieStore.get("device_name")?.value;

  if (deviceName) {
    try {
      deviceName = decodeURIComponent(deviceName);
    } catch (e) {}
  }

  const userAgent = headersList.get("user-agent") || undefined;

  let existingDevices: any[] = [];
  try {
    existingDevices = await db
      .select()
      .from(syncDevices)
      .where(eq(syncDevices.syncKey, syncKey));
  } catch (err) {
    console.error("Failed to query existing devices:", err);
  }

  const hasOtherDevices = existingDevices.length > 0;
  const isRegistered = deviceId ? existingDevices.some((d) => d.deviceId === deviceId) : false;

  // If other devices exist under this syncKey, but this device is NOT registered,
  // it has been explicitly unlinked from this sync group.
  if (hasOtherDevices && !isRegistered && deviceId) {
    return NextResponse.json({ unlinked: true });
  }

  // If device identification exists and it is safe to register (either empty group or already registered), register/heartbeat this device
  if (syncKey && deviceId && deviceName) {
    try {
      await db
        .insert(syncDevices)
        .values({
          syncKey,
          deviceId,
          deviceName,
          userAgent,
          lastActiveAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [syncDevices.syncKey, syncDevices.deviceId],
          set: {
            deviceName,
            userAgent,
            lastActiveAt: new Date(),
          },
        });
    } catch (err) {
      console.error("Failed to register device in syncDevices:", err);
    }
  }

  try {
    const devices = await db
      .select()
      .from(syncDevices)
      .where(eq(syncDevices.syncKey, syncKey))
      .orderBy(desc(syncDevices.lastActiveAt));

    return NextResponse.json({ devices, currentDeviceId: deviceId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, fromKey, toKey } = body;

  if (action === "merge") {
    if (!fromKey || !toKey || fromKey === toKey) {
      return NextResponse.json({ error: "Invalid sync keys" }, { status: 400 });
    }

    try {
      // 1. Merge liked tracks
      const fromLikes = await db.select().from(likedTracks).where(eq(likedTracks.syncKey, fromKey));
      for (const like of fromLikes) {
        await db
          .insert(likedTracks)
          .values({ syncKey: toKey, trackId: like.trackId, likedAt: like.likedAt })
          .onConflictDoNothing();
      }

      // 2. Merge followed artists
      const fromFollows = await db.select().from(followedArtists).where(eq(followedArtists.syncKey, fromKey));
      for (const follow of fromFollows) {
        await db
          .insert(followedArtists)
          .values({ syncKey: toKey, artistId: follow.artistId, followedAt: follow.followedAt })
          .onConflictDoNothing();
      }

      // 3. Merge saved albums
      const fromSaves = await db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, fromKey));
      for (const save of fromSaves) {
        await db
          .insert(savedAlbums)
          .values({ syncKey: toKey, albumId: save.albumId, savedAt: save.savedAt })
          .onConflictDoNothing();
      }

      // 4. Merge listen events
      const fromEvents = await db.select().from(listenEvents).where(eq(listenEvents.syncKey, fromKey));
      for (const ev of fromEvents) {
        await db
          .insert(listenEvents)
          .values({
            syncKey: toKey,
            trackId: ev.trackId,
            artistId: ev.artistId,
            genre: ev.genre,
            region: ev.region,
            completed: ev.completed,
            skipped: ev.skipped,
            listenSeconds: ev.listenSeconds,
            createdAt: ev.createdAt,
          });
      }

      // 5. Merge settings
      const fromSettings = await db.select().from(settings).where(eq(settings.syncKey, fromKey));
      for (const set of fromSettings) {
        await db
          .insert(settings)
          .values({ syncKey: toKey, key: set.key, value: set.value })
          .onConflictDoUpdate({ target: [settings.syncKey, settings.key], set: { value: set.value } });
      }

      // 6. Merge playlists
      const fromPlaylists = await db.select().from(playlists).where(eq(playlists.syncKey, fromKey));
      for (const pl of fromPlaylists) {
        // Create new playlist under toKey
        const [newPl] = await db
          .insert(playlists)
          .values({
            syncKey: toKey,
            name: pl.name,
            description: pl.description,
            coverSeed: pl.coverSeed,
            trackCount: pl.trackCount,
            type: pl.type,
            createdAt: pl.createdAt,
          })
          .returning();
        
        // Also copy tracks
        const plTracks = await db.select().from(playlistTracks).where(eq(playlistTracks.playlistId, pl.id));
        for (const plt of plTracks) {
          await db
            .insert(playlistTracks)
            .values({
              playlistId: newPl.id,
              trackId: plt.trackId,
              position: plt.position,
              addedAt: plt.addedAt,
            });
        }
      }

      // 7. Merge sync devices (move them to the new key)
      const fromDevices = await db.select().from(syncDevices).where(eq(syncDevices.syncKey, fromKey));
      for (const dev of fromDevices) {
        await db
          .insert(syncDevices)
          .values({
            syncKey: toKey,
            deviceId: dev.deviceId,
            deviceName: dev.deviceName,
            userAgent: dev.userAgent,
            lastActiveAt: dev.lastActiveAt,
            createdAt: dev.createdAt,
          })
          .onConflictDoUpdate({
            target: [syncDevices.syncKey, syncDevices.deviceId],
            set: {
              deviceName: dev.deviceName,
              userAgent: dev.userAgent,
              lastActiveAt: dev.lastActiveAt,
            },
          });
      }
      // Delete old device mappings under fromKey
      await db.delete(syncDevices).where(eq(syncDevices.syncKey, fromKey));

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      console.error("Merge error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === "clone") {
    const { fromKey, toKey, deviceId, deviceName, userAgent } = body;
    if (!fromKey || !toKey || fromKey === toKey) {
      return NextResponse.json({ error: "Invalid sync keys" }, { status: 400 });
    }

    try {
      // 1. Copy liked tracks
      const fromLikes = await db.select().from(likedTracks).where(eq(likedTracks.syncKey, fromKey));
      for (const like of fromLikes) {
        await db
          .insert(likedTracks)
          .values({ syncKey: toKey, trackId: like.trackId, likedAt: like.likedAt })
          .onConflictDoNothing();
      }

      // 2. Copy followed artists
      const fromFollows = await db.select().from(followedArtists).where(eq(followedArtists.syncKey, fromKey));
      for (const follow of fromFollows) {
        await db
          .insert(followedArtists)
          .values({ syncKey: toKey, artistId: follow.artistId, followedAt: follow.followedAt })
          .onConflictDoNothing();
      }

      // 3. Copy saved albums
      const fromSaves = await db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, fromKey));
      for (const save of fromSaves) {
        await db
          .insert(savedAlbums)
          .values({ syncKey: toKey, albumId: save.albumId, savedAt: save.savedAt })
          .onConflictDoNothing();
      }

      // 4. Copy listen events
      const fromEvents = await db.select().from(listenEvents).where(eq(listenEvents.syncKey, fromKey));
      for (const ev of fromEvents) {
        await db
          .insert(listenEvents)
          .values({
            syncKey: toKey,
            trackId: ev.trackId,
            artistId: ev.artistId,
            genre: ev.genre,
            region: ev.region,
            completed: ev.completed,
            skipped: ev.skipped,
            listenSeconds: ev.listenSeconds,
            createdAt: ev.createdAt,
          });
      }

      // 5. Copy settings
      const fromSettings = await db.select().from(settings).where(eq(settings.syncKey, fromKey));
      for (const set of fromSettings) {
        await db
          .insert(settings)
          .values({ syncKey: toKey, key: set.key, value: set.value })
          .onConflictDoUpdate({ target: [settings.syncKey, settings.key], set: { value: set.value } });
      }

      // 6. Copy playlists
      const fromPlaylists = await db.select().from(playlists).where(eq(playlists.syncKey, fromKey));
      for (const pl of fromPlaylists) {
        // Create new playlist under toKey
        const [newPl] = await db
          .insert(playlists)
          .values({
            syncKey: toKey,
            name: pl.name,
            description: pl.description,
            coverSeed: pl.coverSeed,
            trackCount: pl.trackCount,
            type: pl.type,
            createdAt: pl.createdAt,
          })
          .returning();
        
        // Also copy tracks
        const plTracks = await db.select().from(playlistTracks).where(eq(playlistTracks.playlistId, pl.id));
        for (const plt of plTracks) {
          await db
            .insert(playlistTracks)
            .values({
              playlistId: newPl.id,
              trackId: plt.trackId,
              position: plt.position,
              addedAt: plt.addedAt,
            });
        }
      }

      // 7. Register the cloning device under the new toKey in sync_devices
      if (deviceId && deviceName) {
        await db
          .insert(syncDevices)
          .values({
            syncKey: toKey,
            deviceId,
            deviceName,
            userAgent: userAgent || null,
            lastActiveAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [syncDevices.syncKey, syncDevices.deviceId],
            set: {
              deviceName,
              userAgent: userAgent || null,
              lastActiveAt: new Date(),
            },
          });
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      console.error("Clone error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === "rename") {
    const { deviceId: targetDeviceId, name } = body;
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";
    const currentDeviceId = targetDeviceId || cookieStore.get("device_id")?.value;

    if (!currentDeviceId || !name?.trim()) {
      return NextResponse.json({ error: "deviceId and name are required" }, { status: 400 });
    }

    try {
      await db
        .update(syncDevices)
        .set({ deviceName: name.trim() })
        .where(and(eq(syncDevices.syncKey, syncKey), eq(syncDevices.deviceId, currentDeviceId)));

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === "unlink") {
    const { deviceId: targetDeviceId } = body;
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";

    if (!targetDeviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    try {
      await db
        .delete(syncDevices)
        .where(and(eq(syncDevices.syncKey, syncKey), eq(syncDevices.deviceId, targetDeviceId)));

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
