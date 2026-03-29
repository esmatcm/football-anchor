import { getBusinessStatusChipClass } from "./adminMatchUi";
import { canApplyToMatch, getMatchBusinessStatus, getMatchSortGroup, getMinutesUntilKickoff, isApplyDeadlinePassed } from "./matchTime";

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  approved: "已通过",
  pending: "待审核",
  rejected: "已拒绝",
  waitlist: "候补",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  scheduled: "待执行",
  cancelled: "已取消",
};

export function getApplicationTone(status?: string) {
  if (status === "approved") return "chip-approved";
  if (status === "rejected") return "chip-rejected";
  if (status === "pending" || status === "waitlist") return "chip-pending";
  return "chip-neutral";
}

export function getRecruitmentStatus(match: any) {
  const businessStatus = getMatchBusinessStatus(match);
  if (businessStatus === "可报名") return "现在可报名";
  if (businessStatus === "即将截止") return "即将截止";
  return businessStatus;
}

export function getRecruitmentTone(match: any) {
  return getBusinessStatusChipClass(getMatchBusinessStatus(match));
}

export function getAvailabilityLabel(match: any, canApply = canApplyToMatch(match), isPastDeadline = isApplyDeadlinePassed(match)) {
  if (canApply) return "当前可报名";
  if (getMatchSortGroup(match) === "upcoming_locked") return "暂未开放";
  if (isPastDeadline) return "已截止";
  return "已结束";
}

export function getKickoffHint(match: any) {
  const minutes = getMinutesUntilKickoff(match);
  if (minutes === null) return "开赛时间待确认";
  if (minutes < 0) return `已开赛 ${Math.abs(minutes)} 分钟`;
  if (minutes <= 90) return `${minutes} 分钟内开赛 / 截止`;
  return `${minutes} 分钟后开赛`;
}
