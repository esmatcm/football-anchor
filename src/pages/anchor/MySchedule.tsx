import { useState, useEffect, useMemo } from "react";
import api from "../../lib/api";
import { EmptyStateBlock, InfoCard, PageHero, SectionHeader, TableSectionHeader } from "../../components/opsUi";
import { getAssignmentStatusChipClass } from "../../lib/adminMatchUi";
import { getMinutesUntilKickoff, parseMatchKickoff } from "../../lib/matchTime";
import { ASSIGNMENT_STATUS_LABELS } from "../../lib/anchorUi";

type ScheduleFilter = "all" | "scheduled" | "completed" | "incident";

export default function MySchedule() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ScheduleFilter>("all");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get("/applications/my-assignments");
      setAssignments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const leagues: string[] = Array.from(
    new Set(assignments.map((a: any) => a.league_name).filter((name: any): name is string => Boolean(name)))
  );

  const toggleLeague = (league: string) => {
    setSelectedLeagues((prev) =>
      prev.includes(league) ? prev.filter((l) => l !== league) : [...prev, league]
    );
  };

  const filteredAssignments = useMemo(() => {
    const now = Date.now();
    return assignments
      .filter((item) => selectedLeagues.length === 0 || selectedLeagues.includes(item.league_name))
      .filter((item) => {
        if (statusFilter === "scheduled") return item.status === "scheduled";
        if (statusFilter === "completed") return item.status === "completed";
        if (statusFilter === "incident") return Number(item.incident_flag || 0) === 1;
        return true;
      })
      .filter((item) => {
        if (!upcomingOnly) return true;
        const kickoff = parseMatchKickoff(item.match_date, item.kickoff_time);
        return !!kickoff && kickoff.getTime() >= now;
      })
      .sort((a, b) => {
        const aTs = parseMatchKickoff(a.match_date, a.kickoff_time)?.getTime() || 0;
        const bTs = parseMatchKickoff(b.match_date, b.kickoff_time)?.getTime() || 0;
        return a.status === "scheduled" && b.status !== "scheduled"
          ? -1
          : a.status !== "scheduled" && b.status === "scheduled"
            ? 1
            : aTs - bTs;
      });
  }, [assignments, selectedLeagues, statusFilter, upcomingOnly]);

  const stats = useMemo(() => ({
    total: assignments.length,
    scheduled: assignments.filter((a) => a.status === "scheduled").length,
    completed: assignments.filter((a) => a.status === "completed").length,
    incidents: assignments.filter((a) => a.incident_flag === 1).length,
    upcoming: assignments.filter((a) => {
      const minutes = getMinutesUntilKickoff(a);
      return minutes !== null && minutes >= 0 && a.status === "scheduled";
    }).length,
  }), [assignments]);

  const nextAssignment = useMemo(() => filteredAssignments.find((item) => item.status === "scheduled") || null, [filteredAssignments]);

  return (
    <div className="space-y-6 motion-rise">
      <PageHero
        eyebrow="主播执行面"
        title="我的排班"
        description="查看已分配的排班场次与执行状态"
        tone="violet"
        stats={[
          { label: "全部排班", value: stats.total, tone: "neutral" },
          { label: "待执行", value: stats.scheduled, tone: "info" },
          { label: "已完成", value: stats.completed, tone: "success" },
          { label: "异常", value: stats.incidents, tone: "danger" },
        ]}
      />


      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="app-card p-4 md:p-5 space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <SectionHeader title="筛选排班" description="联赛、状态、仅看未来可以叠加使用。" />
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "全部" },
                { key: "scheduled", label: "待执行" },
                { key: "completed", label: "已完成" },
                { key: "incident", label: "异常" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatusFilter(item.key as ScheduleFilter)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${statusFilter === item.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}
                >
                  {item.label}
                </button>
              ))}
              <label className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm text-stone-700">
                <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
                仅看未来
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="block text-sm font-medium text-stone-700">联赛筛选（可复选）</label>
            <button type="button" onClick={() => setSelectedLeagues([])} className="text-sm text-sky-700 hover:text-sky-800">清空选择</button>
          </div>

          {leagues.length === 0 ? (
            <p className="text-sm text-stone-500">暂无联赛数据</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {leagues.map((league) => {
                const checked = selectedLeagues.includes(league);
                return (
                  <button
                    type="button"
                    key={league}
                    onClick={() => toggleLeague(league)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${checked ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"}`}
                  >
                    {league}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-card p-4 md:p-5 space-y-3">
          <SectionHeader title="执行提醒" description="把当前最值得先看的事单独提出来。" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <InfoCard label="未来待执行" value={stats.upcoming} />
            <InfoCard
              label="下一场"
              value={nextAssignment ? `${nextAssignment.match_date} ${nextAssignment.kickoff_time}` : "暂无待执行排班"}
              hint={nextAssignment ? `${nextAssignment.home_team} vs ${nextAssignment.away_team}` : "调整筛选或回主播首页继续看下一步动作。"}
            />
            <InfoCard label="异常标记" value={stats.incidents} tone={stats.incidents > 0 ? "danger" : "success"} />
          </div>
        </div>
      </section>

      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="app-card p-4 text-center text-stone-500">载入中...</div>
        ) : filteredAssignments.length === 0 ? (
          <div className="state-empty">目前没有符合条件的排班</div>
        ) : (
          filteredAssignments.map((assignment) => {
            const minutes = getMinutesUntilKickoff(assignment);
            return (
              <div key={assignment.id} className={`app-card p-4 space-y-3 ${assignment.incident_flag === 1 ? "ring-1 ring-red-200" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-stone-500">{assignment.match_date} · {assignment.league_name}</div>
                    <div className="mt-1 text-sm font-semibold text-stone-900">{assignment.home_team} vs {assignment.away_team}</div>
                  </div>
                  <span className={`chip ${getAssignmentStatusChipClass(assignment.status, assignment.incident_flag)}`}>
                    {assignment.incident_flag === 1 ? "异常" : ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-stone-50 px-3 py-2">
                    <div className="text-[11px] text-stone-500">开赛时间</div>
                    <div className="mt-1 font-medium text-stone-900">{assignment.kickoff_time}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 px-3 py-2">
                    <div className="text-[11px] text-stone-500">开赛提醒</div>
                    <div className="mt-1 font-medium text-stone-900">{minutes === null ? "待确认" : minutes < 0 ? `已开赛 ${Math.abs(minutes)} 分钟` : `${minutes} 分钟后`}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block app-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50/90">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">日期 / 联赛</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">对阵</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">时间</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">提醒</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white/80">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-stone-500">载入中...</td></tr>
              ) : filteredAssignments.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-stone-500">目前没有符合条件的排班</td></tr>
              ) : (
                filteredAssignments.map((assignment) => {
                  const minutes = getMinutesUntilKickoff(assignment);
                  return (
                    <tr key={assignment.id} className={assignment.incident_flag === 1 ? "bg-red-50/40" : ""}>
                      <td className="px-6 py-4 align-top text-sm">
                        <div className="font-medium text-stone-900">{assignment.match_date}</div>
                        <div className="mt-1 text-xs text-stone-500">{assignment.league_name}</div>
                      </td>
                      <td className="px-6 py-4 align-top text-sm font-medium text-stone-900">{assignment.home_team} vs {assignment.away_team}</td>
                      <td className="px-6 py-4 align-top text-sm text-stone-700">{assignment.kickoff_time}</td>
                      <td className="px-6 py-4 align-top text-sm text-stone-600">{minutes === null ? "待确认" : minutes < 0 ? `已开赛 ${Math.abs(minutes)} 分钟` : `${minutes} 分钟后开赛`}</td>
                      <td className="px-6 py-4 align-top text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`chip ${getAssignmentStatusChipClass(assignment.status, assignment.incident_flag)}`}>
                            {assignment.incident_flag === 1 ? "异常" : ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status}
                          </span>
                          {assignment.incident_flag === 1 ? <span className="chip chip-danger">需要复核</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
