import { useEffect, useMemo, useState } from "react";
import DateQuickPicker from "../../components/DateQuickPicker";
import api from "../../lib/api";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { getAdminMatchSignals } from "../../lib/adminMatchUi";
import { parseMatchKickoff } from "../../lib/matchTime";
import { MetricCard } from "../../components/opsUi";

type Row = {
  id: number;
  match_date?: string;
  kickoff_time: string;
  league_name: string;
  home_team: string;
  away_team: string;
  is_open?: number;
  apply_deadline?: string;
  match_status?: string;
  approved_count?: number;
  approved_application_count?: number;
  approved_anchors?: string;
  pending_count?: number;
  pending_application_count?: number;
  assignment_count?: number;
  total_assignment_count?: number;
  scheduled_assignment_count?: number;
  required_anchor_count?: number;
};

function parseKickoff(kickoff: string, dateYmd: string) {
  return parseMatchKickoff(dateYmd, kickoff);
}

function statusByKickoff(kickoff: string, dateYmd: string) {
  if (/推迟|取消/.test(kickoff || "")) return { label: "状态异常", cls: "chip-danger" };
  const dt = parseKickoff(kickoff, dateYmd);
  if (!dt) return { label: "未判定", cls: "chip-neutral" };

  const now = new Date();
  const diff = Math.floor((dt.getTime() - now.getTime()) / 60000);

  if (diff > 30) return { label: "未开始", cls: "chip-neutral" };
  if (diff >= 0) return { label: `${diff}分钟后开赛`, cls: "chip-warning" };
  if (diff > -120) return { label: `进行中 ${Math.abs(diff)}分钟`, cls: "chip-open" };
  return { label: "已过预计结束", cls: "chip-approved" };
}

function kickoffSortValue(kickoff: string, dateYmd: string) {
  const dt = parseKickoff(kickoff, dateYmd);
  if (!dt) return Number.MAX_SAFE_INTEGER;
  return dt.getTime();
}

