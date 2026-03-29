import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH || "/srv/football-anchor/data/data.db";
const db = new Database(dbPath);

type MatchRow = {
  id: number;
  source_match_key: string;
  match_date: string;
  kickoff_time: string | null;
  league_name: string | null;
  home_team: string | null;
  away_team: string | null;
  match_status: string | null;
  is_open: number;
  required_anchor_count: number | null;
  apply_deadline: string | null;
  priority: string | null;
  admin_note: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type GroupRow = {
  match_date: string;
  kickoff_time: string | null;
  league_name: string | null;
  home_team: string | null;
  away_team: string | null;
  cnt: number;
};

const groups = db.prepare(`
  SELECT match_date, kickoff_time, league_name, home_team, away_team, COUNT(*) AS cnt
  FROM matches
  GROUP BY match_date, kickoff_time, league_name, home_team, away_team
  HAVING COUNT(*) > 1
  ORDER BY match_date ASC, kickoff_time ASC, league_name ASC, home_team ASC, away_team ASC
`).all() as GroupRow[];

const getMatchesInGroup = db.prepare(`
  SELECT *
  FROM matches
  WHERE match_date = ?
    AND COALESCE(kickoff_time, '') = COALESCE(?, '')
    AND COALESCE(league_name, '') = COALESCE(?, '')
    AND COALESCE(home_team, '') = COALESCE(?, '')
    AND COALESCE(away_team, '') = COALESCE(?, '')
  ORDER BY id ASC
`);

const countApps = db.prepare(`SELECT COUNT(*) AS c FROM applications WHERE match_id = ?`);
const countAssignments = db.prepare(`SELECT COUNT(*) AS c FROM assignments WHERE match_id = ?`);
const updateApps = db.prepare(`UPDATE applications SET match_id = ? WHERE match_id = ?`);
const updateAssignments = db.prepare(`UPDATE assignments SET match_id = ? WHERE match_id = ?`);
const deleteApps = db.prepare(`DELETE FROM applications WHERE match_id = ? AND EXISTS (SELECT 1 FROM applications a2 WHERE a2.match_id = ? AND a2.anchor_id = applications.anchor_id)`);
const deleteAssignments = db.prepare(`DELETE FROM assignments WHERE match_id = ? AND EXISTS (SELECT 1 FROM assignments s2 WHERE s2.match_id = ? AND s2.anchor_id = assignments.anchor_id)`);
const deleteMatch = db.prepare(`DELETE FROM matches WHERE id = ?`);
const updateWinner = db.prepare(`
  UPDATE matches
  SET is_open = ?,
      required_anchor_count = ?,
      apply_deadline = ?,
      priority = ?,
      admin_note = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

function score(row: MatchRow) {
  const apps = Number((countApps.get(row.id) as any)?.c || 0);
  const asgs = Number((countAssignments.get(row.id) as any)?.c || 0);
  return [
    asgs > 0 ? 1 : 0,
    apps > 0 ? 1 : 0,
    Number(row.is_open || 0),
    row.admin_note ? 1 : 0,
    row.apply_deadline ? 1 : 0,
    row.priority === "high" ? 1 : 0,
    Number(row.required_anchor_count || 0),
    String(row.updated_at || ""),
    String(row.created_at || ""),
    row.id,
  ];
}

function compareScore(a: MatchRow, b: MatchRow) {
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] === sb[i]) continue;
    return sa[i] > sb[i] ? -1 : 1;
  }
  return 0;
}

let mergedGroups = 0;
let deletedMatches = 0;
let movedApplications = 0;
let movedAssignments = 0;

const tx = db.transaction(() => {
  for (const group of groups) {
    const rows = getMatchesInGroup.all(
      group.match_date,
      group.kickoff_time,
      group.league_name,
      group.home_team,
      group.away_team,
    ) as MatchRow[];

    if (rows.length <= 1) continue;

    const [winner, ...losers] = [...rows].sort(compareScore);
    const mergedIsOpen = rows.some((row) => Number(row.is_open) === 1) ? 1 : 0;
    const mergedRequiredCount = Math.max(...rows.map((row) => Number(row.required_anchor_count || 0)), 1);
    const mergedPriority = rows.some((row) => row.priority === "high") ? "high" : (winner.priority || "normal");
    const mergedApplyDeadline = rows
      .map((row) => row.apply_deadline)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) || null;
    const mergedAdminNote = rows
      .map((row) => String(row.admin_note || "").trim())
      .find(Boolean) || null;

    updateWinner.run(
      mergedIsOpen,
      mergedRequiredCount,
      mergedApplyDeadline,
      mergedPriority,
      mergedAdminNote,
      winner.id,
    );

    for (const loser of losers) {
      deleteApps.run(loser.id, winner.id);
      deleteAssignments.run(loser.id, winner.id);

      const appRes = updateApps.run(winner.id, loser.id);
      const asgRes = updateAssignments.run(winner.id, loser.id);
      movedApplications += Number(appRes.changes || 0);
      movedAssignments += Number(asgRes.changes || 0);

      deleteMatch.run(loser.id);
      deletedMatches += 1;
    }

    mergedGroups += 1;
  }
});

tx();

console.log(JSON.stringify({
  groupsFound: groups.length,
  mergedGroups,
  deletedMatches,
  movedApplications,
  movedAssignments,
}, null, 2));
