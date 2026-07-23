import { resolveVideoIdForTrack, searchAudio, configuredInstances } from "./src/lib/sources/streaming";
import dotenv from "dotenv";

dotenv.config();

const songs = [
  { artist: "Zartako-K", title: "Rude Girl" },
  { artist: "Nafarroa 1512", title: "Askatasun Haizea" },
  { artist: "The Lio", title: "Berandu da" },
  { artist: "Rotten XIII", title: "Geronimo" }
];

async function main() {
  console.log("Configured Piped:", configuredInstances().piped);
  console.log("Configured Invidious:", configuredInstances().invidious);

  for (const s of songs) {
    console.log(`\nResolving: "${s.title}" by ${s.artist}...`);
    try {
      const start = Date.now();
      const hit = await resolveVideoIdForTrack({
        artist: s.artist,
        title: s.title,
        region: "eu"
      });
      const end = Date.now();
      if (hit) {
        console.log(`  ✅ Resolved! videoId: ${hit.videoId} ("${hit.title}" by ${hit.author}) in ${end - start}ms`);
      } else {
        console.log(`  ❌ Failed to resolve videoId in ${end - start}ms`);
      }
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }
}

main();
