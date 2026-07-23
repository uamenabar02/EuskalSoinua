import { configuredInstances } from "./src/lib/sources/streaming";

async function testBroadSearch() {
  const query = "Rotten XIII Geronimo";
  const { piped } = configuredInstances();

  // Try all piped instances
  for (const base of piped) {
    console.log(`Testing Piped broad search on: ${base}...`);
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as { items?: Array<Record<string, any>> };
        console.log(`  ✅ Success! Found ${data.items?.length ?? 0} items:`);
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
}

testBroadSearch();
