const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  
  page.on("console", (msg) => {
    console.log(`[CONSOLE] ${msg.text()}`);
  });
  
  page.on("pageerror", (err) => {
    console.error(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto("http://localhost:3000/settings", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  
  const values = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("section")).map(sec => {
      const title = sec.querySelector("h2")?.textContent?.trim() || "";
      const items = Array.from(sec.querySelectorAll(".flex, button")).map(el => {
        const text = el.textContent?.trim() || "";
        return text.replace(/\s+/g, " ");
      });
      return { title, items };
    });
    return rows;
  });

  console.log("DOM content of Groups:", JSON.stringify(values, null, 2));
  
  await browser.close();
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
