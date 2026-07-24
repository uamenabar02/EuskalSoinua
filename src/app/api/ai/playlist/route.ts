import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { db } from "@/db";
import { tracks, playlists, playlistTracks } from "@/db/schema";
import { mapTrack } from "@/lib/mappers";
import { ingestOnlineTracks } from "@/lib/sources/online";
import { desc } from "drizzle-orm";
import type { Track } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Fetch existing candidate tracks from database pool first
    const dbTracksRaw = await db.select().from(tracks).orderBy(desc(tracks.id)).limit(100);
    const candidateTracks: Track[] = dbTracksRaw.map(mapTrack);
    const trackPoolSummary = candidateTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artistName,
      genre: t.genre ?? "Basque",
    }));

    let title = "";
    let description = "";
    let dbTrackIds: number[] = [];
    let searchQueries: string[] = [];

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const systemInstruction = `You are EuskalSoinua's AI Master Music Curator, specializing in Basque, Spanish, French, and Global music genres.
Given a user prompt describing a mood, theme, or activity, and a list of local database tracks:

1. \`title\`: Create a full, catchy, high-energy playlist title (e.g., "Euskal Dub & Reggae Revolution", "Euskal Rock Anthems").
2. \`description\`: Write a compelling 2-sentence description of the musical vibe.
3. \`dbTrackIds\`: Select 3 to 10 track IDs from the provided candidate list that fit this prompt best.
4. \`searchQueries\`: Provide 4 to 6 specific, real Basque or world artist/group names or famous song titles (e.g. ["Zetak", "Esne Beltza", "Skakeitan", "Bulego", "Huntza", "Kortatu", "Berri Txarrak", "Green Valley"]). DO NOT return generic album phrases like "Upbeat Reggae Mix" — ALWAYS return real artist or group names.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `User Prompt: "${prompt}"\nLocal Candidate Tracks Pool: ${JSON.stringify(trackPoolSummary.slice(0, 40))}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Playlist title" },
                description: { type: Type.STRING, description: "Playlist description" },
                dbTrackIds: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: "List of matching track IDs from the local candidate pool",
                },
                searchQueries: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 4 to 6 real artist or group search queries",
                },
              },
              required: ["title", "description", "dbTrackIds", "searchQueries"],
            },
          },
        });

        const jsonText = response.text || "{}";
        const result = JSON.parse(jsonText);

        title = result.title || `Euskal Mix: ${prompt}`;
        description = result.description || `Custom AI curated playlist for "${prompt}"`;
        dbTrackIds = Array.isArray(result.dbTrackIds) ? result.dbTrackIds : [];
        searchQueries = Array.isArray(result.searchQueries) ? result.searchQueries : [];
      } catch (geminiError) {
        console.error("Gemini API call failed, falling back to smart prompt search:", geminiError);
      }
    }

    if (!title) {
      title = `Euskal Mix: ${prompt}`;
      description = `Custom curated playlist for "${prompt}"`;
    }

    if (searchQueries.length === 0) {
      searchQueries = [prompt, `Basque ${prompt}`, ...prompt.split(/\s+/).filter((w) => w.length > 3)];
    }

    // Ingest online tracks for each artist/group search query
    const onlineResults = await Promise.all(
      searchQueries.slice(0, 6).map((q) => ingestOnlineTracks(q).catch(() => []))
    );

    const mergedTracks: Track[] = [];
    const seenIds = new Set<number>();

    // 1. Add matching local DB tracks selected by Gemini
    const selectedDbTracks = candidateTracks.filter((t) => dbTrackIds.includes(t.id));
    for (const t of selectedDbTracks) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        mergedTracks.push(t);
      }
    }

    // 2. Add ingested online tracks (filtering out generic placeholder artist names)
    for (const trackList of onlineResults) {
      for (const t of trackList) {
        const lowerArtist = (t.artistName || "").toLowerCase();
        // Skip generic compilation artist names like "Upbeat Reggae Mix"
        if (lowerArtist.includes("mix") || lowerArtist.includes("compilation") || lowerArtist.includes("various artists")) {
          continue;
        }
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          mergedTracks.push(t);
        }
      }
    }

    // 3. Fallback: if still under 6 tracks, search DB tracks by keyword
    if (mergedTracks.length < 6) {
      const keywords = prompt.toLowerCase().split(/\s+/).filter((k) => k.length > 2);
      const matchedDb = candidateTracks.filter((t) => {
        const text = `${t.title} ${t.artistName} ${t.genre || ""}`.toLowerCase();
        return keywords.some((k) => text.includes(k));
      });

      for (const t of matchedDb.length > 0 ? matchedDb : candidateTracks) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          mergedTracks.push(t);
        }
      }
    }

    const finalTracks = mergedTracks.slice(0, 15);

    if (finalTracks.length === 0) {
      return NextResponse.json({ error: "Could not find matching tracks for playlist" }, { status: 400 });
    }

    // Save playlist to database
    const [insertedPlaylist] = await db
      .insert(playlists)
      .values({
        name: title,
        description,
        syncKey: "default",
        createdAt: new Date(),
      })
      .returning();

    if (insertedPlaylist) {
      const playlistTrackRows = finalTracks.map((t, idx) => ({
        playlistId: insertedPlaylist.id,
        trackId: t.id,
        position: idx,
      }));
      if (playlistTrackRows.length > 0) {
        await db.insert(playlistTracks).values(playlistTrackRows);
      }
    }

    return NextResponse.json({
      playlistId: insertedPlaylist?.id ?? null,
      name: title,
      description,
      tracks: finalTracks,
    });
  } catch (error) {
    console.error("AI Playlist Generation error:", error);
    return NextResponse.json({ error: "Failed to generate AI playlist" }, { status: 500 });
  }
}
