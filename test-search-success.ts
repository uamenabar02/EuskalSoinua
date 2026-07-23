import { searchAudio, configuredInstances } from "./src/lib/sources/streaming";

async function main() {
  const query = "Rotten XIII Geronimo";
  console.log(`Searching for: "${query}" using searchAudio...`);
  try {
    const start = Date.now();
    const hits = await searchAudio(query);
    console.log(`Finished in ${Date.now() - start}ms. Found ${hits.length} hits:`);
    for (const h of hits.slice(0, 5)) {
      console.log(`- videoId: ${h.videoId}, title: "${h.title}", author: "${h.author}"`);
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
}

main();
