import { useState, useEffect } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { getAdminMatchSignals } from "../../lib/adminMatchUi";

const CATEGORIES = ["全部", "足球", "CBA", "NBA", "韩篮甲", "NBL", "新西联"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const SITE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  jyb: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
  ga: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-300" },
};

function SiteChip({ code, name }: { code: string; name: string }) {
  const colors = SITE_COLORS[code] || { bg: "bg-stone-50", text: "text-stone-600", border: "border-stone-300" };
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
      {name}
    </span>
  );
}

export default function ReviewApplications() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [autoClosedCount, setAutoClosedCount] = useState(0);
  const [matchFilter, setMatchFilter] = useState<"all" | "has_pending" | "all_approved" | "urgent" | "anomaly">("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("全部");
  const [appStatusFilter, setAppStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "waitlist">("all");
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [batchSiteModal, setBatchSiteModal] = useState<string | null>(null); // status for batch

  const STATUS_LABELS: Record<string, string> = {
    approved: "已通过",
    rejected: "已拒绝",
    pending: "待审核",
    waitlist: "候补",
  };

  // Fetch sites on mount
  useEffect(() => {
    api.get("/applications/sites").then((res) => setSites(res.data)).catch(() => {});
  }, []);

  const fetchMatches = async () => {
    try {
      const res = await api.get(`/applications/review-matches?date=${date}`);
      setAutoClosedCount(Number(res.data?.autoClosedCount || 0));
      setMatches(Array.isArray(res.data?.matches) ? res.data.matches : []);
    } catch (err) {
      console.error(err);
      setAutoClosedCount(0);
      setMatches([]);
    }
  };

  const fetchApplications = async (matchId: number) => {
    try {
      const res = await api.get(`/applications/match/${matchId}`);
      setApplications(res.data);
      setSelectedAppIds([]);
      setAppStatusFilter("all");
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMatches();
    setSelectedMatch(null);
    setApplications([]);
  }, [date]);

  const handleReview = async (appId: number, status: string, siteId?: number) => {
    try {
      await api.put(`/applications/review/${appId}`, { status, site_id: siteId || null });
      if (selectedMatch) {
        fetchApplications(selectedMatch.id);
      }
      fetchMatches();
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "审核失败" });
    }
  };

  const toggleSelectAll = () => {
    const ids = filteredApplications.map((a) => a.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedAppIds.includes(id));
    setSelectedAppIds(allSelected ? [] : ids);
  };

  const selectInverse = () => {
    const ids = filteredApplications.map((a) => a.id);
    setSelectedAppIds(ids.filter((id) => !selectedAppIds.includes(id)));
  };

  const reviewBatch = async (status: string, siteId?: number) => {
    if (selectedAppIds.length === 0) {
      setBanner({ type: "error", text: "请先勾选报名" });
      return;
    }
    try {
      await api.put('/applications/review-batch', { ids: selectedAppIds, status, site_id: siteId || null });
      if (selectedMatch) fetchApplications(selectedMatch.id);
      fetchMatches();
      setBanner({ type: "success", text: `批次${status === "approved" ? "通过" : "拒绝"}完成` });
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || '批次审核失败' });
    }
  };

  const handleBatchApproveWithSite = (siteId: number) => {
    setBatchSiteModal(null);
    reviewBatch("approved", siteId);
  };

  const filteredMatches = matches.filter((match) => {
    if (categoryFilter !== "全部") {
      const matchCategory = String(match.category || "足球");
      if (matchCategory !== categoryFilter) return false;
    }
    const pending = Number(match.pending_count || 0);
    const total = Number(match.application_count || 0);
    if (matchFilter === "has_pending") return pending > 0;
    if (matchFilter === "all_approved") return total > 0 && pending === 0;
    const signals = getAdminMatchSignals(match);
    if (matchFilter === "anomaly") return signals.hasAnomaly;
    if (matchFilter === "urgent") return signals.hasAnomaly || signals.businessStatus === "即将截止" || signals.coverageLabel.includes("缺主播");
    return true;
  }).sort((a, b) => {
    const o: Record<string, number> = { '可报名': 0, '即将截止': 1, '未开放': 2, '已截止': 3, '已开赛': 4, '已结束': 5 };
    const sa = getAdminMatchSignals(a);
    const sb = getAdminMatchSignals(b);
    return (o[sa.businessStatus] ?? 9) - (o[sb.businessStatus] ?? 9);
  });

  const categoryCounts = matches.reduce<Record<string, number>>((acc, m) => {
    const cat = String(m.category || "足球");
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount = matches.length;

  const categoryFilteredMatches = categoryFilter === "全部"
    ? matches
    : matches.filter((m) => String(m.category || "足球") === categoryFilter);
  const matchStatusCounts = categoryFilteredMatches.reduce(
    (acc, m) => {
      const pending = Number(m.pending_count || 0);
      const total = Number(m.application_count || 0);
      if (pending > 0) acc.has_pending++;
      if (total > 0 && pending === 0) acc.all_approved++;
      return acc;
    },
    { has_pending: 0, all_approved: 0 }
  );

  const APP_STATUS_OPTIONS = [
    { key: "all" as const, label: "全部", color: "bg-stone-800 text-white border-stone-800" },
    { key: "pending" as const, label: "待审核", color: "bg-yellow-500 text-white border-yellow-500" },
    { key: "approved" as const, label: "已通过", color: "bg-green-600 text-white border-green-600" },
    { key: "rejected" as const, label: "已拒绝", color: "bg-red-600 text-white border-red-600" },
    { key: "waitlist" as const, label: "候补", color: "bg-blue-600 text-white border-blue-600" },
  ];

  const appStatusCounts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const filteredApplications = appStatusFilter === "all"
    ? applications
    : applications.filter((a) => a.status === appStatusFilter);

  return (
    <div className="space-y-6 motion-rise">
      <h2 className="text-2xl font-bold text-stone-800">报名审核</h2>
      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">关闭</button>
          </div>
        </div>
      ) : null}

      <div className="app-card p-4 space-y-3">
        {autoClosedCount > 0 && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            已自动结束报名 {autoClosedCount} 场（开赛前30分钟且无人报名）
          </div>
        )}
        <DateQuickPicker value={date} onChange={setDate} label="日期" />
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-stone-500 shrink-0">分类</span>
            {CATEGORIES.map((cat) => {
              const count = cat === "全部" ? totalCount : (categoryCounts[cat] || 0);
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setCategoryFilter(cat); setSelectedMatch(null); setApplications([]); }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${active ? "bg-stone-800 text-white border-stone-800 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}
                >
                  <span>{cat}</span>
                  <span className={`ml-0.5 text-[11px] tabular-nums ${active ? "text-white/70" : "text-stone-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-stone-500 shrink-0">状态</span>
            {([
              { key: "all" as const, label: "全部", count: categoryFilteredMatches.length, color: "bg-stone-800 text-white border-stone-800" },
              { key: "has_pending" as const, label: "待审核", count: matchStatusCounts.has_pending, color: "bg-yellow-500 text-white border-yellow-500" },
              { key: "all_approved" as const, label: "已审完", count: matchStatusCounts.all_approved, color: "bg-green-600 text-white border-green-600" },
              { key: "urgent" as const, label: "优先处理", count: null, color: "bg-stone-800 text-white border-stone-800" },
              { key: "anomaly" as const, label: "仅异常", count: null, color: "bg-red-600 text-white border-red-600" },
            ]).map(({ key, label, count, color }) => {
              const active = matchFilter === key;
              return (
                <button key={key} type="button" onClick={() => setMatchFilter(key)} className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${active ? `${color} shadow-sm` : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50'}`}>
                  <span>{label}</span>
                  {count !== null && <span className={`ml-0.5 text-[11px] tabular-nums ${active ? "opacity-70" : "text-stone-400"}`}>{count}</span>}
                </button>
              );
            })}
            <span className="text-xs text-stone-400 self-center ml-auto tabular-nums">{filteredMatches.length} 场</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 min-w-0 app-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-stone-50">
            <h3 className="font-medium text-stone-800 break-all">开放中的赛程</h3>
          </div>
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {filteredMatches.length === 0 ? (
              <div className="p-4"><div className="state-empty">暂无符合条件的开放赛程</div></div>
            ) : (
              filteredMatches.map((match) => {
                const signals = getAdminMatchSignals(match);
                return (
                  <button
                    key={match.id}
                    onClick={() => {
                      setSelectedMatch(match);
                      fetchApplications(match.id);
                    }}
                    className={`w-full min-w-0 text-left p-4 hover:bg-stone-50 transition-colors ${selectedMatch?.id === match.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-stone-900 break-all">
                        <span className="shrink-0 rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{match.category || "足球"}</span>
                        {match.kickoff_time} - {match.league_name}
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <span className={`chip ${signals.businessStatusClass}`}>{signals.businessStatus}</span>
                        {signals.hasAnomaly && <span className="chip chip-danger">异常 {signals.anomalies.length}</span>}
                      </div>
                    </div>
                    <div className="text-sm text-stone-500 mt-1 break-all whitespace-normal">{match.home_team} vs {match.away_team}</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                      <span>截止：{signals.deadlineLabel}</span>
                      <span className={signals.coverageTone}>{signals.coverageLabel}</span>
                      <span className={signals.hasAnomaly ? 'text-red-600 font-medium' : 'text-amber-700'}>{signals.kickoffAlert}</span>
                    </div>
                    {signals.hasAnomaly && (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 flex flex-wrap gap-2">
                        {signals.anomalies.map((issue) => <span key={issue}>⚠ {issue}</span>)}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="md:col-span-2 min-w-0 app-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-stone-50 space-y-2">
            <h3 className="font-medium text-stone-800">
              {selectedMatch ? `${selectedMatch.home_team} vs ${selectedMatch.away_team} 的报名` : "请选择左侧赛程"}
            </h3>
            {selectedMatch && applications.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-stone-500 shrink-0">状态</span>
                  {APP_STATUS_OPTIONS.map(({ key, label, color }) => {
                    const count = key === "all" ? applications.length : (appStatusCounts[key] || 0);
                    if (key !== "all" && count === 0) return null;
                    const active = appStatusFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAppStatusFilter(key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-all ${active ? `${color} shadow-sm` : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}
                      >
                        <span>{label}</span>
                        <span className={`ml-0.5 text-[11px] tabular-nums ${active ? "opacity-70" : "text-stone-400"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={toggleSelectAll} className="px-2 py-1 text-xs rounded bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors">全选/全不选</button>
                  <button onClick={selectInverse} className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">反选</button>
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-xs text-stone-500">批次通过：</span>
                    {sites.map((site) => (
                      <button
                        key={site.id}
                        onClick={() => reviewBatch("approved", site.id)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${site.code === "jyb" ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100" : "bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100"}`}
                      >
                        通过→{site.name}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => reviewBatch("rejected")} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors">批次拒绝</button>
                </div>
              </>
            )}
          </div>
          {selectedMatch ? (
            <div className="divide-y divide-gray-200">
              {filteredApplications.length === 0 ? (
                <div className="p-8"><div className="state-empty">{applications.length === 0 ? "暂时没有报名" : "没有符合筛选条件的报名"}</div></div>
              ) : (
                filteredApplications.map((app) => (
                  <div key={app.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-stone-600">
                      <input type="checkbox" checked={selectedAppIds.includes(app.id)} onChange={(e) => setSelectedAppIds((prev) => e.target.checked ? [...prev, app.id] : prev.filter((x) => x !== app.id))} />
                      选取
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900">{app.nickname} ({app.username})</span>
                        {app.site_code && <SiteChip code={app.site_code} name={app.site_name} />}
                      </div>
                      <div className="text-sm text-stone-500">报名时间：{new Date(app.apply_time).toLocaleString()}</div>
                      <div className="text-sm mt-1">
                        状态：<span className={`font-semibold ${app.status === 'approved' ? 'text-green-600' : app.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'}`}>{STATUS_LABELS[app.status] || app.status}</span>
                        {app.status === 'approved' && !app.site_code && <span className="ml-2 inline-flex items-center rounded-md border border-yellow-300 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">⚠ 未指定站点</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {app.status === 'pending' ? (
                        <>
                          {sites.map((site) => (
                            <button
                              key={site.id}
                              onClick={() => handleReview(app.id, 'approved', site.id)}
                              className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors ${site.code === "jyb" ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100" : "bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100"}`}
                            >
                              通过→{site.name}
                            </button>
                          ))}
                          <button
                            onClick={() => handleReview(app.id, 'rejected')}
                            className="px-2.5 py-1.5 text-xs rounded-lg border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition-colors"
                          >
                            拒绝
                          </button>
                          <button
                            onClick={() => handleReview(app.id, 'waitlist')}
                            className="px-2.5 py-1.5 text-xs rounded-lg border bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            候补
                          </button>
                        </>
                      ) : app.status === 'approved' ? (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-stone-500">切换站点：</span>
                            {sites.map((site) => (
                              <button
                                key={site.id}
                                onClick={() => handleReview(app.id, 'approved', site.id)}
                                disabled={app.site_id === site.id}
                                className={`px-2 py-1 text-[11px] rounded border transition-colors disabled:opacity-40 ${site.code === "jyb" ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100" : "bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100"}`}
                              >
                                {site.name}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => handleReview(app.id, 'rejected')}
                            className="px-2.5 py-1.5 text-xs rounded-lg border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition-colors"
                          >
                            改拒绝
                          </button>
                        </>
                      ) : (
                        <>
                          {sites.map((site) => (
                            <button
                              key={site.id}
                              onClick={() => handleReview(app.id, 'approved', site.id)}
                              className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors ${site.code === "jyb" ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100" : "bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100"}`}
                            >
                              通过→{site.name}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-8"><div className="state-empty">请选择左侧赛程以查看报名</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
