import { searchAudio, resolveVideoIdForTrack } from "./src/lib/sources/streaming";

async function main() {
  const query = "Rotten XIII Geronimo";
  console.log(`Searching for: ${query}...`);
  const hits = await searchAudio(query);
  console.log(`Found ${hits.length} hits:`);
  for (const h of hits) {
    console.log(`- videoId: ${h.videoId}, title: "${h.title}", author: "${h.author}", duration: ${h.duration}`);
  }
}

main();
