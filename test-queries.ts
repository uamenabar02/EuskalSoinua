import { searchAudio } from "./src/lib/sources/streaming";

async function main() {
  const queries = [
    "Rotten XIII - Gerónimo",
    "Gerónimo Rotten XIII",
    "Rotten XIII Gerónimo audio",
    "Rotten XIII Geronimo audio",
    "Rotten XIII Aurrera Gerónimo"
  ];

  for (const q of queries) {
    console.log(`\nSearching for "${q}"...`);
    const hits = await searchAudio(q);
    console.log(`Found ${hits.length} hits:`);
    for (const h of hits.slice(0, 8)) {
      console.log(`- videoId: ${h.videoId}, title: "${h.title}", author: "${h.author}"`);
    }
  }
}

main();
