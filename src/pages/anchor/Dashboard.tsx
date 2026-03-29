import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { EmptyStateBlock, InlineLinkCard, PageHero, SectionHeader } from "../../components/opsUi";
import { getMinutesUntilKickoff } from "../../lib/matchTime";
import { getAssignmentStatusChipClass } from "../../lib/adminMatchUi";
import { APPLICATION_STATUS_LABELS, getApplicationTone } from "../../lib/anchorUi";

export default function AnchorDashboard() {
  const { user } = useAuthStore();
  const [applications, setApplications] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const appsRes = await api.get("/applications/my");
        const assignmentsRes = await api.get("/applications/my-assignments");
        setApplications(Array.isArray(appsRes.data) ? appsRes.data : []);
        setAssignments(Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      }
    };
    fetchStats();
  }, []);

  const stats = useMemo(() => ({
    pending: applications.filter((a: any) => a.status === "pending").length,
    approved: applications.filter((a: any) => a.status === "approved").length,
    scheduled: assignments.filter((a: any) => a.status === "scheduled").length,
    completed: assignments.filter((a: any) => a.status === "completed").length,
    incidents: assignments.filter((a: any) => a.incident_flag === 1).length,
  }), [applications, assignments]);

  const nextAssignments = useMemo(() => {
    return [...assignments]
      .filter((item) => item.status === "scheduled")
      .sort((a, b) => {
        const aMinutes = getMinutesUntilKickoff(a) ?? Number.MAX_SAFE_INTEGER;
        const bMinutes = getMinutesUntilKickoff(b) ?? Number.MAX_SAFE_INTEGER;
        return aMinutes - bMinutes;
      })
      .slice(0, 3);
  }, [assignments]);

  const recentApplications = useMemo(() => {
    return [...applications]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .slice(0, 4);
  }, [applications]);

  return (
    <div className="space-y-6 motion-rise">
      <PageHero
        eyebrow="主播工作台"
        title={`欢迎，${user?.nickname}`}
        description="查看今日排班、报名结果与接下来的任务"
        tone="emerald"
        stats={[
          { label: "待审核报名", value: stats.pending, tone: "warning" },
          { label: "即将执行", value: stats.scheduled, tone: "info" },
          { label: "已通过报名", value: stats.approved, tone: "success" },
          { label: "异常纪录", value: stats.incidents, tone: "danger" },
        ]}
      />


      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="app-card p-5 space-y-4">
          <SectionHeader
            title="接下来要执行的场次"
            description="按开赛先后排，先保证不漏播、不撞场。"
            action={<Link to="/anchor/schedule" className="text-sm font-medium text-sky-700">查看全部 →</Link>}
          />

          {nextAssignments.length === 0 ? (
            <EmptyStateBlock title="当前没有待执行排班" description="可以去赛程页继续看可报名场次。" />
          ) : (
            <div className="space-y-3">
              {nextAssignments.map((item) => {
                const minutes = getMinutesUntilKickoff(item);
                const alertText = minutes === null ? "时间待确认" : minutes < 0 ? `已开赛 ${Math.abs(minutes)} 分钟` : `${minutes} 分钟后开赛`;
                return (
                  <div key={item.id} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-stone-500">{item.match_date} · {item.league_name}</div>
                        <div className="mt-1 text-base font-semibold text-stone-900">{item.home_team} vs {item.away_team}</div>
                      </div>
                      <span className={`chip ${getAssignmentStatusChipClass(item.status, item.incident_flag)}`}>
                        {item.incident_flag === 1 ? "异常" : item.status === "scheduled" ? "待执行" : item.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="chip chip-neutral">开赛：{item.kickoff_time}</span>
                      <span className={`chip ${item.incident_flag === 1 ? "chip-danger" : "chip-warning"}`}>{alertText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-card p-5 space-y-4">
          <SectionHeader
            title="报名结果快照"
            description="用来判断你是该等审核，还是该继续抢别的场。"
            action={<Link to="/anchor/matches" className="text-sm font-medium text-sky-700">去赛程页 →</Link>}
          />

          {recentApplications.length === 0 ? (
            <EmptyStateBlock title="你还没有提交报名记录" description="去赛程页看看当前可报名的场次。" />
          ) : (
            <div className="space-y-3">
              {recentApplications.map((item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 truncate">{item.home_team} vs {item.away_team}</div>
                      <div className="mt-1 text-xs text-stone-500">{item.match_date} · {item.kickoff_time} · {item.league_name}</div>
                    </div>
                    <span className={`chip ${getApplicationTone(item.status)}`}>
                      {APPLICATION_STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  {item.review_note ? <div className="mt-2 text-xs text-stone-500 whitespace-pre-wrap">备注：{item.review_note}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="app-card p-5 space-y-4">
          <InlineLinkCard to="/anchor/matches" title="去看可报名赛程" description="想继续接场，从这里按日期和分类筛。" />
          <div>
            <div className="text-2xl font-semibold text-stone-900">{stats.pending + stats.approved}</div>
            <div className="mt-1 text-xs text-stone-500">当前已有报名记录</div>
          </div>
        </div>
        <div className="app-card p-5 space-y-4">
          <InlineLinkCard to="/anchor/schedule" title="去看我的排班" description="按执行顺序确认今天要播的场次。" />
          <div>
            <div className="text-2xl font-semibold text-stone-900">{stats.scheduled}</div>
            <div className="mt-1 text-xs text-stone-500">待执行排班</div>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="text-sm font-semibold text-stone-900">当前工作判断</div>
          <div className="mt-2 text-sm text-stone-500">
            {stats.scheduled > 0
              ? "优先看我的排班，确保最近一场不漏。"
              : stats.pending > 0
                ? "有报名在审核中，先等结果，同时可以继续留意可报名场。"
                : "当前没有执行中的排班压力，可以主动去赛程页补报名。"}
          </div>
          <div className="mt-4 inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600">
            首页只保留下一步动作
          </div>
        </div>
      </section>
    </div>
  );
}
