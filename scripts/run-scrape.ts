import { scrapeMatches } from "../src/server/scraper.js";

async function main() {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error("Usage: tsx scripts/run-scrape.ts <YYYYMMDD>");
    process.exit(1);
  }

  const result = await scrapeMatches(dateArg);
  console.log(`抓取完成：${JSON.stringify(result)}`);
}

main().catch((err) => {
  console.error("抓取失败", err);
  process.exit(1);
});
