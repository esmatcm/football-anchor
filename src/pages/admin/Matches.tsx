import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import {
  compareMatchesBusinessAsc,
  compareMatchesBusinessDesc,
  formatApplyDeadline,
  getMatchAnomalies,
  hasMatchStarted,
  isMatchApplicationEnded,
} from "../../lib/matchTime";
import { getAdminMatchSignals } from "../../lib/adminMatchUi";

type Category = "足球" | "CBA" | "NBA" | "韩篮甲";
const CATEGORIES: Category[] = ["足球", "CBA", "NBA", "韩篮甲", "NBL"];
type MatchRow = any;

function getCoverage(m: MatchRow) {
  const required = Math.max(1, Number(m.required_anchor_count || 1));
  const assigned = Number(m.scheduled_assignment_count ?? m.assignment_count ?? m.total_assignment_count ?? 0);
  const pending = Number(m.pending_application_count ?? m.pending_count ?? 0);
  const approved = Number(m.approved_application_count ?? m.approved_count ?? 0);
  return { required, assigned, pending, approved, gap: Math.max(0, required - assigned) };
}

function matchSearch(m: MatchRow) {
  return [m.league_name, m.home_team, m.away_team, m.category, m.kickoff_time].map(String).join(" ").toLowerCase();
}

export default function ManageMatches() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [dateRange, setDateRange] = useState<{ start: string; end: string; label?: string } | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [leagues, setLeagues] = useState<{ league_name: string; match_count: number }[]>([]);
  const [teamPool, setTeamPool] = useState<string[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>("足球");
  const [keyword, setKeyword] = useState("");
  const [focus, setFocus] = useState<"all" | "open" | "closed" | "anomaly" | "shortage">("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const fetchIdRef = useRef(0);

  const isBasketball = category !== "足球";
  const showMatchDate = Boolean(dateRange);
  const filterItems = isBasketball ? selectedTeams : selectedLeagues;

  // All requests fire in parallel: leagues + teams (optional) + matches
  const fetchAll = useCallback(async (opts?: { skipLeagues?: boolean }) => {
    const rid = ++fetchIdRef.current;
    const catQ = `category=${encodeURIComponent(category)}`;
    const dq = dateRange ? `start_date=${dateRange.start}&end_date=${dateRange.end}` : `date=${date}`;

    if (!opts?.skipLeagues) setLeaguesLoading(true);
    setLoading(true);

    const leaguePromise = !opts?.skipLeagues
      ? api.get(`/matches/leagues?${catQ}&${dq}&include_count=1`).catch(() => null)
      : Promise.resolve(null);
    const teamPromise = (!opts?.skipLeagues && isBasketball)
      ? api.get(`/matches/teams?${catQ}`).catch(() => null)
      : Promise.resolve(null);
    const matchPromise = api.get(`/matches?${dq}&${catQ}`).catch(() => null);

    const [leagueRes, teamRes, matchRes] = await Promise.all([leaguePromise, teamPromise, matchPromise]);

    if (rid !== fetchIdRef.current) return;

    if (!opts?.skipLeagues) {
      setLeagues(leagueRes && Array.isArray(leagueRes.data) ? leagueRes.data : []);
      setTeamPool(teamRes && Array.isArray(teamRes.data) ? teamRes.data : []);
      setLeaguesLoading(false);
    }

    const all: MatchRow[] = matchRes && Array.isArray(matchRes.data) ? matchRes.data : [];
    setMatches([...all].sort((a, b) => sortDir === "asc" ? compareMatchesBusinessAsc(a, b) : compareMatchesBusinessDesc(a, b)));
    setLoading(false);
  }, [category, date, dateRange, sortDir, isBasketball]);

  // Fetch all when key params change
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Clean up selected IDs when matches change
  useEffect(() => { setSelectedIds((p) => p.filter((id) => matches.some((m) => Number(m.id) === id))); }, [matches]);

  const switchCategory = (c: Category) => {
    setCategory(c);
    setSelectedLeagues([]);
    setSelectedTeams([]);
    setFocus("all");
    setKeyword("");
    setDateRange(null);
    setSelectedIds([]);
  };

  const toggleFilter = (v: string) => {
    const setter = isBasketball ? setSelectedTeams : setSelectedLeagues;
    setter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };

  // Client-side filtering (leagues/teams + focus + keyword)
  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return matches.filter((m) => {
      // League/team filter
      if (!isBasketball && selectedLeagues.length > 0 && !selectedLeagues.includes(m.league_name)) return false;
      if (isBasketball && selectedTeams.length > 0 && !selectedTeams.includes(m.home_team) && !selectedTeams.includes(m.away_team)) return false;
      // Keyword
      if (kw && !matchSearch(m).includes(kw)) return false;
      // Focus
      if (focus === "open") return m.is_open && !isMatchApplicationEnded(m);
      if (focus === "closed") return !m.is_open || isMatchApplicationEnded(m);
      if (focus === "anomaly") return getMatchAnomalies(m).length > 0;
      if (focus === "shortage") return !isMatchApplicationEnded(m) && getCoverage(m).gap > 0;
      return true;
    });
  }, [matches, selectedLeagues, selectedTeams, isBasketball, focus, keyword]);

  const stats = useMemo(() => {
    // Stats based on league/team filtered matches (not focus-filtered)
    const base = matches.filter((m) => {
      if (!isBasketball && selectedLeagues.length > 0 && !selectedLeagues.includes(m.league_name)) return false;
      if (isBasketball && selectedTeams.length > 0 && !selectedTeams.includes(m.home_team) && !selectedTeams.includes(m.away_team)) return false;
      return true;
    });
    const open = base.filter((m) => m.is_open && !isMatchApplicationEnded(m)).length;
    const anomaly = base.filter((m) => getMatchAnomalies(m).length > 0).length;
    const shortage = base.filter((m) => !isMatchApplicationEnded(m) && getCoverage(m).gap > 0).length;
    return { total: base.length, open, anomaly, shortage };
  }, [matches, selectedLeagues, selectedTeams, isBasketball]);

  const actionable = useMemo(() => visible.filter((m) => !isMatchApplicationEnded(m)), [visible]);
  const selected = useMemo(() => visible.filter((m) => selectedIds.includes(Number(m.id))), [visible, selectedIds]);
  const allSelected = actionable.length > 0 && actionable.every((m) => selectedIds.includes(Number(m.id)));
  const selOpen = selected.filter((m) => !!m.is_open && !isMatchApplicationEnded(m)).length;
  const selClosed = selected.filter((m) => !m.is_open && !isMatchApplicationEnded(m)).length;

  const toggleOpen = async (m: MatchRow) => {
    setMsg(null);
    try {
      const next = !m.is_open;
      const res = await api.put(`/matches/${m.id}`, { is_open: next, required_anchor_count: m.required_anchor_count, apply_deadline: m.apply_deadline, priority: m.priority, admin_note: m.admin_note });
      setMsg({ type: "success", text: `${m.home_team} vs ${m.away_team} 已${next ? "开启" : "关闭"}报名${res.data?.apply_deadline ? `，截止 ${formatApplyDeadline(res.data.apply_deadline)}` : ""}` });
      fetchAll({ skipLeagues: true });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.response?.data?.error || "操作失败" });
    }
  };

  const bulkOpen = async (nextOpen: boolean) => {
    const targets = selected.filter((m) => !isMatchApplicationEnded(m) && Boolean(m.is_open) !== nextOpen);
    if (!targets.length) return;
    setBulkLoading(true); setMsg(null);
    try {
      const res = await api.put("/matches/batch-open-state", { ids: targets.map((m) => Number(m.id)), is_open: nextOpen });
      setSelectedIds([]);
      const ok = res.data?.success_ids?.length || targets.length;
      const fail = res.data?.failed_ids?.length || 0;
      setMsg({ type: fail > 0 ? "error" : "success", text: `批量${nextOpen ? "开启" : "关闭"} ${ok} 场${fail > 0 ? `，失败 ${fail}` : ""}` });
      fetchAll({ skipLeagues: true });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.response?.data?.error || "批量操作失败" });
    } finally { setBulkLoading(false); }
  };

  const toggleSelectAll = () => {
    if (allSelected) { setSelectedIds((p) => p.filter((id) => !actionable.some((m) => Number(m.id) === id))); }
    else { const s = new Set(selectedIds); actionable.forEach((m) => s.add(Number(m.id))); setSelectedIds([...s]); }
  };

  const FOCUS_OPTS = [
    { key: "all" as const, label: "全部", count: stats.total },
    { key: "open" as const, label: "开放中", count: stats.open },
    { key: "anomaly" as const, label: "异常", count: stats.anomaly },
    { key: "shortage" as const, label: "缺主播", count: stats.shortage },
    { key: "closed" as const, label: "未开放", count: stats.total - stats.open },
  ];

  const filterList = isBasketball
    ? [...teamPool].sort((a, b) => a.localeCompare(b, "zh"))
    : [...leagues].sort((a, b) => a.league_name.localeCompare(b.league_name, "zh"));

  return (
    <div className="space-y-3 motion-rise pb-[calc(var(--mobile-floating-bar-offset)+7rem)] lg:pb-0">
      <section className="app-card p-4 md:p-5 space-y-3">
        {/* Header */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-stone-900 md:text-2xl">赛程管理</h1>
            <p className="mt-1 text-sm text-stone-500">{showMatchDate ? `${dateRange?.label || "区间"} ${dateRange?.start}–${dateRange?.end}` : `${date}`} · {category}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <DateQuickPicker value={date} onChange={setDate} onRangeChange={setDateRange} label="日期" />
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">搜索</label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="联赛 / 队伍" className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-stone-500" />
            </div>
          </div>
        </div>

        {/* Category tabs + sort */}
        <div className="flex gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => switchCategory(c)} className={"rounded-lg border px-3 py-1.5 text-sm font-medium transition " + (category === c ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400")}>{c}</button>
          ))}
          <div className="ml-auto">
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600">
              <option value="asc">近→远</option>
              <option value="desc">远→近</option>
            </select>
          </div>
        </div>

        {/* League/team filter */}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-600">{isBasketball ? "队伍筛选" : "联赛筛选"}{filterItems.length > 0 ? ` (已选 ${filterItems.length})` : ""}</span>
            {filterItems.length > 0 && <button onClick={() => isBasketball ? setSelectedTeams([]) : setSelectedLeagues([])} className="text-xs text-sky-700">清空</button>}
          </div>
          {leaguesLoading ? (
            <div className="flex gap-1.5"><div className="skeleton h-7 w-16 rounded-full" /><div className="skeleton h-7 w-20 rounded-full" /><div className="skeleton h-7 w-14 rounded-full" /><div className="skeleton h-7 w-24 rounded-full" /></div>
          ) : filterList.length === 0 ? (
            <div className="text-xs text-stone-400">当前日期无{isBasketball ? "队伍" : "联赛"}数据</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {filterList.map((item) => {
                const v = isBasketball ? String(item) : (item as any).league_name;
                const label = isBasketball ? String(item) : `${(item as any).league_name} (${(item as any).match_count})`;
                const on = filterItems.includes(v);
                return <button key={v} onClick={() => toggleFilter(v)} className={"rounded-full border px-2.5 py-1 text-xs transition " + (on ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300")}>{label}</button>;
              })}
            </div>
          )}
        </div>

        {/* Focus buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {FOCUS_OPTS.map((f) => (
            <button key={f.key} onClick={() => setFocus(f.key)} className={"inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition " + (focus === f.key ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400")}>
              {f.label} <span className={"text-[11px] " + (focus === f.key ? "text-white/70" : "text-stone-400")}>{f.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Banner */}
      {msg && (
        <div className={"rounded-xl border px-4 py-2.5 text-sm " + (msg.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
          <div className="flex items-center justify-between">{msg.text}<button onClick={() => setMsg(null)} className="text-xs opacity-60 hover:opacity-100">关闭</button></div>
        </div>
      )}

      {/* Table */}
      <section className="app-card overflow-hidden">
        <div className="border-b border-stone-200 bg-stone-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAll} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700">{allSelected ? "取消全选" : "全选"}</button>
            <span className="text-xs text-stone-500">已选 {selected.length} · 可见 {visible.length}</span>
          </div>
          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => bulkOpen(true)} disabled={bulkLoading || selClosed === 0} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40">批量开放{selClosed > 0 ? ` (${selClosed})` : ""}</button>
              <button onClick={() => bulkOpen(false)} disabled={bulkLoading || selOpen === 0} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-40">批量关闭{selOpen > 0 ? ` (${selOpen})` : ""}</button>
              <button onClick={() => setSelectedIds([])} className="text-xs text-stone-500">清空</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3"><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-12 rounded-lg" /></div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">当前筛选下暂无赛程</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/60 text-xs font-semibold text-stone-500">
                    <th className="w-10 px-3 py-2.5 text-left" />
                    <th className="w-[120px] px-3 py-2.5 text-left">时间</th>
                    <th className="px-3 py-2.5 text-left">赛事</th>
                    <th className="w-[100px] px-3 py-2.5 text-left">报名</th>
                    <th className="w-[80px] px-3 py-2.5 text-left">排班</th>
                    <th className="w-[140px] px-3 py-2.5 text-left">提示</th>
                    <th className="w-[100px] px-3 py-2.5 text-left">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {visible.map((m) => {
                    const cov = getCoverage(m);
                    const sig = getAdminMatchSignals(m);
                    const anomalies = getMatchAnomalies(m);
                    const ended = isMatchApplicationEnded(m);
                    const sel = selectedIds.includes(Number(m.id));
                    return (
                      <tr key={m.id} className={"align-top transition " + (sel ? "bg-stone-50" : "hover:bg-stone-50/50")}>
                        <td className="px-3 py-3"><input type="checkbox" checked={sel} disabled={ended} onChange={() => setSelectedIds((p) => sel ? p.filter((x) => x !== Number(m.id)) : [...p, Number(m.id)])} className="h-4 w-4 rounded border-stone-300" /></td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-stone-900">{showMatchDate ? `${String(m.match_date || "").slice(4, 6)}-${String(m.match_date || "").slice(6)} ` : ""}{m.kickoff_time === "00:00" ? "时间待定" : (m.kickoff_time || "--")}</div>
                          <div className="mt-1"><span className={"chip " + sig.businessStatusClass}>{sig.businessStatus}</span></div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[11px] text-stone-400">{m.league_name} · {m.category || "足球"}</div>
                          <div className="mt-0.5 font-semibold text-stone-900">{m.home_team || "待定"} <span className="text-stone-400">vs</span> {m.away_team || "待定"}</div>
                          <div className="mt-1 text-xs text-stone-500">截止 {sig.deadlineLabel}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={"chip " + (m.is_open && !ended ? "chip-open" : "chip-neutral")}>{m.is_open && !ended ? "报名中" : ended ? "已结束" : "未开放"}</span>
                          {cov.pending > 0 && <div className="mt-1 text-xs text-amber-700">待审 {cov.pending}</div>}
                        </td>
                        <td className="px-3 py-3"><span className={cov.gap > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>{cov.assigned}/{cov.required}</span></td>
                        <td className="px-3 py-3">
                          {anomalies.length > 0 ? <div className="space-y-0.5 text-xs text-red-700">{anomalies.map((a: string) => <div key={a}>⚠ {a}</div>)}</div> : <div className="text-xs text-stone-500">{sig.kickoffAlert}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => toggleOpen(m)} disabled={ended} className={"w-full rounded-lg px-3 py-2 text-xs font-semibold " + (ended ? "bg-stone-100 text-stone-400" : m.is_open ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-sky-50 text-sky-700 hover:bg-sky-100")}>
                            {ended ? "已结束" : m.is_open ? "关闭" : "开放"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="space-y-2 p-3 lg:hidden">
              {visible.map((m) => {
                const cov = getCoverage(m);
                const sig = getAdminMatchSignals(m);
                const anomalies = getMatchAnomalies(m);
                const ended = isMatchApplicationEnded(m);
                const sel = selectedIds.includes(Number(m.id));
                return (
                  <div key={m.id} className={"rounded-2xl border p-3.5 " + (sel ? "border-stone-800 bg-stone-50" : "border-stone-200 bg-white")}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={sel} disabled={ended} onChange={() => setSelectedIds((p) => sel ? p.filter((x) => x !== Number(m.id)) : [...p, Number(m.id)])} className="mt-1 h-5 w-5 rounded border-stone-300" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                          <span className="font-medium text-stone-700">{m.kickoff_time === "00:00" ? "时间待定" : (m.kickoff_time || "--")}</span>
                          <span className={"chip " + sig.businessStatusClass}>{sig.businessStatus}</span>
                          <span className="chip chip-neutral">{m.category || "足球"}</span>
                        </div>
                        <div className="mt-1.5 text-[15px] font-semibold text-stone-900">{m.home_team || "待定"} <span className="text-stone-400">vs</span> {m.away_team || "待定"}</div>
                        <div className="mt-0.5 text-xs text-stone-500">{m.league_name}</div>
                      </div>
                      <button onClick={() => !ended && toggleOpen(m)} disabled={ended} className={"shrink-0 rounded-xl px-3 py-2 text-sm font-semibold " + (ended ? "bg-stone-100 text-stone-400" : m.is_open ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700")}>
                        {ended ? "已结束" : m.is_open ? "关闭" : "开放"}
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                      <span className={cov.gap > 0 ? "chip chip-danger" : "chip chip-approved"}>{cov.gap > 0 ? `缺 ${cov.gap} 人` : "已排满"}</span>
                      <span className="chip chip-neutral">排班 {cov.assigned}/{cov.required}</span>
                      {cov.pending > 0 && <span className="chip chip-warning">待审 {cov.pending}</span>}
                      {anomalies.length > 0 && <span className="chip chip-danger">异常 {anomalies.length}</span>}
                    </div>
                    <div className="mt-2 text-[11px] text-stone-500">截止 {sig.deadlineLabel} · {sig.kickoffAlert}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Mobile floating bar */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-[var(--mobile-floating-bar-offset)] z-30 px-3 lg:hidden">
          <div className="mx-auto flex max-w-screen-sm items-center gap-2 rounded-2xl border border-stone-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-stone-900">已选 {selected.length}</div>
              <div className="text-xs text-stone-500">开放 {selOpen} · 待开放 {selClosed}</div>
            </div>
            <button onClick={() => bulkOpen(true)} disabled={bulkLoading || selClosed === 0} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-40">开放</button>
            <button onClick={() => bulkOpen(false)} disabled={bulkLoading || selOpen === 0} className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40">关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
