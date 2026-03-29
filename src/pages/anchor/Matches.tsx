import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import {
  canApplyToMatch,
  compareMatchesBusinessAsc,
  formatApplyDeadline,
  isApplyDeadlinePassed,
} from "../../lib/matchTime";
import { EmptyStateBlock, InfoCard, InlineLinkCard, PageHero, SectionHeader, TableSectionHeader } from "../../components/opsUi";
import { APPLICATION_STATUS_LABELS, getApplicationTone, getAvailabilityLabel, getKickoffHint, getRecruitmentStatus, getRecruitmentTone } from "../../lib/anchorUi";

type CategoryKey = "全部" | "足球" | "CBA" | "NBA" | "韩篮甲";

const CATEGORY_OPTIONS: CategoryKey[] = ["全部", "足球", "CBA", "NBA", "韩篮甲"];

function MatchAction({ match, app, onApply, onCancel }: { match: any; app: any; onApply: (id: number) => void; onCancel: (id: number) => void; }) {
  const canApply = canApplyToMatch(match);
  const isPastDeadline = isApplyDeadlinePassed(match);
  const label = getAvailabilityLabel(match, canApply, isPastDeadline);

  if (app) {
    if (app.status === "pending" && canApply && !isPastDeadline) {
      return <button onClick={() => onCancel(match.id)} className="btn-danger tap-press w-full md:w-auto">取消报名</button>;
    }
    return <button disabled className="btn-secondary w-full md:w-auto opacity-60 cursor-not-allowed">已锁定</button>;
  }

  if (canApply) {
    return <button onClick={() => onApply(match.id)} className="btn-primary tap-press w-full md:w-auto">我要报名</button>;
  }

  return <button disabled className="btn-secondary w-full md:w-auto opacity-70 cursor-not-allowed">{label}</button>;
}

