const puppeteer = require("puppeteer");
const BASE = process.argv[2] || "https://3000-ilfmdu5wd2axs2eslq3ut.e2b.app";

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning")
      console.log(`  [${msg.type()}] ${msg.text().substring(0, 120)}`);
  });
  page.on("pageerror", (err) => console.log(`  [PAGE ERROR] ${err.message.substring(0, 150)}`));
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (!u.includes("youtube") && !u.includes("googlevideo"))
      console.log(`  [REQ FAIL] ${u.substring(0, 80)} - ${req.failure()?.errorText}`);
  });

  // Track full page loads via CDP
  let loadCount = 0;
  const client = await page.target().createCDPSession();
  await client.send("Page.enable");
  client.on("Page.frameNavigated", (e) => {
    if (e.frame.parentId === undefined) {
      loadCount++;
      console.log(`  >>> FULL FRAME NAVIGATION #${loadCount} to ${e.frame.url}`);
    }
  });

  console.log("\n=== TEST: YouTube engine (full-track ON) navigation ===");
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("button", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Enable full-track mode
  await page.evaluate(async () => {
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full_track: true }) });
  });
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));

  loadCount = 0; // reset after intentional reload

  console.log("Playing track (YouTube engine)...");
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("button")).find((c) => c.querySelector("div[style*='gradient']"));
    if (card) card.click();
  });
  await new Promise((r) => setTimeout(r, 6000));

  const before = await page.evaluate(() => {
    const ytHost = document.querySelector("[ref]") || document.querySelector("iframe");
    const iframes = document.querySelectorAll("iframe");
    // Check if YT player exists and is playing via the player bar time
    const playerBar = document.querySelector(".tabular-nums");
    return {
      iframes: iframes.length,
      iframeSrc: iframes[0]?.src?.substring(0, 60),
      playerBarText: playerBar?.textContent?.trim(),
      audioHasSrc: !!document.querySelector("audio")?.src,
    };
  });
  console.log("  Before nav:", JSON.stringify(before));

  console.log("\nNavigating to /search...");
  await page.evaluate(() => document.querySelector('a[href="/search"]')?.click());
  await new Promise((r) => setTimeout(r, 4000));

  const after = await page.evaluate(() => {
    const iframes = document.querySelectorAll("iframe");
    return {
      iframes: iframes.length,
      audioHasSrc: !!document.querySelector("audio")?.src,
      url: location.pathname,
    };
  });
  console.log("  After nav:", JSON.stringify(after));
  console.log("  Full frame loads during this test:", loadCount);

  console.log(loadCount === 0 ? "\n✅ NO full reload" : "\n❌ FULL RELOAD DETECTED");
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
