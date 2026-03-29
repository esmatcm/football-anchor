import { formatApplyDeadline, getMatchAnomalies, getMatchBusinessStatus, getMinutesUntilKickoff, type MatchTimeLike } from "./matchTime";

export function getBusinessStatusChipClass(status: string) {
  if (status === "可报名") return "chip-open";
  if (status === "即将截止") return "chip-warning";
  if (status === "未开放") return "chip-neutral";
  if (status === "已开赛") return "chip-danger";
  return "chip-closed";
}

export function getAssignmentStatusChipClass(status: string, incidentFlag?: number | boolean | null) {
  if (incidentFlag) return "bg-red-100 text-red-700 border-red-200";
  if (status === "completed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "scheduled") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "cancelled") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-stone-100 text-stone-600 border-stone-200";
}

export function getCoverageTone(requiredCount?: number | null, filledCount?: number | null) {
  const required = Math.max(1, Number(requiredCount || 1));
  const filled = Number(filledCount || 0);
  if (filled >= required) return "text-emerald-700";
  if (filled > 0) return "text-amber-700";
  return "text-red-600";
}

export function getCoverageLabel(requiredCount?: number | null, filledCount?: number | null, pendingCount?: number | null) {
  const required = Math.max(1, Number(requiredCount || 1));
  const filled = Number(filledCount || 0);
  const pending = Number(pendingCount || 0);

  if (filled >= required) {
    return `已排满 ${filled}/${required}${pending > 0 ? `，待审 ${pending}` : ""}`;
  }
  if (filled > 0) {
    return `已排 ${filled}/${required}${pending > 0 ? `，待审 ${pending}` : ""}`;
  }
  if (pending > 0) {
    return `缺主播（待审 ${pending}）`;
  }
  return `缺主播（0/${required}）`;
}

export function getKickoffAlertLabel(match: MatchTimeLike, now = Date.now()) {
  const minutes = getMinutesUntilKickoff(match, now);
  if (minutes === null) return "开赛时间异常";
  const fmt = (m: number) => m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
  if (minutes < 0) return `已开赛 ${fmt(Math.abs(minutes))}`;
  if (minutes <= 30) return `${fmt(minutes)}后开赛`;
  if (minutes <= 90) return `${fmt(minutes)}后截止/开赛`;
  return `开赛前 ${fmt(minutes)}`;
}

export function getAdminMatchSignals(match: MatchTimeLike & {
  approved_count?: number | null;
  approved_application_count?: number | null;
  pending_count?: number | null;
  pending_application_count?: number | null;
  assignment_count?: number | null;
  total_assignment_count?: number | null;
  scheduled_assignment_count?: number | null;
  completed_assignment_count?: number | null;
  required_anchor_count?: number | null;
}) {
  const businessStatus = getMatchBusinessStatus(match);
  const anomalies = getMatchAnomalies(match);
  const required = Math.max(1, Number(match.required_anchor_count || 1));
  const approved = Number(match.approved_application_count ?? match.approved_count ?? 0);
  const pending = Number(match.pending_application_count ?? match.pending_count ?? 0);
  const assigned = Number(match.scheduled_assignment_count ?? match.assignment_count ?? match.total_assignment_count ?? approved ?? 0);
  const coverageLabel = getCoverageLabel(required, assigned, pending);
  const coverageTone = getCoverageTone(required, assigned);
  const kickoffAlert = getKickoffAlertLabel(match);
  const deadlineLabel = formatApplyDeadline(match.apply_deadline);

  return {
    businessStatus,
    businessStatusClass: getBusinessStatusChipClass(businessStatus),
    anomalies,
    hasAnomaly: anomalies.length > 0,
    required,
    approved,
    pending,
    assigned,
    coverageLabel,
    coverageTone,
    kickoffAlert,
    deadlineLabel,
  };
}
