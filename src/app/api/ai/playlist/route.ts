import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenAI, Type } from "@google/genai";
import { db } from "@/db";
import { tracks, playlists, playlistTracks } from "@/db/schema";
import { mapTrack } from "@/lib/mappers";
import { searchOnline, ingestOnlineTracks } from "@/lib/sources/online";
import { desc, ilike, and, or } from "drizzle-orm";
import type { Track } from "@/lib/types";

// Ground truth curated song mappings for resilient, high-quality Basque fallback
const GROUND_TRUTH_CATALOG: Record<string, { artist: string; title: string }[]> = {
  rock_punk: [
    { artist: "Berri Txarrak", title: "Denak Ez Du Balio" },
    { artist: "Kortatu", title: "Sarri, Sarri" },
    { artist: "Streetwise", title: "Txantxangorria" },
    { artist: "Bizardunak", title: "Nazi de Fresa" },
    { artist: "Negu Gorriak", title: "Radio Rahim" },
    { artist: "Hertzainak", title: "Aitormena" },
    { artist: "Su Ta Gar", title: "Jo Ta Ke" },
    { artist: "Gatibu", title: "Musturrek Sartunde" },
    { artist: "Belako", title: "Render Me Numb" },
    { artist: "Doctor Deseo", title: "Corazón de Tango" },
    { artist: "Streetwise", title: "Izatea Baino" },
    { artist: "Bizardunak", title: "Shane McGowan's Basque Paddys" },
  ],
  pop_urban: [
    { artist: "ZETAK", title: "Zeinen Ederra Izango Den" },
    { artist: "ZETAK", title: "Itzulera" },
    { artist: "Bengo", title: "Galdu Gattezen" },
    { artist: "Bengo", title: "Beldurrik Gabe" },
    { artist: "Tatta", title: "Muxutxo Bana" },
    { artist: "La Txama", title: "Musa 13" },
    { artist: "La Txama", title: "Fusilaren Hotsa" },
    { artist: "Bulego", title: "Bakarrik" },
    { artist: "Dupla", title: "Folklorea" },
    { artist: "ETS", title: "Aukera Berriak" },
  ],
  folk_acoustic: [
    { artist: "Izaro", title: "Aske Maitte" },
    { artist: "Izaro", title: "Oso Blanco" },
    { artist: "Anari", title: "Efemerideak" },
    { artist: "Anari", title: "Orfidentalak" },
    { artist: "Olaia Inziarte", title: "Denbora Lehen Orain" },
    { artist: "Huntza", title: "Aldapan Gora" },
    { artist: "Alaitz eta Maider", title: "Amets Bat" },
    { artist: "Mikel Laboa", title: "Txoria Txori" },
  ],
};

