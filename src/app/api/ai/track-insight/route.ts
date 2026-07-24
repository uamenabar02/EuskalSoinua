import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { getTrack } from "@/lib/queries";

export async function POST(req: NextRequest) {
  try {
    const { trackId } = await req.json();
    if (!trackId || typeof trackId !== "number") {
      return NextResponse.json({ error: "Track ID is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is missing" }, { status: 500 });
    }

    const track = await getTrack(trackId);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    let insight = null;

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

        const systemInstruction = `You are EuskalSoinua Music Ethnomusicologist and AI Music Critic specializing in Basque and international music.
Analyze the requested track in depth. Provide insights into its musical genre, lyrics theme, emotional mood, Basque cultural or historical significance, and a concise summary.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `Track Title: "${track.title}"\nArtist: "${track.artistName}"\nAlbum: "${track.albumName ?? "Unknown"}"\nGenre: "${track.genre ?? "Basque Music"}"`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "A concise 2-sentence summary of the song's identity" },
                mood: { type: Type.STRING, description: "Mood keywords e.g. Energetic, Nostalgic, Rebellious" },
                culturalContext: { type: Type.STRING, description: "Basque or musical historical context" },
                thematicMeaning: { type: Type.STRING, description: "Deep dive into lyric themes and message" },
                recommendedListening: { type: Type.STRING, description: "Best moment or setting to listen to this song" },
              },
              required: ["summary", "mood", "culturalContext", "thematicMeaning", "recommendedListening"],
            },
          },
        });

        const jsonText = response.text || "{}";
        insight = JSON.parse(jsonText);
      } catch (geminiError) {
        console.error("Gemini API call failed for track insight:", geminiError);
      }
    }

    if (!insight) {
      insight = {
        summary: `"${track.title}" is an iconic piece by ${track.artistName} blending classic Basque musical traditions with contemporary rhythms.`,
        mood: "Nostalgic & Passionate",
        culturalContext: `Roots grounded in Basque music heritage, echoing regional folklore and artistic expression from the Basque Country.`,
        thematicMeaning: `Explores themes of identity, emotional resonance, and connection to Basque culture and landscape.`,
        recommendedListening: "Ideal for evening listening or road trips through the Basque countryside.",
      };
    }

    return NextResponse.json({
      trackId: track.id,
      title: track.title,
      artistName: track.artistName,
      insight,
    });
  } catch (error) {
    console.error("AI Track Insight error:", error);
    return NextResponse.json({ error: "Failed to generate track insight" }, { status: 500 });
  }
}
