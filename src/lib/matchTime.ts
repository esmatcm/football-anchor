export type MatchTimeLike = {
  id?: number | string | null;
  match_date?: string | null;
  kickoff_time?: string | null;
  is_open?: number | boolean | null;
  apply_deadline?: string | null;
  match_status?: string | null;
  required_anchor_count?: number | null;
  application_count?: number | null;
  approved_count?: number | null;
  pending_count?: number | null;
  assignment_count?: number | null;
  scheduled_assignment_count?: number | null;
};

export type MatchSortGroup = "open_upcoming" | "closing_or_starting" | "upcoming_locked" | "ended";
export type MatchBusinessStatus = "可报名" | "即将截止" | "未开放" | "已截止" | "已开赛" | "已结束";

const BEIJING_OFFSET_MINUTES = 8 * 60;
const SOON_THRESHOLD_MINUTES = 90;

function buildBeijingDate(year: number, month: number, day: number, hour: number, minute: number) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - BEIJING_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

function getCurrentBeijingYear() {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + BEIJING_OFFSET_MINUTES * 60 * 1000);
  return beijingNow.getUTCFullYear();
}

export function parseMatchKickoff(matchDate?: string | null, kickoffTime?: string | null) {
  const dateRaw = String(matchDate || "").trim();
  const timeRaw = String(kickoffTime || "").trim();

  let m = timeRaw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    return buildBeijingDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  }

  m = timeRaw.match(/^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const baseYear = /^\d{8}$/.test(dateRaw) ? Number(dateRaw.slice(0, 4)) : getCurrentBeijingYear();
    return buildBeijingDate(baseYear, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]));
  }

  m = timeRaw.match(/^(\d{1,2}):(\d{2})$/);
  if (m && /^\d{8}$/.test(dateRaw)) {
    return buildBeijingDate(
      Number(dateRaw.slice(0, 4)),
      Number(dateRaw.slice(4, 6)),
      Number(dateRaw.slice(6, 8)),
      Number(m[1]),
      Number(m[2]),
    );
  }

  return null;
}

export function parseDateTime(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const explicit = new Date(raw);
  if (!Number.isNaN(explicit.getTime()) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    return explicit;
  }

  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    const dt = buildBeijingDate(year, month, day, hour, minute);
    dt.setUTCSeconds(second, 0);
    return dt;
  }

  return Number.isNaN(explicit.getTime()) ? null : explicit;
}

function normalizeMatchStatus(status?: string | null) {
  return String(status || "").trim();
}

export function getMatchTimestamp(match: MatchTimeLike) {
  return parseMatchKickoff(match.match_date, match.kickoff_time)?.getTime() || 0;
}

export function hasMatchStarted(match: MatchTimeLike, now = Date.now()) {
  const ts = getMatchTimestamp(match);
  return ts > 0 && now >= ts;
}

export function isMatchTerminalByStatus(match: Pick<MatchTimeLike, "match_status">) {
  const status = normalizeMatchStatus(match.match_status);
  if (!status) return false;
  return /(完|结束|取消|推迟|延期|腰斩|中断)/.test(status);
}

export function isApplyDeadlinePassed(match: Pick<MatchTimeLike, "apply_deadline">, now = Date.now()) {
  const deadline = parseDateTime(match.apply_deadline);
  return deadline ? now >= deadline.getTime() : false;
}

export function getMinutesUntilKickoff(match: MatchTimeLike, now = Date.now()) {
  const ts = getMatchTimestamp(match);
  if (!ts) return null;
  return Math.floor((ts - now) / 60000);
}

export function getMinutesUntilDeadline(match: Pick<MatchTimeLike, "apply_deadline">, now = Date.now()) {
  const deadline = parseDateTime(match.apply_deadline);
  if (!deadline) return null;
  return Math.floor((deadline.getTime() - now) / 60000);
}

export function isStartingSoon(match: MatchTimeLike, now = Date.now(), thresholdMinutes = SOON_THRESHOLD_MINUTES) {
  const minutes = getMinutesUntilKickoff(match, now);
  return minutes !== null && minutes >= 0 && minutes <= thresholdMinutes;
}

export function isDeadlineSoon(match: MatchTimeLike, now = Date.now(), thresholdMinutes = SOON_THRESHOLD_MINUTES) {
  const minutes = getMinutesUntilDeadline(match, now);
  return minutes !== null && minutes >= 0 && minutes <= thresholdMinutes;
}