function isNoiseOrJunk(text: string): boolean {
  const t = text.toLowerCase();
  const junkPatterns = [
    "white noise",
    "fan noise",
    "box fan",
    "ambient noise",
    "sleep sound",
    "frequency",
    "binaural",
    "rain sound",
    "vacuum cleaner",
    "brown noise",
    "pink noise",
    "lullaby ambient",
  ];
  return junkPatterns.some((j) => t.includes(j));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode === "form" ? "form" : "prompt";

    let cleanPrompt = "";
    let targetCount = 12;
    let customTitle = "";
    let requestedBasqueInfluence = "100%";
    let requestedGenres: string[] = [];
    let requestedInspirations: string[] = [];

    if (mode === "form") {
      customTitle = (body.name || "").trim();
      const mood = (body.mood || "Any vibe (No preference)").trim();
      requestedGenres = Array.isArray(body.genres) ? body.genres : [];
      const tempo = (body.tempo || "Any tempo").trim();
      const era = (body.era || "Any era").trim();
      const inspirations = (body.inspirations || "").trim();
      if (inspirations) {
        requestedInspirations = inspirations.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
      }
      requestedBasqueInfluence = (body.basqueInfluence || "Any / Flexible").trim();
      targetCount = typeof body.trackCount === "number" && body.trackCount >= 1 && body.trackCount <= 50 ? body.trackCount : 12;

      const genresText = requestedGenres.length > 0 ? requestedGenres.join(", ") : "All genres / Mix of everything (No genre restriction)";
      const isFlexibleInfluence = requestedBasqueInfluence.toLowerCase().includes("flexible") || requestedBasqueInfluence.toLowerCase().includes("any") || requestedBasqueInfluence.toLowerCase().includes("none");

      cleanPrompt = `Create a curated playlist with the following specifications:
- Title: ${customTitle || "Creative title fitting the vibe"}
- Mood / Vibe: ${mood}
- Genres: ${genresText}
- Tempo: ${tempo}
- Era / Decade: ${era}
- Artist Inspirations: ${inspirations || "None specified"}
- Basque Music Influence Level: ${requestedBasqueInfluence}
- Target Track Count: ${targetCount} songs

CRITICAL INSTRUCTIONS:
1. BASQUE INFLUENCE:
   - If influence is "100%", ALL ${targetCount} tracks MUST be authentic Basque songs/artists (e.g. Bengo, ZETAK, Berri Txarrak, Gatibu, Izaro, Kortatu, Belako, La Txama, Tatta, Bulego, ETS, Anari, Huntza, Negu Gorriak, Streetwise).
   - If "75%", 75% Basque artists and 25% international artists fitting the genre.
   - If "50%", roughly half Basque and half international.
   - If "25%", 25% Basque and 75% international.
   - If "0%", DO NOT include Basque music! Include ONLY international/global artists in the requested genres.
   - If "Any / Flexible" or unconstrained, choose freely matching requested genres, artists, and vibe across global, Spanish, Latin, or Basque music without forcing a quota.
2. ACCURACY:
   - Only return REAL, published songs by real artists with accurate titles and artist names.
   - Return exactly ${targetCount} tracks.`;
    } else {
      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
      }
      cleanPrompt = body.prompt.trim();
      targetCount = typeof body.trackCount === "number" && body.trackCount >= 1 && body.trackCount <= 50 ? body.trackCount : 12;
    }

    const apiKey = process.env.GEMINI_API_KEY;

    let title = customTitle || "";
    let description = "";
    let curatedSongs: { artist: string; title: string }[] = [];

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

        const systemInstruction = `You are EuskalSoinua's Elite AI Music Curator, master of Basque (Euskal musika), Spanish, and Global music.
Your role is to strictly satisfy the user's playlist request, honoring requested genres, mood, era, tempo, and especially the Basque Influence Level.

Rules:
1. Every song MUST be a real, released song with exact artist name and song title.
2. Never output ambient noise, fan noise, white noise, or generic terms.
3. If Basque artists are needed, use iconic and contemporary artists like ZETAK, Bengo, Berri Txarrak, Gatibu, Kortatu, Izaro, Belako, La Txama, Tatta, Bulego, Dupla, ETS, Hertzainak, Negu Gorriak, Su Ta Gar, Streetwise, Bizardunak, Anari, Olaia Inziarte.
4. If non-Basque or global music is requested (e.g. 0% Basque or specific genres like Jazz, Rock, Indie), provide celebrated, authentic artists of that genre.
5. Provide between ${Math.max(8, targetCount - 2)} and ${targetCount + 4} songs.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: cleanPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Catchy playlist title" },
                description: { type: Type.STRING, description: "2-sentence engaging playlist description" },
                tracks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      artist: { type: Type.STRING, description: "Real artist or band name" },
                      title: { type: Type.STRING, description: "Exact song title" },
                    },
                    required: ["artist", "title"],
                  },
                  description: "List of real songs matching the theme",
                },
              },
              required: ["title", "description", "tracks"],
            },
          },
        });

        const jsonText = response.text || "{}";
        const result = JSON.parse(jsonText);

        title = customTitle || result.title || `Curated Mix: ${cleanPrompt.slice(0, 30)}`;
        description = result.description || `Custom curated playlist by Gemini AI`;
        if (Array.isArray(result.tracks) && result.tracks.length > 0) {
          curatedSongs = result.tracks.filter(
            (t: any) => t.artist && t.title && !isNoiseOrJunk(`${t.artist} ${t.title}`)
          );
        }
      } catch (geminiError) {
        console.error("Gemini API call failed, activating smart catalog curation:", geminiError);
      }
    }

    // Fallback if Gemini is not available or returned empty tracks
    if (curatedSongs.length === 0) {
      const lower = cleanPrompt.toLowerCase();
      title = customTitle || `Curated Mix: ${cleanPrompt.slice(0, 30)}`;
      description = `Custom curated selection of high-quality tracks`;

      if (lower.includes("punk") || lower.includes("rock") || lower.includes("driv") || lower.includes("energy")) {
        curatedSongs = [...GROUND_TRUTH_CATALOG.rock_punk];
      } else if (lower.includes("folk") || lower.includes("trikitia") || lower.includes("acoustic") || lower.includes("study") || lower.includes("rain")) {
        curatedSongs = [...GROUND_TRUTH_CATALOG.folk_acoustic];
      } else if (lower.includes("urban") || lower.includes("pop") || lower.includes("electronic") || lower.includes("reggae")) {
        curatedSongs = [...GROUND_TRUTH_CATALOG.pop_urban];
      } else {
        curatedSongs = [
          ...GROUND_TRUTH_CATALOG.pop_urban.slice(0, 5),
          ...GROUND_TRUTH_CATALOG.rock_punk.slice(0, 4),
          ...GROUND_TRUTH_CATALOG.folk_acoustic.slice(0, 4),
        ];
      }
    }

    // Now resolve each curated song to an actual playable Track
    const resolvedTracks: Track[] = [];
    const seenTrackIds = new Set<number>();

    // 1. Search local DB first for each curated track
    for (const song of curatedSongs) {
      if (resolvedTracks.length >= targetCount) break;

      try {
        const localMatches = await db
          .select()
          .from(tracks)
          .where(
            and(
              ilike(tracks.title, `%${song.title.trim()}%`),
              ilike(tracks.artistName, `%${song.artist.trim()}%`)
            )
          )
          .limit(1);

        if (localMatches.length > 0) {
          const t = mapTrack(localMatches[0]);
          if (!seenTrackIds.has(t.id) && !isNoiseOrJunk(`${t.artistName} ${t.title}`)) {
            seenTrackIds.add(t.id);
            resolvedTracks.push(t);
          }
        }
      } catch {}
    }

    // 2. For songs not yet in local DB, search online via ingestOnlineTracks with exact artist + title
    for (const song of curatedSongs) {
      if (resolvedTracks.length >= targetCount) break;
      const alreadyInList = resolvedTracks.some(
        (t) =>
          t.artistName.toLowerCase().includes(song.artist.toLowerCase()) &&
          t.title.toLowerCase().includes(song.title.toLowerCase())
      );
      if (alreadyInList) continue;

      try {
        const onlineMatches = await ingestOnlineTracks(`${song.artist} ${song.title}`);
        for (const t of onlineMatches) {
          if (!seenTrackIds.has(t.id) && !isNoiseOrJunk(`${t.artistName} ${t.title}`)) {
            const matchesArtist = t.artistName.toLowerCase().includes(song.artist.toLowerCase()) || song.artist.toLowerCase().includes(t.artistName.toLowerCase());
            const matchesTitle = t.title.toLowerCase().includes(song.title.toLowerCase()) || song.title.toLowerCase().includes(t.title.toLowerCase());
            if (matchesArtist || matchesTitle) {
              seenTrackIds.add(t.id);
              resolvedTracks.push(t);
              break;
            }
          }
        }
      } catch {}
    }

    // 3. If exact title wasn't found online, resolve by searching the SAME artist online
    if (resolvedTracks.length < targetCount) {
      for (const song of curatedSongs) {
        if (resolvedTracks.length >= targetCount) break;
        const hasArtistAlready = resolvedTracks.filter((t) => t.artistName.toLowerCase() === song.artist.toLowerCase()).length >= 2;
        if (hasArtistAlready) continue;

        try {
          const onlineArtistMatches = await ingestOnlineTracks(song.artist);
          for (const t of onlineArtistMatches) {
            if (!seenTrackIds.has(t.id) && !isNoiseOrJunk(`${t.artistName} ${t.title}`)) {
              seenTrackIds.add(t.id);
              resolvedTracks.push(t);
              break;
            }
          }
        } catch {}
      }
    }

    // 4. If still need tracks and user provided inspirations, search those inspirations
    if (resolvedTracks.length < targetCount && requestedInspirations.length > 0) {
      for (const insp of requestedInspirations) {
        if (resolvedTracks.length >= targetCount) break;
        try {
          const inspMatches = await ingestOnlineTracks(insp);
          for (const t of inspMatches) {
            if (!seenTrackIds.has(t.id) && !isNoiseOrJunk(`${t.artistName} ${t.title}`)) {
              seenTrackIds.add(t.id);
              resolvedTracks.push(t);
              if (resolvedTracks.length >= targetCount) break;
            }
          }
        } catch {}
      }
    }

    // 5. If still under target and Basque influence is allowed, pull appropriate Basque catalog tracks
    if (resolvedTracks.length < Math.min(8, targetCount) && requestedBasqueInfluence !== "0%") {
      for (const catKey of Object.keys(GROUND_TRUTH_CATALOG)) {
        if (resolvedTracks.length >= targetCount) break;
        for (const item of GROUND_TRUTH_CATALOG[catKey]) {
          if (resolvedTracks.length >= targetCount) break;
          try {
            const dbItem = await db
              .select()
              .from(tracks)
              .where(ilike(tracks.title, `%${item.title}%`))
              .limit(1);
            if (dbItem.length > 0) {
              const t = mapTrack(dbItem[0]);
              if (!seenTrackIds.has(t.id)) {
                seenTrackIds.add(t.id);
                resolvedTracks.push(t);
              }
            }
          } catch {}
        }
      }
    }

    const finalTracks = resolvedTracks.slice(0, targetCount);

    // Save as persistent user playlist in database
    let createdPlaylistId: number | null = null;
    try {
      const cookieStore = await cookies();
      const syncKey = cookieStore.get("sync_key")?.value || "default";

      const [newPl] = await db
        .insert(playlists)
        .values({
          name: title,
          description: `${description} • Created by Gemini AI`,
          syncKey,
          trackCount: finalTracks.length,
          type: "ai_curated",
          coverSeed: title,
        })
        .returning();

      if (newPl && finalTracks.length > 0) {
        createdPlaylistId = newPl.id;
        await db.insert(playlistTracks).values(
          finalTracks.map((t, idx) => ({
            playlistId: newPl.id,
            trackId: t.id,
            position: idx,
          }))
        );
      }
    } catch (saveErr) {
      console.warn("Could not save playlist to database:", saveErr);
    }

    return NextResponse.json({
      playlistId: createdPlaylistId,
      name: title,
      description,
      tracks: finalTracks,
    });
  } catch (err: any) {
    console.error("Failed to generate AI playlist:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate playlist" },
      { status: 500 }
    );
  }
}
