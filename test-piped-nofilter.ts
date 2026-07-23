import { configuredInstances } from "./src/lib/sources/streaming";

async function main() {
  const query = "Rotten XIII Geronimo";
  const { piped, invidious } = configuredInstances();

  for (const inst of piped) {
    console.log(`\nSearching Piped (${inst}) without filter...`);
    try {
      const res = await fetch(`${inst}/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as { items?: Array<Record<string, any>> };
        console.log(`  ✅ Found ${(data.items ?? []).length} results:`);
        for (const item of (data.items ?? []).slice(0, 10)) {
          console.log(`    - title: "${item.title}", uploader: "${item.uploaderName}", url: "${item.url}"`);
        }
        break;
      } else {
        console.log(`  ❌ Status ${res.status}`);
      }
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  for (const inst of invidious) {
    console.log(`\nSearching Invidious (${inst})...`);
    try {
      const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as Array<Record<string, any>>;
        console.log(`  ✅ Found ${(data ?? []).length} results:`);
        for (const item of (data ?? []).slice(0, 10)) {
          console.log(`    - title: "${item.title}", author: "${item.author}", videoId: "${item.videoId}"`);
        }
        break;
      } else {
        console.log(`  ❌ Status ${res.status}`);
      }
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }
}

main();
