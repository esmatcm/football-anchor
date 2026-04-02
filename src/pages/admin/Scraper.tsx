import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { MetricCard, OpsGuide, PageHero } from "../../components/opsUi";
import { getBeijingTodayYmd } from "../../lib/beijingDate";

const SCRAPE_ACTIONS = [
  { key: "football", label: "抓取足球", badge: "importantSclass + 精简联赛", className: "btn-primary", supported: true },
  { key: "cba", label: "抓取 CBA", badge: "篮球月度数据源", className: "btn-secondary", supported: true },
  { key: "nba", label: "抓取 NBA", badge: "篮球月度数据源", className: "btn-secondary", supported: true },
  { key: "kbl", label: "抓取韩篮甲", badge: "SclassID=15 月度数据源", className: "btn-secondary", supported: true },
{ key: "nbl", label: "抓取 NBL", badge: "SclassID=14 澳篮月度数据源", className: "btn-secondary", supported: true },
  { key: "all", label: "四类全抓", badge: "串并合并校验", className: "btn-primary", supported: true },
] as const;

type ScrapeType = typeof SCRAPE_ACTIONS[number]["key"];

export default function ScrapeMatches() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [loadingType, setLoadingType] = useState<ScrapeType | null>(null);
  const [result, setResult] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [autoStatus, setAutoStatus] = useState<any>(null);
  const [scopeInfo, setScopeInfo] = useState<any>(null);

  const failedJobs = useMemo(() => jobs.filter((job) => job.fetch_status === "failed").slice(0, 5), [jobs]);
  const isAutoAlert = autoStatus && (!autoStatus.enabled || !autoStatus.latestSuccess || Number(autoStatus.latestSuccess.success_count || 0) === 0);

  const fetchAutoStatus = async () => {
    try {
      const res = await api.get("/stats/auto-scrape-status");
      setAutoStatus(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await api.get("/matches/jobs");
      setJobs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchScopeInfo = async () => {
    try {
      const res = await api.get("/matches/scrape-scope");
      setScopeInfo(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchAutoStatus();
    fetchScopeInfo();
  }, []);

  const handleScrapeByType = async (type: ScrapeType) => {
    const action = SCRAPE_ACTIONS.find((item) => item.key === type);
    if (!action?.supported) {
      setResult({ success: false, error: `${action?.label || type} 暂未接入` });
      return;
    }

    setLoadingType(type);
    setResult(null);
    try {
      const pathMap: Record<ScrapeType, string> = {
        football: "/matches/scrape",
        cba: "/matches/scrape-cba",
        nba: "/matches/scrape-nba",
        kbl: "/matches/scrape-kbl",
        all: "/matches/scrape-all",
      };
      const path = pathMap[type];
      const res = await api.post(path, { date });
      setResult(res.data);
      fetchJobs();
      fetchAutoStatus();
      fetchScopeInfo();
    } catch (err: any) {
      setResult({ success: false, error: err.response?.data?.error || err.message, activeJob: err.response?.data?.active_job || null });
    } finally {
      setLoadingType(null);
    }
  };

  const successRate = useMemo(() => {
    const latestSuccess = jobs.filter((job) => job.fetch_status === "success").slice(0, 10);
    if (latestSuccess.length === 0) return null;
    const total = latestSuccess.reduce((sum, job) => sum + Number(job.total_count || 0), 0);
    const success = latestSuccess.reduce((sum, job) => sum + Number(job.success_count || 0), 0);
    return total > 0 ? `${success}/${total}` : "0/0";
  }, [jobs]);

  return (
    <div className="space-y-6 motion-rise">
      <PageHero
        eyebrow="抓取控制台"
        title="抓取赛事"
        description="先判断自动抓取是不是正常，再决定要不要手动补抓。这里主要解决三件事：源头有没有断、范围对不对、最近失败卡在哪里。"
        tone="amber"
        stats={[
          { label: "最近记录", value: jobs.length, tone: "neutral" },
          { label: "自动抓取", value: autoStatus?.enabled ? "开" : "关", tone: autoStatus?.enabled ? "success" : "danger" },
          { label: "启用联赛", value: scopeInfo?.enabledCount ?? "-", tone: "info" },
          { label: "近 10 次成功量", value: successRate || "-", tone: "warning" },
        ]}
        aside={<MetricCard label="最近成功" value={autoStatus?.latestSuccess ? `${autoStatus.latestSuccess.fetch_date}` : "暂无"} tone={isAutoAlert ? "danger" : "success"} />}
      />

      <section className="app-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <DateQuickPicker value={date} onChange={setDate} label="目标日期" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {SCRAPE_ACTIONS.map((action) => {
              const isLoading = loadingType === action.key;
              return (
                <button
                  key={action.key}
                  onClick={() => handleScrapeByType(action.key)}
                  disabled={Boolean(loadingType) || !action.supported}
                  className={`${action.className} tap-press min-w-[150px] flex-col gap-1 px-4 py-3 disabled:opacity-60`}
                >
                  <span>{isLoading ? "抓取中..." : action.label}</span>
                  <span className="text-[11px] opacity-85">{action.badge}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip chip-neutral">足球：按目标页 importantSclass 精简口径</span>
          <span className="chip chip-warning">篮球：官方 matchId 优先，含 CBA / NBA / 韩篮甲 / NBL，同步和目标站日快照对齐</span>
          <span className="chip chip-open">重复抓取只更新，不重复暴露</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium text-stone-500">目标站核对 ↗</span>
          <a
            href={`https://bf.titan007.com/football/Next_${date}.htm`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 hover:border-blue-300"
          >
            ⚽ 足球 · titan007
          </a>
          <a
            href="https://nba.titan007.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100 hover:border-orange-300"
          >
            🏀 NBA · titan007
          </a>
          <a
            href="https://nba.titan007.com/cn/CBAMatch.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100 hover:border-purple-300"
          >
            🏀 CBA · titan007
          </a>
          <a
            href="https://nba.titan007.com/cn/League/15.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100 hover:border-teal-300"
          >
            🏀 韩篮甲 · titan007
          </a>
          <a
            href="https://nba.titan007.com/cn/League/14.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 hover:border-rose-300"
          >
            🏀 NBL · titan007
          </a>
        </div>

        {result ? (
          <div className={`rounded-2xl border px-4 py-4 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {result.success ? (
              <div className="space-y-1">
                <div className="font-semibold">抓取成功</div>
                <div>成功处理 {result.count} 场{typeof result.total === "number" ? `，本次有效去重后共 ${result.total} 场` : ""}。</div>
                {result.skipped ? <div>本次请求被标记为跳过。</div> : null}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-semibold">抓取失败</div>
                <div>错误：{result.error}</div>
                {result.activeJob ? <div>当前占用任务：{result.activeJob.scope} / {result.activeJob.date}</div> : null}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <OpsGuide
        title="抓取提示"
        description="先排源头，再决定要不要补抓。"
        summary="先看自动状态，再补抓，失败记录最后看"
        tone="amber"
        collapsible
        bullets={[
          { title: "先看自动状态", body: "自动抓取断掉时，手动补一次只能救当前，不代表问题已经解决。" },
          { title: "足球看页面视角", body: "足球不是抓整页全量，而是跟目标页当天精简联赛口径走。" },
          { title: "篮球看日快照对齐", body: "篮球按官方 matchId 和日快照对账，旧的未结束脏数据会被清理。" },
        ]}
      />

      <section className={`app-card p-4 md:p-5 text-sm ${isAutoAlert ? "border-red-200 bg-red-50/70 text-red-700" : "text-stone-700"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-semibold text-stone-900">自动抓取状态</div>
            <div className="mt-1 text-xs text-stone-500">便于直接判断自动任务是不是断了、抓到了多少、下一次什么时候跑，以及当前会覆盖到未来几天。</div>
          </div>
          {isAutoAlert ? <div className="chip chip-danger">需要处理</div> : <div className="chip chip-open">状态正常</div>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"><div className="text-xs text-stone-500">自动抓取</div><div className="mt-1 font-semibold">{autoStatus?.enabled ? "已启用" : "已关闭"}</div></div>
          <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"><div className="text-xs text-stone-500">间隔</div><div className="mt-1 font-semibold">{Math.round((autoStatus?.intervalMs || 0) / 60000)} 分钟</div></div>
          <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"><div className="text-xs text-stone-500">下一次执行</div><div className="mt-1 font-semibold">{autoStatus?.nextRunAt ? new Date(autoStatus.nextRunAt).toLocaleString() : "-"}</div></div>
          <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"><div className="text-xs text-stone-500">最近成功</div><div className="mt-1 font-semibold">{autoStatus?.latestSuccess ? `${autoStatus.latestSuccess.fetch_date} ${autoStatus.latestSuccess.success_count}/${autoStatus.latestSuccess.total_count}` : "暂无"}</div></div>
          <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"><div className="text-xs text-stone-500">自动范围</div><div className="mt-1 font-semibold">{typeof autoStatus?.daysAhead === "number" ? `今天起未来 ${autoStatus.daysAhead} 天` : "-"}</div></div>
        </div>
      </section>

      {scopeInfo ? (
        <section className="app-card p-4 md:p-5 space-y-4 text-sm text-stone-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold text-stone-900">足球抓取范围</div>
              <div className="mt-1 text-xs text-stone-500">展示当前实际会进入抓取的精简范围，不是历史库里所有出现过的联赛。</div>
            </div>
            <span className={`chip ${scopeInfo.source === "db" ? "chip-open" : "chip-warning"}`}>{scopeInfo.source === "db" ? "使用当前配置" : "使用默认精简名单"}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4"><div className="text-xs text-stone-500">当前启用联赛</div><div className="mt-1 text-2xl font-semibold text-stone-900">{scopeInfo.enabledCount}</div></div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4"><div className="text-xs text-stone-500">库内出现过的足球联赛</div><div className="mt-1 text-2xl font-semibold text-stone-900">{scopeInfo.totalKnownLeagueCount}</div></div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4"><div className="text-xs text-stone-500">已知但当前未纳入</div><div className="mt-1 text-2xl font-semibold text-stone-900">{scopeInfo.disabledKnownLeagueCount || 0}</div></div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-stone-600">当前启用联赛</div>
            <div className="flex flex-wrap gap-2">
              {(scopeInfo.enabled || []).map((name: string) => <span key={name} className="chip chip-neutral">{name}</span>)}
            </div>
          </div>

          {Array.isArray(scopeInfo.topKnownButDisabled) && scopeInfo.topKnownButDisabled.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-medium text-stone-600">库内已出现但当前未纳入抓取范围</div>
              <div className="flex flex-wrap gap-2">
                {scopeInfo.topKnownButDisabled.map((row: any) => <span key={row.league_name} className="chip chip-rejected">{row.league_name} · {row.match_count}</span>)}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {failedJobs.length > 0 ? (
        <section className="app-card overflow-hidden">
          <div className="border-b bg-red-50/80 px-5 py-4">
            <h3 className="font-semibold text-red-800">最近失败记录</h3>
          </div>
          <div className="divide-y divide-red-100">
            {failedJobs.map((job) => (
              <div key={`failed-${job.id}`} className="space-y-1 px-5 py-4 text-sm">
                <div className="font-medium text-stone-900">{job.fetch_date} · {new Date(job.created_at).toLocaleString()}</div>
                <div className="text-red-700 break-all">{job.fail_reason || "无失败原因"}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="app-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b bg-stone-50/80 px-5 py-4">
          <h3 className="font-semibold text-stone-900">最近抓取记录</h3>
          <span className="text-xs text-stone-500">移动端卡片 / 桌面端表格双布局</span>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {jobs.map((job) => {
            const statusLabel = job.fetch_status === "success" ? "成功" : job.fetch_status === "failed" ? "失败" : job.fetch_status;
            return (
              <div key={job.id} className="rounded-2xl border border-stone-200 bg-white/90 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-stone-900">{job.fetch_date}</div>
                  <span className={`chip ${job.fetch_status === "success" ? "chip-open" : "chip-danger"}`}>{statusLabel}</span>
                </div>
                <div className="text-xs text-stone-500">成功 / 总计：{job.success_count} / {job.total_count}</div>
                <div className="text-xs text-stone-500">{new Date(job.created_at).toLocaleString()}</div>
                {job.fetch_status === "failed" ? <div className="text-xs text-red-700 break-all">{job.fail_reason || "无失败原因"}</div> : null}
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50/90">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">日期</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">成功 / 总计</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">失败原因</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">建立时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white/80">
              {jobs.map((job) => {
                const statusLabel = job.fetch_status === "success" ? "成功" : job.fetch_status === "failed" ? "失败" : job.fetch_status;
                return (
                  <tr key={job.id}>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-stone-900">{job.fetch_date}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm"><span className={`chip ${job.fetch_status === "success" ? "chip-open" : "chip-danger"}`}>{statusLabel}</span></td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-stone-600">{job.success_count} / {job.total_count}</td>
                    <td className="px-5 py-4 max-w-[420px] break-all text-sm text-stone-600">{job.fail_reason || "-"}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-stone-600">{new Date(job.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
