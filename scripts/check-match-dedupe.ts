import assert from "node:assert/strict";

process.env.DB_PATH = process.env.DB_PATH || "./data/data.db";

const [{ db, setupDb }, scraperModule] = await Promise.all([
  import("../src/server/db.js"),
  import("../src/server/scraper.ts"),
]);

setupDb();

const date = process.argv[2] || "20260316";
const category = (process.argv[3] || "足球") as "足球" | "CBA" | "NBA";
const scrapeByCategory = {
  足球: scraperModule.scrapeMatches,
  CBA: scraperModule.scrapeCba,
  NBA: scraperModule.scrapeNba,
}[category];

const countStmt = db.prepare(`
  SELECT COUNT(*) AS c
  FROM matches
  WHERE match_date = ? AND category = ?
`);

const duplicateStmt = db.prepare(`
  SELECT category, match_date, COALESCE(kickoff_time, '') AS kickoff_time, COALESCE(league_name, '') AS league_name,
         COALESCE(home_team, '') AS home_team, COALESCE(away_team, '') AS away_team, COUNT(*) AS c
  FROM matches
  WHERE match_date = ? AND category = ?
  GROUP BY category, match_date, COALESCE(kickoff_time, ''), COALESCE(league_name, ''), COALESCE(home_team, ''), COALESCE(away_team, '')
  HAVING COUNT(*) > 1
  LIMIT 20
`);

const before = Number((countStmt.get(date, category) as any)?.c || 0);
await scrapeByCategory(date);
const afterOnce = Number((countStmt.get(date, category) as any)?.c || 0);
await scrapeByCategory(date);
const afterTwice = Number((countStmt.get(date, category) as any)?.c || 0);
const duplicates = duplicateStmt.all(date, category) as any[];

assert.equal(duplicates.length, 0, "visible duplicate matches should remain zero after repeated scrape");
assert.equal(afterOnce, afterTwice, "repeated scrape should not increase row count for same date/category");
assert.ok(afterOnce >= before, "scrape should not reduce existing rows before reconcile unless source removed them");

console.log(JSON.stringify({ ok: true, date, category, before, afterOnce, afterTwice, duplicateGroups: duplicates.length }, null, 2));
