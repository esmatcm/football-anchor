import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { addDays, format, parse, startOfMonth, startOfWeek } from "date-fns";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { MetricCard } from "../../components/opsUi";

export default function AnchorMonthlyStats() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [monthDate, setMonthDate] = useState(getBeijingTodayYmd());
  const [detail, setDetail] = useState<any>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [metric, setMetric] = useState<"approved" | "completed">("approved");
  const [banner, setBanner] = useState<{ type: string; text: string } | null>(null);

  const monthKey = useMemo(() => monthDate.slice(0, 6), [monthDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/stats/anchor-monthly?month=${monthKey}&metric=${metric}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "读取月统计失败" });
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (row: any) => {
    try {
      const res = await api.get(`/stats/anchor-monthly/${row.user_id}/details?month=${monthKey}&metric=${metric}`);
      setDetail(res.data);
      setDetailTitle(`${row.nickname} (${row.username})`);
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "读取主播明细失败" });
    }
  };

  useEffect(() => {
    fetchData();
  }, [monthKey, metric]);

  const rows = data?.rows || [];

  const summary = useMemo(() => {
    const totalFee = rows.reduce((sum: number, r: any) => sum + Number(r.current?.fee || 0), 0);
    const totalMatches = rows.reduce((sum: number, r: any) => sum + Number(r.current?.success_matches || 0), 0);
    const totalAnchors = rows.length;
    const activeAnchors = rows.filter((r: any) => Number(r.current?.success_matches || 0) > 0).length;
    return { totalFee, totalMatches, totalAnchors, activeAnchors };
  }, [rows]);

  const exportCsv = () => {
    const header = ["主播", "账号", "本月有效报名日期数", "本月有效报名场次", "本月可领费用", "上月有效报名日期数", "上月有效报名场次", "上月可领费用"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        `"${r.nickname}"`,
        `"${r.username}"`,
        r.current.success_days,
        r.current.success_matches,
        r.current.fee,
        r.previous.success_days,
        r.previous.success_matches,
        r.previous.fee,
      ].join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly_stats_${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderDetailCalendar = () => {
    if (!detail?.month) return null;
    const monthDate = parse(detail.month + "01", "yyyyMMdd", new Date());
    const monthStart = startOfMonth(monthDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const rowMap: Record<string, any> = {};
    for (const r of detail.rows || []) rowMap[r.match_date] = r;

    return (
      <div>
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d) => {
            const ymd = format(d, "yyyyMMdd");
            const inMonth = d.getMonth() === monthDate.getMonth();
            const rec = rowMap[ymd];
            return (
              <div key={ymd} className={`min-h-[92px] rounded-2xl border p-2 ${inMonth ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50 text-stone-300"}`}>
                <div className="text-xs font-medium">{d.getDate()}</div>
                {rec ? (
                  <div className="mt-2 space-y-1 text-[11px] text-stone-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sky-700">{rec.success_matches} 场</div>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-500">统计只读</span>
                    </div>
                    <div className="whitespace-pre-wrap line-clamp-4 text-stone-500">{String(rec.matches || "")}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 motion-rise md:space-y-6">
      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">关闭</button>
          </div>
        </div>
      ) : null}
      <section className="surface-block-summary p-3 space-y-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-amber-700">月度复盘</div>
            <h2 className="mt-1 text-[17px] font-semibold leading-6 text-stone-900">排班统计表</h2>
            <p className="mt-1 text-[13px] leading-5 text-stone-600">先定月份和口径，把首屏让给数据本体。</p>
          </div>
          <span className="shrink-0 rounded-full border border-amber-200 bg-white/85 px-2 py-0.5 text-[10px] font-medium text-amber-700">{rows.length} 人</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/90 px-3 py-2.5">
            <div className="text-[10px] text-sky-700">活跃主播</div>
            <div className="mt-1 text-base font-semibold text-sky-950">{summary.activeAnchors}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5">
            <div className="text-[10px] text-emerald-700">总场次</div>
            <div className="mt-1 text-base font-semibold text-emerald-950">{summary.totalMatches}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
            <div className="text-[10px] text-amber-700">总费用</div>
            <div className="mt-1 text-base font-semibold text-amber-950">{summary.totalFee}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5">
            <div className="text-[10px] text-stone-500">统计人数</div>
            <div className="mt-1 text-base font-semibold text-stone-900">{summary.totalAnchors}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_.8fr] md:gap-4">
        <div className="app-card space-y-2.5 p-3 md:p-5 md:space-y-4">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-2 md:flex md:flex-wrap md:items-end md:gap-2.5 xl:flex-1 xl:grid-cols-[minmax(0,220px)_1fr]">
              <div className="min-w-0 w-full xl:w-auto">
                <div className="md:hidden text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">统计月份</div>
                <DateQuickPicker value={monthDate} onChange={setMonthDate} label="统计月份" hideLabel compact />
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2">
                <button onClick={() => setMetric("approved")} className={`rounded-xl border px-3 py-2 text-[13px] font-medium md:px-4 md:text-sm ${metric === "approved" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}>有效报名</button>
                <button onClick={() => setMetric("completed")} className={`rounded-xl border px-3 py-2 text-[13px] font-medium md:px-4 md:text-sm ${metric === "completed" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}>已完赛</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:gap-2">
              <button onClick={fetchData} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 transition hover:border-stone-400 md:px-4 md:text-sm">刷新</button>
              <button onClick={exportCsv} className="rounded-xl border border-amber-500 bg-amber-500 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-amber-600 md:px-4 md:text-sm">导出 CSV</button>
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-[11px] leading-[18px] text-stone-600 md:p-4 md:text-sm md:leading-5">
            口径：{metric === "approved" ? "管理员通过（approved）" : "已完赛（assignments.completed）"}；每场 <b>{data?.unitPrice || 1600}</b>
          </div>
        </div>

        <div className="hidden gap-4 md:grid md:grid-cols-3 xl:grid-cols-1">
          <MetricCard label="本月总场次" value={summary.totalMatches} tone="success" />
          <MetricCard label="本月总费用" value={summary.totalFee} tone="warning" />
          <MetricCard label="有产出主播" value={`${summary.activeAnchors}/${summary.totalAnchors}`} tone="info" />
        </div>
      </section>

      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        ) : rows.length === 0 ? (
          <div className="state-empty">暂无数据，可先确认抓取范围与最近成功记录后再查看。</div>
        ) : rows.map((r: any) => (
          <div key={r.user_id} className="app-card p-4 space-y-3">
            <button className="text-left text-stone-900 font-semibold" onClick={() => openDetail(r)}>{r.nickname} ({r.username})</button>
            <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
              <div>本月日期：<b>{r.current.success_days}</b></div>
              <div>本月场次：<b>{r.current.success_matches}</b></div>
              <div>本月费用：<b className="text-emerald-700">{r.current.fee}</b></div>
              <div>上月费用：<b className="text-sky-700">{r.previous.fee}</b></div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block app-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50/90">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">主播（点开明细）</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">本月日期数</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">本月场次</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">本月费用</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">上月日期数</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">上月场次</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">上月费用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white/80">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-500">载入中</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-500">暂无数据</td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.user_id} className="hover:bg-stone-50/80">
                  <td className="px-4 py-3">
                    <button className="font-medium text-sky-700 hover:text-sky-800" onClick={() => openDetail(r)}>
                      {r.nickname} ({r.username})
                    </button>
                  </td>
                  <td className="px-4 py-3">{r.current.success_days}</td>
                  <td className="px-4 py-3">{r.current.success_matches}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{r.current.fee}</td>
                  <td className="px-4 py-3">{r.previous.success_days}</td>
                  <td className="px-4 py-3">{r.previous.success_matches}</td>
                  <td className="px-4 py-3 font-semibold text-sky-700">{r.previous.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="w-[min(1080px,96vw)] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[28px] border border-white/70 bg-white/96 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">{detailTitle} · {detail.month} 明细</h3>
                <div className="mt-1 text-sm text-stone-500">总场次：{detail.totalMatches} ｜ 总费用：<span className="font-semibold text-emerald-700">{detail.totalFee}</span></div>
              </div>
              <button onClick={() => setDetail(null)} className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-200 transition" aria-label="关闭">×</button>
            </div>
            <div className="mt-4 space-y-3">
              {(detail.rows || []).length === 0 ? (
                <div className="state-empty">本月暂无有效报名</div>
              ) : renderDetailCalendar()}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