export default function AvailableMatches() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [matches, setMatches] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryKey>("全部");
  const [onlyRecruiting, setOnlyRecruiting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const categoryQuery = category === "全部" ? "" : `&category=${encodeURIComponent(category)}`;
      const [matchesRes, appsRes] = await Promise.all([
        api.get(`/matches?date=${date}${categoryQuery}`),
        api.get("/applications/my"),
      ]);
      const sortedMatches = Array.isArray(matchesRes.data)
        ? [...matchesRes.data].sort(compareMatchesBusinessAsc)
        : [];
      setMatches(sortedMatches);
      setMyApps(Array.isArray(appsRes.data) ? appsRes.data : []);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.error || "赛程加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date, category]);

  const handleApply = async (matchId: number) => {
    try {
      await api.post("/applications/apply", { match_id: matchId });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "报名失败");
    }
  };

  const handleCancel = async (matchId: number) => {
    try {
      await api.delete(`/applications/apply/${matchId}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "取消失败");
    }
  };

  const appMap = useMemo(() => new Map<number, any>(myApps.map((app: any) => [app.match_id, app])), [myApps]);

  const visibleMatches = useMemo(() => {
    return matches.filter((match) => (onlyRecruiting ? canApplyToMatch(match) : true));
  }, [matches, onlyRecruiting]);

  const stats = useMemo(() => {
    const total = matches.length;
    const open = matches.filter((match) => canApplyToMatch(match)).length;
    const soon = matches.filter((match) => getRecruitmentStatus(match) === "即将截止").length;
    const mine = matches.filter((match) => appMap.has(match.id)).length;
    const waiting = myApps.filter((item: any) => item.status === "pending").length;
    const approved = myApps.filter((item: any) => item.status === "approved").length;
    const activeFilterTotal = visibleMatches.length;
    return { total, open, soon, mine, waiting, approved, activeFilterTotal };
  }, [matches, visibleMatches, appMap, myApps]);

  const nextActionMatch = useMemo(() => {
    const pendingMine = visibleMatches.find((match) => {
      const app = appMap.get(match.id);
      return app?.status === "pending" && canApplyToMatch(match) && !isApplyDeadlinePassed(match);
    });
    if (pendingMine) return pendingMine;
    return visibleMatches.find((match) => canApplyToMatch(match)) || null;
  }, [visibleMatches, appMap]);

  const filterSummary = useMemo(() => {
    const parts = [date, category === "全部" ? "全分类" : category];
    if (onlyRecruiting) parts.push("仅可报名");
    return parts.join(" · ");
  }, [date, category, onlyRecruiting]);

  return (
    <div className="space-y-6 motion-rise">
      <PageHero
        eyebrow="主播赛程中心"
        title="赛程列表"
        description="按日期与分类筛选可报名场次，查看报名状态"
        tone="sky"
        stats={[
          { label: "今日总场次", value: stats.total, tone: "neutral" },
          { label: "当前可报名", value: stats.open, tone: "success" },
          { label: "即将截止", value: stats.soon, tone: "warning" },
          { label: "我的报名", value: stats.mine, tone: "info" },
        ]}
      />


      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="app-card p-4 md:p-5 space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <DateQuickPicker value={date} onChange={setDate} label="比赛日期" />

            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-end">
              <div className="grid grid-cols-4 gap-1.5 lg:flex lg:flex-wrap lg:gap-2">
                {CATEGORY_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`rounded-xl border px-0 py-2 text-[13px] font-medium leading-none transition lg:rounded-full lg:px-4 lg:text-sm ${category === item ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-[13px] text-stone-700 lg:rounded-full lg:px-4 lg:text-sm">
                <input type="checkbox" checked={onlyRecruiting} onChange={(e) => setOnlyRecruiting(e.target.checked)} />
                只看当前可报名
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InfoCard label="当前筛选" value={filterSummary} hint={`筛选后共 ${stats.activeFilterTotal} 场`} />
            <InfoCard label="待审核报名" value={stats.waiting} hint="有待审核时，别把它误当成已排班" />
            <InfoCard label="已通过报名" value={stats.approved} hint="通过后更应该去看我的排班确认执行" />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="chip chip-open">可报名：已开放且离截止 / 开赛超过 90 分钟</span>
            <span className="chip chip-warning">即将截止：进入 90 分钟内</span>
            <span className="chip chip-neutral">你的报名状态会覆盖显示在业务状态之上</span>
          </div>
        </div>

        <div className="app-card p-4 md:p-5 space-y-4">
          <SectionHeader title="下一步动作" description="和 Dashboard / 我的排班保持同一层级：先告诉你现在该点哪页。" />

          <InfoCard
            label="当前优先建议"
            value={nextActionMatch ? `${nextActionMatch.home_team} vs ${nextActionMatch.away_team}` : "当前没有需要立刻处理的可报名场次"}
            hint={nextActionMatch
              ? `${getRecruitmentStatus(nextActionMatch)} · ${getKickoffHint(nextActionMatch)} · 截止 ${formatApplyDeadline(nextActionMatch.apply_deadline)}`
              : stats.waiting > 0
                ? "你有待审核报名，建议先等结果并留意我的排班。"
                : "当前筛选下没有可报名场次，可以切换日期或回我的排班确认执行。"}
            tone="info"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <InlineLinkCard to="/anchor" title="回主播首页" description="先看报名快照和最近一场，再决定是否继续抢场。" />
            <InlineLinkCard to="/anchor/schedule" title="去我的排班" description="如果已有通过 / 待执行场次，优先确认执行安排。" />
          </div>
        </div>
      </section>

      {error ? <div className="state-empty text-red-600">{error}</div> : null}

      <section className="space-y-3 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="app-card p-4"><div className="skeleton h-32" /></div>)
        ) : visibleMatches.length === 0 ? (
          <div className="state-empty">
            <div className="text-sm font-medium text-stone-700">当前筛选下暂无赛程</div>
            <div className="mt-2 text-xs text-stone-500">可以切换日期 / 分类，或关闭“只看当前可报名”重新查看。</div>
          </div>
        ) : (
          visibleMatches.map((match) => {
            const app = appMap.get(match.id);
            const canApply = canApplyToMatch(match);
            const isPastDeadline = isApplyDeadlinePassed(match);
            const recruitmentStatus = getRecruitmentStatus(match);
            const businessTone = getRecruitmentTone(match);
            const applicationTone = getApplicationTone(app?.status);
            const availabilityLabel = getAvailabilityLabel(match, canApply, isPastDeadline);

            return (
              <article key={match.id} className={`app-card p-4 space-y-4 ${canApply ? "ring-1 ring-sky-200" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span>{match.league_name || "未分类联赛"}</span>
                      <span>·</span>
                      <span>{match.category || "足球"}</span>
                    </div>
                    <div className="mt-1 text-base font-semibold text-stone-900 leading-6">{match.home_team} vs {match.away_team}</div>
                  </div>
                  <span className={`chip ${app ? applicationTone : businessTone}`}>{app ? (APPLICATION_STATUS_LABELS[app.status] || app.status) : recruitmentStatus}</span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`chip ${businessTone}`}>业务状态：{recruitmentStatus}</span>
                  <span className={`chip ${canApply ? "chip-open" : "chip-neutral"}`}>{availabilityLabel}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                    <div className="text-[11px] text-stone-500">开赛时间</div>
                    <div className="mt-1 font-medium text-stone-900">{match.kickoff_time}</div>
                    <div className="mt-1 text-[11px] text-stone-500">{getKickoffHint(match)}</div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                    <div className="text-[11px] text-stone-500">报名截止</div>
                    <div className="mt-1 font-medium text-stone-900">{formatApplyDeadline(match.apply_deadline)}</div>
                    <div className="mt-1 text-[11px] text-stone-500">与管理端使用同一截止口径</div>
                  </div>
                </div>

                {app?.review_note ? (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600 whitespace-pre-wrap">
                    备注：{app.review_note}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-stone-500">
                    {app
                      ? app.status === "pending"
                        ? "已提交报名，等待审核结果"
                        : app.status === "approved"
                          ? "报名已通过，建议去我的排班确认执行"
                          : app.status === "rejected"
                            ? "该场报名未通过，可继续查看其他场次"
                            : "已存在报名记录"
                      : canApply
                        ? "当前仍在可报名窗口内"
                        : "当前不可再提交报名"}
                  </div>
                  <MatchAction match={match} app={app} onApply={handleApply} onCancel={handleCancel} />
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="hidden md:block app-card overflow-hidden">
        <TableSectionHeader
          title="赛程明细"
          description="业务状态、个人报名状态、时间提醒和动作都放在同一行，减少来回判断。"
          meta={`共 ${visibleMatches.length} 场`}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50/90">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">赛事 / 对阵</th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">时间信息</th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">状态层级</th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">说明</th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white/80">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-stone-500">载入中...</td></tr>
              ) : visibleMatches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-stone-500">
                    当前筛选下暂无赛程，可切换日期 / 分类重新查看。
                  </td>
                </tr>
              ) : (
                visibleMatches.map((match) => {
                  const app = appMap.get(match.id);
                  const canApply = canApplyToMatch(match);
                  const isPastDeadline = isApplyDeadlinePassed(match);
                  const recruitmentStatus = getRecruitmentStatus(match);
                  const businessTone = getRecruitmentTone(match);
                  const applicationTone = getApplicationTone(app?.status);
                  const availabilityLabel = getAvailabilityLabel(match, canApply, isPastDeadline);

                  return (
                    <tr key={match.id} className={canApply ? "bg-sky-50/40" : ""}>
                      <td className="px-5 py-4 align-top">
                        <div className="text-xs text-stone-500">{match.league_name || "未分类联赛"}</div>
                        <div className="mt-1 text-sm font-semibold text-stone-900">{match.home_team} vs {match.away_team}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="chip chip-neutral">{match.category || "足球"}</span>
                          <span className={`chip ${canApply ? "chip-open" : "chip-neutral"}`}>{availabilityLabel}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-stone-700">
                        <div className="font-medium text-stone-900">开赛：{match.kickoff_time}</div>
                        <div className="mt-1">截止：{formatApplyDeadline(match.apply_deadline)}</div>
                        <div className="mt-2 text-xs text-stone-500">{getKickoffHint(match)}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col items-start gap-2">
                          <span className={`chip ${businessTone}`}>业务：{recruitmentStatus}</span>
                          <span className={`chip ${app ? applicationTone : "chip-neutral"}`}>{app ? `我的报名：${APPLICATION_STATUS_LABELS[app.status] || app.status}` : "我的报名：未提交"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-stone-600">
                        {app?.review_note ? (
                          <div className="max-w-[280px] whitespace-pre-wrap">备注：{app.review_note}</div>
                        ) : app ? (
                          <div className="max-w-[280px]">
                            {app.status === "approved"
                              ? "该场报名已通过，建议去我的排班确认是否已进入执行。"
                              : app.status === "pending"
                                ? "已提交报名，等待管理员审核。"
                                : app.status === "rejected"
                                  ? "该场报名未通过，可以继续查看其他可报名场次。"
                                  : "你已对这场提交过报名记录。"}
                          </div>
                        ) : (
                          <div className="max-w-[280px]">
                            {canApply ? "当前仍在可报名窗口内。" : `${availabilityLabel}，本场当前不可再提交报名。`}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top text-sm">
                        <div className="flex min-w-[132px] flex-col gap-2">
                          <MatchAction match={match} app={app} onApply={handleApply} onCancel={handleCancel} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
