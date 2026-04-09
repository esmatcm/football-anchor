import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { parseMatchKickoff } from "../../lib/matchTime";

type Match = {
  id: number;
  match_date: string;
  kickoff_time: string;
  league_name: string;
  home_team: string;
  away_team: string;
  is_open: number;
  category?: string;
  required_anchor_count?: number;
  approved_count?: number;
  pending_count?: number;
  approved_anchors?: string;
  anchor_details?: { name: string; site_name: string | null; site_code: string | null }[];
};

const SITE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  jyb: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  ga: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300' },
};

const CATEGORIES = ["全部", "足球", "CBA", "NBA", "韩篮甲", "NBL", "新西联"] as const;

function getStatusTag(kickoff: string, dateYmd: string) {
  const dt = parseMatchKickoff(dateYmd, kickoff);
  if (!dt) return "upcoming" as const;
  const diff = Math.floor((dt.getTime() - Date.now()) / 60000);
  if (diff > 30) return "upcoming" as const;
  if (diff > 0) return "imminent" as const;
  if (diff > -120) return "live" as const;
  return "ended" as const;
}

function kickoffToMinutes(kickoff: string): number | null {
  const m = kickoff?.match(/(\d+):(\d+)/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function coverageTone(approved: number, required: number) {
  if (approved >= required) return "ok" as const;
  if (approved > 0) return "partial" as const;
  return "empty" as const;
}

export default function DailyOverview() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORIES)[number]>("全部");

  const fetchData = async (d: string) => {
    setLoading(true);
    try {
      const r = await api.get(`/applications/day-overview?date=${d}`);
      setMatches(Array.isArray(r.data) ? r.data : []);
    } catch { setMatches([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(date); }, [date]);
  useEffect(() => { const t = setInterval(() => fetchData(date), 60000); return () => clearInterval(t); }, [date]);

  const isToday = date === getBeijingTodayYmd();

  const filteredMatches = useMemo(() => {
    if (categoryFilter === "全部") return matches;
    return matches.filter((m) => String(m.category || "足球") === categoryFilter);
  }, [matches, categoryFilter]);

  const stats = useMemo(() => {
    const total = filteredMatches.length;
    const filled = filteredMatches.filter((m) => Number(m.approved_count || 0) >= Math.max(1, Number(m.required_anchor_count || 1))).length;
    const gap = total - filled;
    const pend = filteredMatches.filter((m) => Number(m.pending_count || 0) > 0).length;
    const anchors = filteredMatches.reduce((s, m) => s + Number(m.approved_count || 0), 0);
    const live = filteredMatches.filter((m) => getStatusTag(m.kickoff_time, date) === "live").length;
    return { total, filled, gap, pend, anchors, live };
  }, [filteredMatches, date]);

  const categoryCounts = matches.reduce<Record<string, number>>((acc, m) => {
    const cat = String(m.category || "足球");
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // Group matches by time slot
  const grouped = useMemo(() => {
    const sorted = [...filteredMatches].sort((a, b) => {
      const ma = kickoffToMinutes(a.kickoff_time);
      const mb = kickoffToMinutes(b.kickoff_time);
      return (ma ?? 9999) - (mb ?? 9999);
    });
    const groups: { time: string; minutes: number; items: Match[] }[] = [];
    let cur = "";
    for (const m of sorted) {
      const t = m.kickoff_time || "??:??";
      if (t !== cur) {
        cur = t;
        groups.push({ time: t, minutes: kickoffToMinutes(t) ?? 0, items: [] });
      }
      groups[groups.length - 1].items.push(m);
    }
    return groups;
  }, [filteredMatches]);

  const nowMinutes = useMemo(() => {
    if (!isToday) return null;
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }, [isToday]);

  const nowTime = useMemo(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }, []);

  // Calculate which hours have matches
  const activeHours = useMemo(() => {
    const hours = new Set<number>();
    for (const m of filteredMatches) {
      const mins = kickoffToMinutes(m.kickoff_time);
      if (mins !== null) {
        const h = Math.floor(mins / 60);
        hours.add(h);
        if (h > 0) hours.add(h - 1);
        if (h < 23) hours.add(h + 1);
      }
    }
    if (nowMinutes !== null) {
      const nowH = Math.floor(nowMinutes / 60);
      hours.add(nowH);
    }
    return hours;
  }, [filteredMatches, nowMinutes]);

  // Build visible hour slots
  const hourSlots = useMemo(() => {
    if (filteredMatches.length === 0) return [];
    const sorted = Array.from(activeHours).sort((a, b) => a - b);
    if (sorted.length === 0) return [];
    const slots: { hour: number; isCollapse?: boolean; collapseFrom?: number; collapseTo?: number }[] = [];
    let prev = -1;
    for (const h of sorted) {
      if (prev >= 0 && h - prev > 1) {
        slots.push({ hour: -1, isCollapse: true, collapseFrom: prev + 1, collapseTo: h - 1 });
      }
      slots.push({ hour: h });
      prev = h;
    }
    return slots;
  }, [activeHours, filteredMatches]);

  return (
    <div className="space-y-5 motion-rise">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900 md:text-2xl">
            {isToday ? "今日赛事总览" : `${date} 赛事总览`}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {isToday ? `当前时间 ${nowTime}，数据每分钟自动刷新` : "查看历史日期的赛事排班情况"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && stats.live > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" /></span>
              {stats.live} 场直播中
            </span>
          )}
          <DateQuickPicker value={date} onChange={setDate} label="" hideLabel compact />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs text-stone-500">全部赛程</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="text-xs text-emerald-600">已排满</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{stats.filled}</div>
          {stats.total > 0 && <div className="mt-0.5 text-xs text-emerald-600/70">{Math.round((stats.filled / stats.total) * 100)}%</div>}
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stats.gap > 0 ? "border-red-200 bg-red-50/60" : "border-stone-200 bg-stone-50"}`}>
          <div className={`text-xs ${stats.gap > 0 ? "text-red-600" : "text-stone-500"}`}>缺主播</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${stats.gap > 0 ? "text-red-700" : "text-stone-400"}`}>{stats.gap}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3">
          <div className="text-xs text-sky-600">已派主播</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-sky-700">{stats.anchors}</div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stats.pend > 0 ? "border-yellow-200 bg-yellow-50/60" : "border-stone-200 bg-stone-50"}`}>
          <div className={`text-xs ${stats.pend > 0 ? "text-yellow-600" : "text-stone-500"}`}>待审核</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${stats.pend > 0 ? "text-yellow-700" : "text-stone-400"}`}>{stats.pend}</div>
        </div>
      </div>

      {/* Category filter */}
      <div className="app-card p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-stone-500 shrink-0">分类</span>
          {CATEGORIES.map((cat) => {
            const count = cat === "全部" ? matches.length : (categoryCounts[cat] || 0);
            const active = categoryFilter === cat;
            return (
              <button key={cat} type="button" onClick={() => setCategoryFilter(cat)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${active ? "bg-stone-800 text-white border-stone-800 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}>
                <span>{cat}</span>
                <span className={`ml-0.5 text-[11px] tabular-nums ${active ? "text-white/70" : "text-stone-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 24-hour Timeline */}
      {loading ? (
        <div className="py-16 text-center text-stone-400">载入中...</div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-400">当天暂无已开放赛程</div>
      ) : (
        <div className="app-card overflow-hidden">
          <div className="p-4 border-b border-stone-200 bg-stone-50/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">24 小时时间轴</h3>
              <div className="flex items-center gap-3 text-[11px] text-stone-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />已排满</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" />部分</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />缺人</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 animate-pulse" />直播中</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-x-auto">
            <div className="min-w-[600px]">
              {hourSlots.map((slot, si) => {
                if (slot.isCollapse) {
                  return (
                    <div key={`c-${si}`} className="flex items-center h-8 border-b border-stone-100 bg-stone-50/50">
                      <div className="w-[72px] shrink-0 text-right pr-3 text-[11px] text-stone-300">...</div>
                      <div className="flex-1 text-center text-[11px] text-stone-300">
                        {String(slot.collapseFrom).padStart(2, "0")}:00 ~ {String(slot.collapseTo).padStart(2, "0")}:59 无赛事
                      </div>
                    </div>
                  );
                }

                const h = slot.hour;
                const hourLabel = `${String(h).padStart(2, "0")}:00`;
                const matchesInHour = grouped.filter((g) => Math.floor(g.minutes / 60) === h);
                const isNowHour = nowMinutes !== null && Math.floor(nowMinutes / 60) === h;
                const nowInHourPct = isNowHour ? ((nowMinutes! % 60) / 60) * 100 : 0;

                return (
                  <div key={h} className={`relative flex border-b border-stone-100 ${isNowHour ? "bg-red-50/30" : h % 2 === 0 ? "bg-white" : "bg-stone-50/40"}`}
                    style={{ minHeight: matchesInHour.length > 0 ? `${Math.max(60, matchesInHour.reduce((s, g) => s + g.items.length * 52 + 8, 0))}px` : "40px" }}>
                    {/* Hour label */}
                    <div className="w-[72px] shrink-0 border-r border-stone-200 flex items-start justify-end pr-3 pt-2">
                      <span className={`text-xs font-medium tabular-nums ${isNowHour ? "text-red-600 font-bold" : "text-stone-400"}`}>{hourLabel}</span>
                    </div>

                    {/* Now indicator */}
                    {isNowHour && (
                      <div className="absolute left-[72px] right-0 z-20 flex items-center pointer-events-none" style={{ top: `${nowInHourPct}%` }}>
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-[5px] ring-2 ring-red-200" />
                        <div className="flex-1 border-t-2 border-red-500 border-dashed" />
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-1">{nowTime}</span>
                      </div>
                    )}

                    {/* Match cards in this hour */}
                    <div className="flex-1 p-2 space-y-1.5">
                      {matchesInHour.map((group) =>
                        group.items.map((m) => {
                          const approved = Number(m.approved_count || 0);
                          const required = Math.max(1, Number(m.required_anchor_count || 1));
                          const pending = Number(m.pending_count || 0);
                          const tag = getStatusTag(m.kickoff_time, date);
                          const tone = coverageTone(approved, required);
                          const pct = Math.round((approved / required) * 100);
                          const anchorDetails = m.anchor_details || [];
                          const anchors = anchorDetails.length > 0
                            ? anchorDetails
                            : (m.approved_anchors ? m.approved_anchors.split("、").filter(Boolean).map((n: string) => ({ name: n, site_name: null, site_code: null })) : []);

                          return (
                            <div
                              key={m.id}
                              
                              
                              className={`relative flex items-stretch rounded-lg border transition-all cursor-default ${
                                tag === "live" ? "border-green-400 bg-green-50/80 ring-1 ring-green-200" :
                                tag === "imminent" ? "border-amber-300 bg-amber-50/50" :
                                tag === "ended" ? "border-stone-200 bg-stone-50/80 opacity-50" :
                                "border-stone-200 bg-white hover:shadow-sm"
                              }`}
                            >
                              {/* Left accent bar */}
                              <div className={`w-1 shrink-0 rounded-l-lg ${tone === "ok" ? "bg-emerald-500" : tone === "partial" ? "bg-yellow-400" : "bg-red-400"}`} />

                              <div className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2">
                                {/* Time */}
                                <div className={`shrink-0 text-base font-bold tabular-nums ${tag === "live" ? "text-green-600" : tag === "imminent" ? "text-amber-600" : tag === "ended" ? "text-stone-400" : "text-stone-700"}`}>
                                  {m.kickoff_time}
                                </div>

                                {/* Category badge */}
                                <span className="shrink-0 rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                                  {m.category || "足球"}
                                </span>

                                {/* Teams */}
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-stone-900 truncate">
                                    {m.home_team} <span className="text-stone-300 font-normal">vs</span> {m.away_team}
                                  </div>
                                  <div className="text-[11px] text-stone-500 truncate">{m.league_name}</div>
                                </div>

                                {/* Coverage bar */}
                                <div className="shrink-0 w-[100px] hidden sm:block">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-[11px] font-bold tabular-nums ${tone === "ok" ? "text-emerald-600" : tone === "partial" ? "text-yellow-600" : "text-red-600"}`}>
                                      {approved}/{required}
                                    </span>
                                    {pending > 0 && <span className="text-[10px] text-yellow-600">{pending}待审</span>}
                                  </div>
                                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${tone === "ok" ? "bg-emerald-500" : tone === "partial" ? "bg-yellow-400" : "bg-red-400"}`}
                                      style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                </div>

                                {/* Anchors */}
                                <div className="shrink-0 hidden lg:flex items-center gap-1 max-w-[200px] flex-wrap">
                                  {anchors.slice(0, 3).map((a: any, i: number) => {
                                    const name = typeof a === 'string' ? a : a.name;
                                    const siteCode = typeof a === 'string' ? null : a.site_code;
                                    const siteName = typeof a === 'string' ? null : a.site_name;
                                    const sc = siteCode && SITE_COLORS[siteCode];
                                    return (
                                      <span key={i} className={"inline-flex items-center gap-0.5 rounded-full border pl-1 pr-1.5 py-0.5 text-[10px] " + (sc ? sc.border + ' ' + sc.bg + ' ' + sc.text : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                                        <span className={"w-1.5 h-1.5 rounded-full " + (sc ? (siteCode === 'jyb' ? 'bg-amber-400' : 'bg-sky-400') : 'bg-emerald-400')} />
                                        {name}{siteName && <span className="ml-0.5 text-[9px] opacity-70">[{siteName}]</span>}
                                      </span>
                                    );
                                  })}
                                  {anchors.length > 3 && <span className="text-[10px] text-stone-400">+{anchors.length - 3}</span>}
                                </div>

                                {/* Live indicator */}
                                {tag === "live" && (
                                  <span className="shrink-0 flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
                                  </span>
                                )}
                                {tag === "imminent" && (
                                  <span className="shrink-0 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700">即将</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
