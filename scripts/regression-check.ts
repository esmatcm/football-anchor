process.env.DB_PATH = process.env.DB_PATH || "./data/data.db";

const [{ db, setupDb }, { parseDateTime, parseMatchKickoff }] = await Promise.all([
  import("../src/server/db.js"),
  import("../src/lib/matchTime.ts"),
]);

setupDb();

type CheckResult = {
  name: string;
  count: number;
  sample?: any[];
};

const openMatches = db.prepare(`
  SELECT id, match_date, kickoff_time, league_name, home_team, away_team, apply_deadline
  FROM matches
  WHERE is_open = 1
  ORDER BY match_date ASC, kickoff_time ASC, id ASC
`).all() as any[];

const openWithoutDeadline = openMatches.filter((row) => !String(row.apply_deadline || "").trim());
const deadlineAfterKickoff = openMatches.filter((row) => {
  const kickoff = parseMatchKickoff(row.match_date, row.kickoff_time);
  const deadline = parseDateTime(row.apply_deadline);
  return Boolean(kickoff && deadline && deadline.getTime() > kickoff.getTime());
});

const approvedWithoutAssignment = db.prepare(`
  SELECT ap.id, ap.match_id, ap.anchor_id
  FROM applications ap
  LEFT JOIN assignments a ON a.match_id = ap.match_id AND a.anchor_id = ap.anchor_id
  WHERE ap.status = 'approved' AND a.id IS NULL
  LIMIT 20
`).all() as any[];

const assignmentWithoutApproved = db.prepare(`
  SELECT a.id, a.match_id, a.anchor_id
  FROM assignments a
  LEFT JOIN applications ap ON ap.match_id = a.match_id AND ap.anchor_id = a.anchor_id AND ap.status = 'approved'
  WHERE ap.id IS NULL
  LIMIT 20
`).all() as any[];

const checks: CheckResult[] = [
  { name: "open_without_deadline", count: openWithoutDeadline.length, sample: openWithoutDeadline.slice(0, 10) },
  { name: "deadline_after_kickoff", count: deadlineAfterKickoff.length, sample: deadlineAfterKickoff.slice(0, 10) },
  { name: "approved_without_assignment", count: approvedWithoutAssignment.length, sample: approvedWithoutAssignment.slice(0, 10) },
  { name: "assignment_without_approved", count: assignmentWithoutApproved.length, sample: assignmentWithoutApproved.slice(0, 10) },
];

const failed = checks.filter((item) => item.count > 0);
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
if (failed.length > 0) process.exit(1);
