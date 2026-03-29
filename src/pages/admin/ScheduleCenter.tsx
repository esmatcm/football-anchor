import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { getAdminMatchSignals } from "../../lib/adminMatchUi";
import { parseMatchKickoff } from "../../lib/matchTime";

type MatchRow = {
  id: number;
  match_date?: string;
  kickoff_time: string;
  league_name: string;
  home_team: string;
  away_team: string;
  category?: string;
  is_open?: number;
  apply_deadline?: string;
  match_status?: string;
  approved_count?: number;
  approved_application_count?: number;
  pending_count?: number;
  pending_application_count?: number;
  assignment_count?: number;
  total_assignment_count?: number;
  scheduled_assignment_count?: number;
  completed_assignment_count?: number;
  required_anchor_count?: number;
  approved_anchors?: string;
  anchor_details?: { name: string; site_name: string | null; site_code: string | null }[];
  coverage_gap?: number;
};

const SITE_COLORS: Record<string, string> = {
  jyb: "bg-amber-50 text-amber-700 border-amber-300",
  ga: "bg-sky-50 text-sky-700 border-sky-300",
};

function getMatchStatus(kickoff: string, dateYmd: string) {
  const dt = parseMatchKickoff(dateYmd, kickoff);
  if (!dt) return { text: "--", cls: "text-stone-400" };
  const diff = Math.floor((dt.getTime() - Date.now()) / 60000);
  if (diff > 90) return { text: "未开始", cls: "text-stone-500" };
  if (diff > 30) return { text: `${diff}分后`, cls: "text-stone-600" };
  if (diff > 0) return { text: `${diff}分后`, cls: "text-amber-600 font-semibold" };
  if (diff > -120) return { text: "进行中", cls: "text-emerald-600 font-semibold" };
  return { text: "已结束", cls: "text-stone-400" };
}