function getCoverageBlockTone(required: number, approved: number, pending: number) {
  if (approved >= required) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (approved > 0 || pending > 0) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function getScheduledCount(item: Row) {
  return Number(item.scheduled_assignment_count ?? item.assignment_count ?? item.total_assignment_count ?? item.approved_application_count ?? item.approved_count ?? 0);
}

function getPendingCount(item: Row) {
  return Number(item.pending_application_count ?? item.pending_count ?? 0);
}

export default function DayTimeline() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [rows, setRows] = useState<Row[]>([]);
  const [showUnfilledOnly, setShowUnfilledOnly] = useState(false);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/applications/day-overview?date=${date}`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [date]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    return [...rows]
      .filter((item) => (showUnfilledOnly ? getScheduledCount(item) === 0 : true))
      .filter((item) => {
        if (!showUrgentOnly) return true;
        const dt = parseKickoff(item.kickoff_time, date);
        if (!dt) return false;
        const diff = Math.floor((dt.getTime() - now) / 60000);
        return diff >= 0 && diff <= 90;
      })
      .sort((a, b) => kickoffSortValue(a.kickoff_time, date) - kickoffSortValue(b.kickoff_time, date));
  }, [rows, showUnfilledOnly, showUrgentOnly, date]);

  const countdownStats = useMemo(() => {
    const now = new Date();
    const urgentUnfilled = filteredRows.filter((item) => {
      const dt = parseKickoff(item.kickoff_time, date);
      if (!dt) return false;
      const diff = Math.floor((dt.getTime() - now.getTime()) / 60000);
      return diff >= 0 && diff <= 30 && getScheduledCount(item) === 0;
    }).length;

    const urgentWindow = rows.filter((item) => {
      const dt = parseKickoff(item.kickoff_time, date);
      if (!dt) return false;
      const diff = Math.floor((dt.getTime() - now.getTime()) / 60000);
      return diff >= 0 && diff <= 90;
    }).length;

    const nextKickoff = rows
      .map((item) => parseKickoff(item.kickoff_time, date))
      .filter((d): d is Date => !!d && d.getTime() >= now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const nextDiff = nextKickoff ? Math.max(0, Math.floor((nextKickoff.getTime() - now.getTime()) / 60000)) : null;
    return { urgentUnfilled, urgentWindow, nextDiff };
  }, [filteredRows, rows, date]);

  const coverageStats = useMemo(() => {
    const total = rows.length;
    const filled = rows.filter((item) => getScheduledCount(item) > 0).length;
    const pendingOnly = rows.filter((item) => getScheduledCount(item) === 0 && getPendingCount(item) > 0).length;
    const anomalies = rows.filter((item) => getAdminMatchSignals(item).hasAnomaly).length;
    return { total, filled, pendingOnly, anomalies, unfilled: total - filled };
  }, [rows]);

  const activeFilterCount = Number(showUnfilledOnly) + Number(showUrgentOnly);

  return (
    <div className="space-y-4 motion-rise md:space-y-6">
      <section className="surface-block-summary p-3 space-y-3 md:p-5 md:space-y-4">
        <div className="flex flex-col gap-2.5 md:hidden">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-amber-700">日内执行节奏</div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold leading-6 text-stone-900">当日开放赛程</h2>
                <p className="mt-1 text-[13px] leading-5 text-stone-600">先看最近开赛，再看缺口和异常。</p>
              </div>
              <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-600">{filteredRows.length} 场</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="surface-block-primary px-3 py-2.5">
              <div className="text-[10px] text-amber-700">主信息</div>
              <div className="mt-1 text-base font-semibold text-stone-900">下一场 {countdownStats.nextDiff === null ? "--" : `${countdownStats.nextDiff} 分钟`}</div>
              <div className="mt-0.5 text-[11px] leading-4 text-stone-600">先判断当天节奏是否逼近开赛。</div>
            </div>
            <div className="surface-block-risk px-3 py-2.5">
              <div className="text-[10px] text-red-600">风险区</div>
              <div className="mt-1 text-base font-semibold text-red-900">30 分钟内缺口 {countdownStats.urgentUnfilled}</div>
              <div className="mt-0.5 text-[11px] leading-4 text-red-700">临近开赛且无人接单要先处理。</div>
            </div>
            <MetricCard label="已接 / 总场次" value={`${coverageStats.filled}/${coverageStats.total}`} tone={coverageStats.filled > 0 ? "success" : "neutral"} />
            <MetricCard label="异常场次" value={coverageStats.anomalies} tone={coverageStats.anomalies > 0 ? "danger" : "neutral"} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 w-full xl:w-auto">
            <DateQuickPicker value={date} onChange={setDate} label="日期" />
          </div>
          <div className="grid grid-cols-2 gap-2 xl:flex xl:flex-wrap">
            <button
              type="button"
              onClick={() => setShowUnfilledOnly((v) => !v)}
              className={`rounded-2xl border px-3 py-2.5 text-left text-[13px] font-medium leading-5 transition md:px-4 md:py-3 md:text-sm ${showUnfilledOnly ? "border-red-600 bg-red-600 text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              <div className="text-[10px] opacity-80 md:text-xs">筛选</div>
              <div className="mt-0.5">无人报班</div>
            </button>
            <button
              type="button"
              onClick={() => setShowUrgentOnly((v) => !v)}
              className={`rounded-2xl border px-3 py-2.5 text-left text-[13px] font-medium leading-5 transition md:px-4 md:py-3 md:text-sm ${showUrgentOnly ? "border-amber-500 bg-amber-500 text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              <div className="text-[10px] opacity-80 md:text-xs">筛选</div>
              <div className="mt-0.5">90 分钟内</div>
            </button>
          </div>
        </div>

        <div className="grid gap-2 text-sm md:gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 md:px-3.5 md:py-3">
            <div className="text-[10px] text-stone-500 md:text-[11px]">当前列表</div>
            <div className="mt-0.5 text-base font-semibold text-stone-900 md:mt-1 md:text-lg">{filteredRows.length} 场</div>
            <div className="mt-0.5 text-[11px] leading-4 text-stone-500 md:mt-1 md:text-xs">{activeFilterCount > 0 ? `已启用 ${activeFilterCount} 个筛选` : "当前未筛选"}</div>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 md:px-3.5 md:py-3">
            <div className="text-[10px] text-red-600 md:text-[11px]">需优先补位</div>
            <div className="mt-0.5 text-base font-semibold text-red-900 md:mt-1 md:text-lg">{countdownStats.urgentUnfilled} 场</div>
            <div className="mt-0.5 text-[11px] leading-4 text-red-700 md:mt-1 md:text-xs">30 分钟内开赛且无人报班</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 md:px-3.5 md:py-3">
            <div className="text-[10px] text-amber-700 md:text-[11px]">临近开赛</div>
            <div className="mt-0.5 text-base font-semibold text-amber-950 md:mt-1 md:text-lg">{countdownStats.urgentWindow} 场</div>
            <div className="mt-0.5 text-[11px] leading-4 text-amber-800 md:mt-1 md:text-xs">未来 90 分钟窗口</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 md:px-3.5 md:py-3">
            <div className="text-[10px] text-sky-700 md:text-[11px]">未覆盖</div>
            <div className="mt-0.5 text-base font-semibold text-sky-950 md:mt-1 md:text-lg">{coverageStats.unfilled} 场</div>
            <div className="mt-0.5 text-[11px] leading-4 text-sky-800 md:mt-1 md:text-xs">今天仍需继续排班的场次</div>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {loading ? (
          <div className="app-card p-4"><div className="skeleton h-20" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="state-empty">当天暂无赛程</div>
        ) : (
          filteredRows.map((item) => {
            const status = statusByKickoff(item.kickoff_time, date);
            const signals = getAdminMatchSignals(item);
            const required = Math.max(1, Number(item.required_anchor_count || 1));
            const approved = getScheduledCount(item);
            const pending = getPendingCount(item);
            const shortage = Math.max(0, required - approved);
            const hasApproved = approved > 0;
            const dt = parseKickoff(item.kickoff_time, date);
            const diff = dt ? Math.floor((dt.getTime() - Date.now()) / 60000) : null;
            const urgent = diff !== null && diff >= 0 && diff <= 30 && approved === 0;
            const warning = diff !== null && diff >= 0 && diff <= 90;
            const coverageBlockTone = getCoverageBlockTone(required, approved, pending);
            return (
              <article
                key={item.id}
                className={[
                  "app-card overflow-hidden p-3.5 last:mb-24 md:p-5 md:last:mb-0",
                  urgent || signals.hasAnomaly
                    ? "border-red-300 ring-1 ring-red-200 bg-red-50/35 md:bg-white"
                    : shortage > 0 || pending > 0
                      ? "border-amber-200 bg-amber-50/25 md:bg-white"
                      : "bg-white",
                ].join(" ")}
              >
                <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2.5 md:space-y-3">
                    <div className="flex flex-wrap items-start gap-2 md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500 md:gap-2 md:text-xs">
                          <span>{item.match_date}</span>
                          <span>·</span>
                          <span className="break-words">{item.league_name}</span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1.5 md:mt-2 md:gap-2">
                          <div className={`text-[26px] font-semibold leading-none tracking-tight md:text-2xl ${urgent ? "text-red-700" : warning ? "text-amber-700" : "text-stone-900"}`}>{item.kickoff_time || "--"}</div>
                          <div className="text-[11px] text-stone-500">开赛</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 md:gap-2 md:justify-end">
                        <span className={`chip ${signals.businessStatusClass}`}>{signals.businessStatus}</span>
                        <span className={`chip ${status.cls}`}>{status.label}</span>
                        {signals.hasAnomaly ? <span className="chip chip-danger">异常 {signals.anomalies.length}</span> : null}
                      </div>
                    </div>

                    <div>
                      <div className="text-[15px] font-semibold leading-6 text-stone-900 break-words md:text-lg">
                        {item.home_team} <span className="text-stone-400">vs</span> {item.away_team}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] md:mt-2 md:gap-2 md:text-xs">
                        <span className={`chip ${shortage > 0 ? "chip-danger" : "chip-approved"}`}>{shortage > 0 ? `缺 ${shortage} 人` : "已排满"}</span>
                        <span className={`chip ${pending > 0 ? "chip-warning" : "chip-neutral"}`}>{pending > 0 ? `待审 ${pending}` : "待审 0"}</span>
                        <span className="chip chip-neutral">需求 {required}</span>
                        {hasApproved ? <span className="chip chip-open">已排 {approved}</span> : <span className="chip chip-neutral">已排 0</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`mt-3 rounded-2xl border px-3 py-2.5 md:hidden ${urgent ? "border-red-200 bg-red-50/85" : shortage > 0 ? "border-amber-200 bg-amber-50/80" : hasApproved ? "border-emerald-200 bg-emerald-50/80" : "border-stone-200 bg-stone-50/85"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] text-stone-500">首屏重点</div>
                      <div className={`mt-1 text-[13px] font-semibold leading-5 ${urgent ? "text-red-900" : shortage > 0 ? "text-amber-950" : hasApproved ? "text-emerald-900" : "text-stone-900"}`}>
                        {urgent ? "优先补位" : shortage > 0 ? `还缺 ${shortage} 人` : hasApproved ? "已排满，可看详情" : "当前无人报班"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-stone-500">已排 / 待审</div>
                      <div className="mt-1 text-[13px] font-semibold text-stone-900">{approved}/{required} · {pending}</div>
                    </div>
                  </div>
                  <div className={`mt-1.5 text-[11px] leading-4 ${urgent ? "text-red-700" : warning || shortage > 0 ? "text-amber-800" : hasApproved ? "text-emerald-700" : "text-stone-600"}`}>
                    {urgent ? "30 分钟内开赛且无人报班，先补主播。" : shortage > 0 ? `还差 ${shortage} 人，展开再看待审与截止。` : hasApproved ? "首屏只保留结论，补充信息收进下方折叠。" : signals.kickoffAlert}
                  </div>
                </div>

                <div className="mt-3 hidden gap-2 sm:grid-cols-2 xl:grid-cols-4 md:mt-4 md:grid md:gap-2.5">
                  <div className={`rounded-2xl border px-3 py-2.5 md:px-3.5 md:py-3 ${coverageBlockTone}`}>
                    <div className="text-[10px] opacity-70 md:text-[11px]">排班覆盖</div>
                    <div className="mt-0.5 text-base font-semibold md:mt-1 md:text-lg">{approved}/{required}</div>
                    <div className="mt-0.5 text-[11px] leading-4 opacity-80 md:mt-1 md:text-xs">{shortage > 0 ? `还缺 ${shortage} 人` : "当前已满足排班需求"}</div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 md:px-3.5 md:py-3">
                    <div className="text-[10px] text-stone-500 md:text-[11px]">报名截止</div>
                    <div className="mt-0.5 text-[13px] font-semibold leading-5 text-stone-900 md:mt-1 md:text-sm">{signals.deadlineLabel}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-stone-600 md:mt-1 md:text-xs">截止和开赛信息分开看。</div>
                  </div>
                  <div className={`rounded-2xl border px-3 py-2.5 md:px-3.5 md:py-3 ${urgent ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}>
                    <div className={`text-[10px] md:text-[11px] ${urgent ? "text-red-600" : warning ? "text-amber-700" : "text-stone-500"}`}>临场提醒</div>
                    <div className={`mt-0.5 text-[13px] font-semibold leading-5 md:mt-1 md:text-sm ${urgent ? "text-red-900" : warning ? "text-amber-950" : "text-stone-900"}`}>{signals.kickoffAlert}</div>
                    <div className={`mt-0.5 text-[11px] leading-4 md:mt-1 md:text-xs ${urgent ? "text-red-700" : warning ? "text-amber-800" : "text-stone-600"}`}>{urgent ? "已经非常近，优先补主播。" : warning ? "进入临近开赛窗口。" : "暂不属于紧急场次。"}</div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 md:px-3.5 md:py-3">
                    <div className="text-[10px] text-stone-500 md:text-[11px]">待审转化</div>
                    <div className="mt-0.5 text-[13px] font-semibold leading-5 text-stone-900 md:mt-1 md:text-sm">{pending > 0 ? `${pending} 条申请` : "暂无待审"}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-stone-600 md:mt-1 md:text-xs">{pending > 0 ? "可优先从待审里补位。" : "需要继续拉新或直接安排。"}</div>
                  </div>
                </div>

                <div className="mt-3 space-y-2 md:hidden">
                  <details className="rounded-2xl border border-stone-200 bg-stone-50/90 px-3 py-2.5 open:border-stone-300 open:bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
                      <span>{hasApproved ? "安排与截止" : pending > 0 ? "待审与截止" : "补位信息"}</span>
                      <span className="text-[11px] text-stone-500">展开细节</span>
                    </summary>
                    <div className="mt-2 space-y-2 border-t border-stone-200/80 pt-2.5">
                      <div className={`rounded-2xl border px-3 py-2.5 ${hasApproved ? "border-emerald-200 bg-emerald-50/70" : pending > 0 ? "border-amber-200 bg-amber-50/70" : "border-red-200 bg-red-50/70"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] text-stone-500">主播安排</div>
                            <div className={`mt-1 text-[13px] font-semibold leading-5 ${hasApproved ? "text-emerald-900" : pending > 0 ? "text-amber-900" : "text-red-800"}`}>
                              {hasApproved ? "已有人接" : pending > 0 ? "待审核转化" : "当前无人报班"}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-stone-600">待审 {pending}</div>
                        </div>
                        <div className={`mt-1 text-[12px] leading-5 ${hasApproved ? "text-emerald-800" : pending > 0 ? "text-amber-800" : "text-red-700"}`}>
                          {hasApproved
                            ? `${item.approved_anchors || "已有主播"}`
                            : pending > 0
                              ? `当前无人正式排班，但有 ${pending} 条待审核申请可转化。`
                              : "当前无人报班，需尽快补人。"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-600">
                        <div className="flex items-center justify-between gap-3">
                          <span>报名截止</span>
                          <span className="text-right font-semibold text-stone-900">{signals.deadlineLabel}</span>
                        </div>
                      </div>
                      {signals.hasAnomaly ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50/75 px-3 py-2.5 text-[11px] leading-4 text-red-700 space-y-1.5">
                          <div className="font-medium">异常提醒</div>
                          {signals.anomalies.map((issue) => <div key={issue}>⚠ {issue}</div>)}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>

                {signals.hasAnomaly ? (
                  <div className="mt-3 hidden rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-4 text-red-700 space-y-1.5 md:mt-4 md:block md:px-3.5 md:py-3 md:text-xs">
                    <div className="font-medium">异常提醒</div>
                    {signals.anomalies.map((issue) => <div key={issue}>⚠ {issue}</div>)}
                  </div>
                ) : null}

                <div className={`mt-3 hidden rounded-2xl border px-3 py-2.5 md:mt-4 md:block md:px-3.5 md:py-3 ${hasApproved ? "border-emerald-200 bg-emerald-50/70" : pending > 0 ? "border-amber-200 bg-amber-50/70" : "border-red-200 bg-red-50/70"}`}>
                  <div className="text-[10px] text-stone-500 md:text-[11px]">主播安排</div>
                  <div className={`mt-0.5 text-[13px] font-semibold leading-5 md:mt-1 md:text-sm ${hasApproved ? "text-emerald-900" : pending > 0 ? "text-amber-900" : "text-red-800"}`}>
                    {hasApproved ? "已有人接" : pending > 0 ? "待审核转化" : "当前无人报班"}
                  </div>
                  <div className={`mt-0.5 text-[13px] leading-5 md:mt-1 md:text-sm ${hasApproved ? "text-emerald-800" : pending > 0 ? "text-amber-800" : "text-red-700"}`}>
                    {hasApproved
                      ? `${item.approved_anchors || "已有主播"}`
                      : pending > 0
                        ? `当前无人正式排班，但有 ${pending} 条待审核申请可转化。`
                        : "当前无人报班，需尽快补人。"}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
