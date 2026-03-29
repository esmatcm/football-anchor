process.env.DB_PATH = process.env.DB_PATH || "./data/data.db";

const [{ setupDb }, { repairOpsData, getOpsDataIssues }] = await Promise.all([
  import("../src/server/db.js"),
  import("../src/server/opsRepair.ts"),
]);

setupDb();

const repaired = repairOpsData();
const issues = getOpsDataIssues();

console.log(JSON.stringify({
  ok: issues.ok,
  repaired,
  remaining: Object.fromEntries(issues.checks.map((item: any) => [item.name, { count: item.count }])),
}, null, 2));