export function isMatchApplicationEnded(match: MatchTimeLike, now = Date.now()) {
  return hasMatchStarted(match, now) || isApplyDeadlinePassed(match, now) || isMatchTerminalByStatus(match);
}

export function canApplyToMatch(match: MatchTimeLike, now = Date.now()) {
  return !isMatchApplicationEnded(match, now) && Boolean(match.is_open);
}

export function getMatchBusinessStatus(match: MatchTimeLike, now = Date.now()): MatchBusinessStatus {
  if (isMatchTerminalByStatus(match)) return "已结束";
  if (hasMatchStarted(match, now)) return "已开赛";
  if (isApplyDeadlinePassed(match, now)) return "已截止";
  if (Boolean(match.is_open)) {
    if (isDeadlineSoon(match, now) || isStartingSoon(match, now)) return "即将截止";
    return "可报名";
  }
  return "未开放";
}

export function getMatchSortGroup(match: MatchTimeLike, now = Date.now()): MatchSortGroup {
  const businessStatus = getMatchBusinessStatus(match, now);
  if (businessStatus === "可报名") return "open_upcoming";
  if (businessStatus === "即将截止") return "closing_or_starting";
  if (businessStatus === "未开放") return "upcoming_locked";
  return "ended";
}

function sortGroupRank(group: MatchSortGroup) {
  if (group === "open_upcoming") return 0;
  if (group === "closing_or_starting") return 1;
  if (group === "upcoming_locked") return 2;
  return 3;
}

export function compareMatchesBusinessAsc(a: MatchTimeLike, b: MatchTimeLike, now = Date.now()) {
  const groupDiff = sortGroupRank(getMatchSortGroup(a, now)) - sortGroupRank(getMatchSortGroup(b, now));
  if (groupDiff !== 0) return groupDiff;

  const diff = getMatchTimestamp(a) - getMatchTimestamp(b);
  if (diff !== 0) return diff;

  const openDiff = Number(Boolean(b.is_open)) - Number(Boolean(a.is_open));
  if (openDiff !== 0) return openDiff;

  const idA = Number(a.id || 0);
  const idB = Number(b.id || 0);
  return idA - idB;
}

export function compareMatchesBusinessDesc(a: MatchTimeLike, b: MatchTimeLike, now = Date.now()) {
  const groupDiff = sortGroupRank(getMatchSortGroup(a, now)) - sortGroupRank(getMatchSortGroup(b, now));
  if (groupDiff !== 0) return groupDiff;

  const diff = getMatchTimestamp(b) - getMatchTimestamp(a);
  if (diff !== 0) return diff;

  const openDiff = Number(Boolean(b.is_open)) - Number(Boolean(a.is_open));
  if (openDiff !== 0) return openDiff;

  const idA = Number(a.id || 0);
  const idB = Number(b.id || 0);
  return idA - idB;
}

export function compareMatchesAsc(a: MatchTimeLike, b: MatchTimeLike) {
  return compareMatchesBusinessAsc(a, b);
}

export function compareMatchesDesc(a: MatchTimeLike, b: MatchTimeLike) {
  return compareMatchesBusinessDesc(a, b);
}

export function getMatchAnomalies(match: MatchTimeLike, now = Date.now()) {
  const issues: string[] = [];
  const started = hasMatchStarted(match, now);
  const ended = isMatchTerminalByStatus(match);
  const deadline = parseDateTime(match.apply_deadline);
  const kickoff = parseMatchKickoff(match.match_date, match.kickoff_time);
  const required = Math.max(1, Number(match.required_anchor_count || 1));
  const assigned = Number(match.assignment_count ?? match.scheduled_assignment_count ?? 0);

  if (started && Boolean(match.is_open)) issues.push("已开赛但仍开放");
  if (!ended && Boolean(match.is_open) && !match.apply_deadline) issues.push("开放但缺截止时间");
  if (!kickoff) issues.push("开赛时间异常");
  if (deadline && kickoff && deadline.getTime() > kickoff.getTime()) issues.push("截止晚于开赛");
  if (assigned > required) issues.push("排班人数超额");

  return issues;
}

export function formatApplyDeadline(value?: string | null, locale = 'zh-CN', timeZone = 'Asia/Shanghai') {
  if (!value) return '无截止';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
}