export default function ScheduleCenter() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "gap" | "done">("all");

  useEffect(() => {
    setLoading(true);
    api.get(`/applications/day-overview?date=${date}`)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [date]);

  const sorted = useMemo(() => {
    const list = [...rows].sort((a, b) => {
      const ta = parseMatchKickoff(date, a.kickoff_time)?.getTime() || 0;
      const tb = parseMatchKickoff(date, b.kickoff_time)?.getTime() || 0;
      return ta - tb;
    });
    if (filter === "gap") return list.filter((r) => (r.coverage_gap ?? 0) > 0);
    if (filter === "done") return list.filter((r) => (r.coverage_gap ?? 0) === 0);
    return list;
  }, [rows, filter, date]);

  const groups = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    for (const row of sorted) {
      const key = row.kickoff_time || "--";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [sorted]);

  const stats = useMemo(() => {
    const total = rows.length;
    const filled = rows.filter((r) => (r.coverage_gap ?? 0) === 0).length;
    const gap = total - filled;
    const pending = rows.reduce((s, r) => s + Number(r.pending_application_count ?? r.pending_count ?? 0), 0);
    return { total, filled, gap, pending };
  }, [rows]);

  const FILTERS = [
    { key: "all" as const, label: "全部", count: stats.total },
    { key: "gap" as const, label: "缺人", count: stats.gap },
    { key: "done" as const, label: "已满", count: stats.filled },
  ];

  return (
    <div className="space-y-4 motion-rise">
      <section className="app-card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-900 md:text-2xl">排班时间表</h2>
            <p className="mt-1 text-sm text-stone-500">按时间查看当日所有赛事排班状态</p>
          </div>
          <DateQuickPicker value={date} onChange={setDate} label="日期" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
            <div className="text-[11px] text-stone-500">总场次</div>
            <div className="mt-0.5 text-lg font-semibold text-stone-900">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] text-emerald-700">已排满</div>
            <div className="mt-0.5 text-lg font-semibold text-emerald-900">{stats.filled}</div>
          </div>
          <div className={"rounded-xl border px-3 py-2 " + (stats.gap > 0 ? "border-red-200 bg-red-50" : "border-stone-200 bg-stone-50")}>
            <div className={"text-[11px] " + (stats.gap > 0 ? "text-red-600" : "text-stone-500")}>缺人</div>
            <div className={"mt-0.5 text-lg font-semibold " + (stats.gap > 0 ? "text-red-900" : "text-stone-900")}>{stats.gap}</div>
          </div>
          <div className={"rounded-xl border px-3 py-2 " + (stats.pending > 0 ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-stone-50")}>
            <div className={"text-[11px] " + (stats.pending > 0 ? "text-amber-700" : "text-stone-500")}>待审报名</div>
            <div className={"mt-0.5 text-lg font-semibold " + (stats.pending > 0 ? "text-amber-900" : "text-stone-900")}>{stats.pending}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={"inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition " + (filter === f.key ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400")}
            >
              {f.label} <span className={"text-[11px] " + (filter === f.key ? "text-white/70" : "text-stone-400")}>{f.count}</span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="app-card p-6"><div className="skeleton h-32" /></div>
      ) : sorted.length === 0 ? (
        <div className="state-empty">暂无赛程数据</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block app-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 w-[80px]">开赛</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 w-[70px]">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 w-[90px]">联赛</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500">对阵</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 w-[70px]">排班</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500">已排主播</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 w-[60px]">待审</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {groups.map(([time, items]) =>
                  items.map((row, idx) => {
                    const st = getMatchStatus(row.kickoff_time, date);
                    const signals = getAdminMatchSignals(row);
                    const required = Math.max(1, Number(row.required_anchor_count || 1));
                    const assigned = Number(row.scheduled_assignment_count ?? row.assignment_count ?? row.total_assignment_count ?? 0);
                    const pending = Number(row.pending_application_count ?? row.pending_count ?? 0);
                    const gap = Math.max(0, required - assigned);
                    const details = row.anchor_details || [];

                    return (
                      <tr key={row.id} className={gap > 0 ? "bg-red-50/30" : ""}>
                        {idx === 0 ? (
                          <td className="px-4 py-2.5 align-top font-mono text-[15px] font-semibold text-stone-900 whitespace-nowrap" rowSpan={items.length}>
                            {time}
                          </td>
                        ) : null}
                        <td className={"px-4 py-2.5 whitespace-nowrap text-xs " + st.cls}>{st.text}</td>
                        <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">{row.league_name}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-stone-900">{row.home_team}</span>
                          <span className="text-stone-400"> vs </span>
                          <span className="text-stone-900">{row.away_team}</span>
                          {signals.hasAnomaly && <span className="ml-1.5 inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">异常</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={gap > 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>{assigned}/{required}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {details.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {details.map((d, i) => {
                                const siteClass = d.site_code ? (SITE_COLORS[d.site_code] || "bg-stone-50 text-stone-600 border-stone-300") : "bg-stone-50 text-stone-600 border-stone-300";
                                return (
                                  <span key={i} className={"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] " + siteClass}>
                                    {d.name}{d.site_name ? <span className="opacity-60">({d.site_name})</span> : null}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-xs text-stone-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {pending > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">{pending}</span> : <span className="text-xs text-stone-400">0</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {groups.map(([time, items]) => (
              <div key={time} className="app-card overflow-hidden">
                <div className="border-b border-stone-200 bg-stone-50 px-3.5 py-2">
                  <span className="font-mono text-base font-semibold text-stone-900">{time}</span>
                  <span className="ml-2 text-xs text-stone-500">{items.length} 场</span>
                </div>
                <div className="divide-y divide-stone-100">
                  {items.map((row) => {
                    const st = getMatchStatus(row.kickoff_time, date);
                    const required = Math.max(1, Number(row.required_anchor_count || 1));
                    const assigned = Number(row.scheduled_assignment_count ?? row.assignment_count ?? 0);
                    const pending = Number(row.pending_application_count ?? row.pending_count ?? 0);
                    const gap = Math.max(0, required - assigned);
                    const details = row.anchor_details || [];

                    return (
                      <div key={row.id} className={"px-3.5 py-3 " + (gap > 0 ? "bg-red-50/30" : "")}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-stone-500">{row.league_name}</div>
                            <div className="mt-0.5 text-sm font-medium text-stone-900 break-words">{row.home_team} vs {row.away_team}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={"text-xs " + st.cls}>{st.text}</div>
                            <div className={"mt-0.5 text-sm font-semibold " + (gap > 0 ? "text-red-600" : "text-emerald-600")}>{assigned}/{required}</div>
                          </div>
                        </div>
                        {details.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {details.map((d, i) => {
                              const siteClass = d.site_code ? (SITE_COLORS[d.site_code] || "bg-stone-50 text-stone-600 border-stone-300") : "bg-stone-50 text-stone-600 border-stone-300";
                              return (
                                <span key={i} className={"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] " + siteClass}>
                                  {d.name}{d.site_name ? <span className="opacity-60">({d.site_name})</span> : null}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {pending > 0 && <div className="mt-1.5 text-[11px] text-amber-700">待审 {pending} 人</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
