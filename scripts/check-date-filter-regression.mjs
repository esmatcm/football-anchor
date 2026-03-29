import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || '/srv/football-anchor/data/data.db';
const db = new Database(dbPath, { readonly: true });

function embeddedYmd(matchDate, kickoffTime) {
  const raw = String(kickoffTime || '').trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}$/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = raw.match(/^(\d{1,2})-(\d{1,2})\s+\d{1,2}:\d{2}$/);
  if (m && /^\d{8}$/.test(matchDate)) {
    return `${matchDate.slice(0,4)}${String(Number(m[1])).padStart(2,'0')}${String(Number(m[2])).padStart(2,'0')}`;
  }
  return matchDate;
}

function checkDate(date) {
  const rows = db.prepare(`SELECT id, match_date, kickoff_time, league_name, home_team, away_team FROM matches WHERE match_date = ? ORDER BY kickoff_time ASC, id ASC`).all(date);
  const wrong = rows.filter((row) => embeddedYmd(row.match_date, row.kickoff_time) !== date);
  return { date, total: rows.length, wrong };
}

const dates = process.argv.slice(2);
if (dates.length === 0) {
  console.error('Usage: node scripts/check-date-filter-regression.mjs 20260316 20260317');
  process.exit(1);
}

const results = dates.map(checkDate);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.wrong.length > 0)) process.exit(2);
