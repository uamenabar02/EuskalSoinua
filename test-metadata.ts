async function main() {
  const query = "Rotten XIII Geronimo";
  console.log(`Searching iTunes for "${query}"...`);
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`);
    const data = await res.json() as any;
    console.log(`iTunes results (${data.results?.length ?? 0}):`);
    for (const r of data.results ?? []) {
      console.log(`- title: "${r.trackName}", artist: "${r.artistName}", album: "${r.collectionName}", previewUrl: "${r.previewUrl}"`);
    }
  } catch (e: any) {
    console.log(`iTunes error: ${e.message}`);
  }

  console.log(`\nSearching Deezer for "${query}"...`);
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json() as any;
    console.log(`Deezer results (${data.data?.length ?? 0}):`);
    for (const r of data.data ?? []) {
      console.log(`- title: "${r.title}", artist: "${r.artist?.name}", album: "${r.album?.title}", preview: "${r.preview}"`);
    }
  } catch (e: any) {
    console.log(`Deezer error: ${e.message}`);
  }
}

main();
