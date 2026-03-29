import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { MetricCard, PageHero } from "../../components/opsUi";

type TodayStats = {
  scraped: number;
  open: number;
  scheduled: number;
  pending: number;
  incidents: number;
  siteStats?: Record<string, number>;
  unassignedSite?: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<TodayStats>({
    scraped: 0,
    open: 0,
    scheduled: 0,
    pending: 0,
    incidents: 0,
  });
  const [autoStatus, setAutoStatus] = useState<any>(null);
  const [overviewRows, setOverviewRows] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const todayRes = await api.get(`/stats/today`);
        const autoRes = await api.get(`/stats/auto-scrape-status`);
        setStats(todayRes.data);
        setAutoStatus(autoRes.data);

        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()).replaceAll("-", "");
        const overviewRes = await api.get(`/applications/day-overview?date=${today}`);
        setOverviewRows(Array.isArray(overviewRes.data) ? overviewRes.data : []);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      }
    };
    fetchStats();
  }, []);

  const derived = useMemo(() => {
    const unfilled = overviewRows.filter((row) => Number(row.coverage_gap || 0) > 0).length;
    const pendingCoverage = overviewRows.filter((row) => Number(row.coverage_gap || 0) > 0 && Number(row.pending_application_count ?? row.pending_count ?? 0) > 0).length;
    const latestSuccess = autoStatus?.latestSuccess;
    const autoHealthy = Boolean(autoStatus?.enabled && latestSuccess && Number(latestSuccess.success_count || 0) > 0);
    return { unfilled, pendingCoverage, latestSuccess, autoHealthy };
  }, [overviewRows, autoStatus]);

  const quickCards = [
    {
      title: "赛程管理",
      description: "开放 / 异常 / 截止状态一览。",
      value: `${stats.open}/${stats.scraped}`,
      meta: "已开放 / 今日赛程",
      tone: "success",
      to: "/admin/matches",
      cta: "去处理开放与异常",
    },
    {
      title: "抓取状态",
      description: derived.autoHealthy
        ? `最近成功 ${derived.latestSuccess?.fetch_date || "-"} · ${derived.latestSuccess?.success_count || 0}/${derived.latestSuccess?.total_count || 0}`
        : "自动抓取状态需要确认，先排除源头断流。",
      value: autoStatus?.enabled ? "自动开" : "自动关",
      meta: derived.autoHealthy ? "源头正常" : "建议先检查",
      tone: derived.autoHealthy ? "info" : "danger",
      to: "/admin/scrape",
      cta: "去看抓取控制台",
    },
    {
      title: "排班缺口",
      description: "临近开赛无人接的场次。",
      value: String(derived.unfilled),
      meta: derived.pendingCoverage > 0 ? `${derived.pendingCoverage} 场有人待审` : "当前无人待审兜底",
      tone: derived.unfilled > 0 ? "danger" : "neutral",
      to: "/admin/timeline",
      cta: "去盯时间表",
    },
  ] as const;

  return (
    <div className="space-y-6 motion-rise">
      <PageHero
        eyebrow="运营总览"
        title="营运总览"
        description="10 秒内掌握今日数据、开放、缺口状态。"
        tone="neutral"
        stats={[
          { label: "今日赛程", value: stats.scraped, tone: "neutral" },
          { label: "开放中", value: stats.open, tone: "success" },
          { label: "已排班主播", value: stats.scheduled, tone: "info" },
          { label: "待审核申请", value: stats.pending, tone: "warning" },
        ]}
        aside={<MetricCard label="异常事件" value={stats.incidents} tone="danger" />}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        {quickCards.map((card) => (
          <Link key={card.title} to={card.to} className="app-card flex h-full flex-col p-5 transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-stone-900">{card.title}</div>
                <div className="mt-1 text-[13px] leading-6 text-stone-500">{card.description}</div>
              </div>
              <span className={`chip shrink-0 ${card.tone === "success" ? "chip-open" : card.tone === "info" ? "chip-approved" : card.tone === "danger" ? "chip-danger" : "chip-neutral"}`}>{card.meta}</span>
            </div>

            <div className="mt-auto flex items-end justify-between gap-3 pt-5">
              <div className="text-3xl font-semibold leading-none text-stone-900">{card.value}</div>
              <span className="inline-flex max-w-[170px] items-center rounded-full border border-stone-200 bg-white/88 px-3 py-2 text-sm font-medium leading-5 text-sky-700">
                {card.cta} →
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.95fr]">
        <div className="app-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">今日执行风险</h3>
              <p className="mt-1 text-sm text-stone-500">直接影响开播的风险信号。</p>
            </div>
            <div className="chip chip-warning">实时判断</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="无人报班场次" value={derived.unfilled} tone={derived.unfilled > 0 ? "danger" : "success"} />
            <MetricCard label="待审核申请" value={stats.pending} tone={stats.pending > 0 ? "warning" : "neutral"} />
            <MetricCard label="异常事件" value={stats.incidents} tone={stats.incidents > 0 ? "danger" : "neutral"} />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4 text-sm text-stone-600">
            {derived.unfilled > 0
              ? `${derived.unfilled} 场缺主播，优先处理临近开赛场次。`
              : "当前无缺主播风险。"}
          </div>
        </div>

        <div className="app-card p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">抓取与开放快照</h3>
            <p className="mt-1 text-sm text-stone-500">数据源头与开放状态。</p>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
              <div className="text-xs text-stone-500">自动抓取</div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-stone-900">{autoStatus?.enabled ? "已启用" : "已关闭"}</div>
                <span className={`chip ${derived.autoHealthy ? "chip-open" : "chip-danger"}`}>{derived.autoHealthy ? "正常" : "需检查"}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
              <div className="text-xs text-stone-500">最近成功抓取</div>
              <div className="mt-1 text-sm font-semibold text-stone-900">{derived.latestSuccess ? `${derived.latestSuccess.fetch_date} · ${derived.latestSuccess.success_count}/${derived.latestSuccess.total_count}` : "暂无"}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
              <div className="text-xs text-stone-500">开放比例</div>
              <div className="mt-1 text-sm font-semibold text-stone-900">{stats.scraped > 0 ? `${Math.round((stats.open / stats.scraped) * 100)}%` : "0%"}</div>
              <div className="mt-1 text-xs text-stone-500">{stats.open} / {stats.scraped} 场已开放</div>
            </div>
          </div>
        </div>
      </section>

      {(stats.siteStats && Object.keys(stats.siteStats).length > 0) || (stats.unassignedSite || 0) > 0 ? (
        <section className="app-card p-5">
          <h3 className="text-lg font-semibold text-stone-900">站点人力分布</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {Object.entries(stats.siteStats || {}).map(([code, count]) => (
              <div key={code} className={`rounded-2xl border px-4 py-3 ${code === "jyb" ? "border-amber-200 bg-amber-50/60" : "border-sky-200 bg-sky-50/60"}`}>
                <div className={`text-xs ${code === "jyb" ? "text-amber-600" : "text-sky-600"}`}>{code === "jyb" ? "金银伯" : "GA"}</div>
                <div className={`mt-1 text-3xl font-bold tabular-nums ${code === "jyb" ? "text-amber-700" : "text-sky-700"}`}>{count}</div>
                <div className={`mt-0.5 text-xs ${code === "jyb" ? "text-amber-600/70" : "text-sky-600/70"}`}>人次</div>
              </div>
            ))}
            {(stats.unassignedSite || 0) > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3">
                <div className="text-xs text-red-600">未分配站点</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-red-700">{stats.unassignedSite}</div>
                <div className="mt-0.5 text-xs text-red-600/70">人次</div>
              </div>
            )}
          </div>
        </section>
      ) : null}

    </div>
  );
}
