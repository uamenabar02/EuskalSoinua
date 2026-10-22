import { describe, it, expect } from "vitest";
import { auditArtistDiscography, applyArtistAuditChanges } from "@/lib/artist-audit";
import { db } from "@/db";
import { artists, albums, tracks } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";

describe("Artist Discography Disambiguation & Audit Engine", () => {
  it("audits Añube and recognizes authentic Basque rock albums", async () => {
    // Find or create Añube for the test
    let [anube] = await db
      .select()
      .from(artists)
      .where(ilike(artists.name, "Añube"))
      .limit(1);

    if (!anube) {
      const [created] = await db
        .insert(artists)
        .values({
          name: "Añube",
          genre: "Basque Rock",
          region: "eu",
          language: "eu",
        })
        .returning();
      anube = created;

      // Add authentic albums
      const [alb1] = await db
        .insert(albums)
        .values({
          title: "Errautsetatik Loratzen",
          artistId: anube.id,
          artistName: "Añube",
          year: 2020,
        })
        .returning();

      await db.insert(tracks).values({
        title: "Zentzu Bila",
        artistId: anube.id,
        artistName: "Añube",
        albumId: alb1.id,
        albumName: "Errautsetatik Loratzen",
      });
    }

    const result = await auditArtistDiscography(anube.id);
    expect(result.artist.name).toBe("Añube");
    expect(result.isBasque).toBe(true);
    expect(result.albums.length).toBeGreaterThanOrEqual(1);

    const authenticItem = result.albums.find(
      (a) => a.title.toLowerCase() === "errautsetatik loratzen",
    );
    expect(authenticItem).toBeDefined();
    expect(authenticItem?.status).toBe("authentic");
    expect(authenticItem?.suggestedAction).toBe("keep");
  });

  it("detects and flags foreign homonym albums with suggested action 'remove'", async () => {
    let [testArtist] = await db
      .select()
      .from(artists)
      .where(eq(artists.name, "Añube Test Band"))
      .limit(1);

    if (!testArtist) {
      const [created] = await db
        .insert(artists)
        .values({
          name: "Añube Test Band",
          genre: "Basque Rock",
          region: "eu",
        })
        .returning();
      testArtist = created;
    }

    // Insert a foreign rap album under this artist
    const [foreignAlb] = await db
      .insert(albums)
      .values({
        title: "Anu: Dé (US Rap)",
        artistId: testArtist.id,
        artistName: "Añube",
        genre: "Hip-Hop",
      })
      .returning();

    await db.insert(tracks).values({
      title: "Blackman's Prayer (Foreign Track)",
      artistId: testArtist.id,
      artistName: "Añube",
      albumId: foreignAlb.id,
      albumName: "Anu: Dé (US Rap)",
      genre: "Hip-Hop",
    });

    // Also insert an authentic Basque album
    const [authenticAlb] = await db
      .insert(albums)
      .values({
        title: "Auzo zaharra",
        artistId: testArtist.id,
        artistName: "Añube",
        genre: "Basque Rock",
      })
      .returning();

    await db.insert(tracks).values({
      title: "Auzo zaharra",
      artistId: testArtist.id,
      artistName: "Añube",
      albumId: authenticAlb.id,
      albumName: "Auzo zaharra",
      genre: "Basque Rock",
    });

    const audit = await auditArtistDiscography(testArtist.id);
    expect(audit.hasIssues).toBe(true);

    const flagged = audit.albums.find((a) => a.id === foreignAlb.id);
    expect(flagged).toBeDefined();
    expect(flagged?.status).toBe("flagged_foreign");
    expect(flagged?.suggestedAction).toBe("remove");

    // Apply removal of the flagged album
    const applyRes = await applyArtistAuditChanges(testArtist.id, {
      removeAlbumIds: [foreignAlb.id],
    });
    expect(applyRes.success).toBe(true);
    expect(applyRes.removedAlbumsCount).toBe(1);

    // Verify it is gone from the artist's discography
    const reAudit = await auditArtistDiscography(testArtist.id);
    expect(reAudit.albums.find((a) => a.id === foreignAlb.id)).toBeUndefined();

    // Clean up test artist
    await db.delete(tracks).where(eq(tracks.artistId, testArtist.id));
    await db.delete(albums).where(eq(albums.artistId, testArtist.id));
    await db.delete(artists).where(eq(artists.id, testArtist.id));
  });
});
