import { useEffect, useState } from "react";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";

export default function DataReconcile() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const backfillCategory = async (category: string) => {
    const pathMap: Record<string, string> = {
      足球: "/matches/scrape",
      CBA: "/matches/scrape-cba",
      NBA: "/matches/scrape-nba",
      韩篮甲: "/matches/scrape-kbl",
      NBL: "/matches/scrape-nbl",
    };
    const apiPath = pathMap[category] || "/matches/scrape-all";
    try {
      await api.post(apiPath, { date });
      await fetchData();
      setBanner({ type: "success", text: `${category} 补抓完成` });
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "补抓失败" });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/stats/reconcile?date=${date}`);
      setData(res.data);
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "读取赛事核对失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [date]);
  const rows = Object.entries(data?.result || {});

  return (
    <div className="space-y-6 motion-rise">
      <h2 className="text-2xl font-bold text-stone-900">赛事核对</h2>
      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">关闭</button>
          </div>
        </div>
      ) : null}
      <div className="app-card p-4 flex items-end gap-3">
        <DateQuickPicker value={date} onChange={setDate} label="核对日期" />
        <button onClick={fetchData} className="px-3 py-2 border rounded-md">刷新</button>
      </div>

      <div className="app-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left">分类</th>
              <th className="px-4 py-3 text-left">入库场次</th>
              <th className="px-4 py-3 text-left">开放场次</th>
              <th className="px-4 py-3 text-left">待审</th>
              <th className="px-4 py-3 text-left">通过</th>
              <th className="px-4 py-3 text-left">拒绝</th>
              <th className="px-4 py-3 text-left">候补</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-4 text-center text-stone-500">载入中...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-4 text-center text-stone-500">暂无数据</td></tr>
            ) : rows.map(([k, v]: any) => (
              <tr key={k} className={`border-t ${(v.total === 0 || v.open > v.total) ? "bg-red-50" : ""}`}>
                <td className="px-4 py-3 font-medium">{k}</td>
                <td className="px-4 py-3">{v.total}{v.total === 0 && <span className="ml-2 text-xs text-red-600">⚠ 无入库</span>}</td>
                <td className="px-4 py-3">{v.open}</td>
                <td className="px-4 py-3">{v.pending}</td>
                <td className="px-4 py-3">{v.approved}</td>
                <td className="px-4 py-3">{v.rejected}</td>
                <td className="px-4 py-3">{v.waitlist}</td>
                <td className="px-4 py-3">
                  <button onClick={() => backfillCategory(k)} className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700">补抓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
