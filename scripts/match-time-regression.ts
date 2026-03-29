import assert from "node:assert/strict";
import { compareMatchesBusinessAsc, getMatchBusinessStatus, parseDateTime, parseMatchKickoff } from "../src/lib/matchTime.ts";

const now = parseDateTime("2026-03-16 10:00")!.getTime();

const kickoffOnlyTime = parseMatchKickoff("20260316", "18:30");
assert.equal(kickoffOnlyTime?.toISOString(), "2026-03-16T10:30:00.000Z", "HH:mm should resolve against match_date in Beijing time");

const basketballKickoff = parseMatchKickoff("20260316", "3-17 08:30");
assert.equal(basketballKickoff?.toISOString(), "2026-03-17T00:30:00.000Z", "M-D HH:mm should resolve correctly for跨日篮球时间");

const explicitKickoff = parseMatchKickoff("20260316", "2026-03-18 19:35");
assert.equal(explicitKickoff?.toISOString(), "2026-03-18T11:35:00.000Z", "explicit datetime should parse in Beijing time");

const businessSamples = [
  { label: "可报名", match: { match_date: "20260316", kickoff_time: "18:30", is_open: 1, apply_deadline: "2026-03-16T09:00:00.000Z" } },
  { label: "即将截止", match: { match_date: "20260316", kickoff_time: "11:00", is_open: 1, apply_deadline: "2026-03-16T02:30:00.000Z" } },
  { label: "未开放", match: { match_date: "20260316", kickoff_time: "18:30", is_open: 0, apply_deadline: "2026-03-16T09:00:00.000Z" } },
  { label: "已开赛", match: { match_date: "20260316", kickoff_time: "09:30", is_open: 0 } },
  { label: "已结束", match: { match_date: "20260316", kickoff_time: "18:30", is_open: 0, match_status: "完" } },
] as const;

for (const sample of businessSamples) {
  assert.equal(getMatchBusinessStatus(sample.match, now), sample.label, `business status mismatch: ${sample.label}`);
}

const ordered = [
  { id: 1, match_date: "20260316", kickoff_time: "18:30", is_open: 1, apply_deadline: "2026-03-16T09:00:00.000Z" },
  { id: 2, match_date: "20260316", kickoff_time: "11:00", is_open: 1, apply_deadline: "2026-03-16T02:30:00.000Z" },
  { id: 3, match_date: "20260316", kickoff_time: "19:00", is_open: 0 },
  { id: 4, match_date: "20260316", kickoff_time: "09:00", is_open: 0 },
].sort((a, b) => compareMatchesBusinessAsc(a, b, now));

assert.deepEqual(ordered.map((item) => item.id), [1, 2, 3, 4], "business sort should keep open/upcoming first, then closing, then locked, then ended");

const defaultDeadlineKickoff = parseMatchKickoff("20260316", "18:30")!;
const derivedDeadline = new Date(defaultDeadlineKickoff.getTime() - 30 * 60 * 1000);
assert.equal(derivedDeadline.toISOString(), "2026-03-16T10:00:00.000Z", "default apply deadline should be 30 minutes before kickoff");

console.log(JSON.stringify({ ok: true, checked: [
  "business_status",
  "business_sort",
  "date_parse",
  "basketball_time_parse",
  "default_apply_deadline",
] }, null, 2));
