import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH || "/srv/football-anchor/data/data.db";
const db = new Database(dbPath);

type Row = {
  id: number;
  match_date: string;
  kickoff_time: string | null;
};

function normalizeMatchDate(dateStr: string, kickoffTime: string) {
  const match = String(kickoffTime || "").match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) return dateStr;

  const sourceYear = Number(dateStr.slice(0, 4));
  const sourceMonth = Number(dateStr.slice(4, 6));
  let year = sourceYear;
  const month = Number(match[1]);
  const day = Number(match[2]);

  if (sourceMonth === 12 && month === 1) year += 1;
  else if (sourceMonth === 1 && month === 12) year -= 1;

  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

const rows = db.prepare(`
  SELECT id, match_date, kickoff_time
  FROM matches
  WHERE kickoff_time GLOB '*-* *:*' AND length(match_date) = 8
`).all() as Row[];

const updateStmt = db.prepare(`UPDATE matches SET match_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
let updated = 0;

const tx = db.transaction(() => {
  for (const row of rows) {
    const normalized = normalizeMatchDate(row.match_date, String(row.kickoff_time || ""));
    if (normalized !== row.match_date) {
      updateStmt.run(normalized, row.id);
      updated += 1;
    }
  }
});

tx();
console.log(JSON.stringify({ scanned: rows.length, updated }, null, 2));
