import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import DateQuickPicker from "../../components/DateQuickPicker";
import { getBeijingTodayYmd } from "../../lib/beijingDate";
import { getAdminMatchSignals, getAssignmentStatusChipClass } from "../../lib/adminMatchUi";

const AUDIT_CATEGORIES = ["全部", "足球", "CBA", "NBA", "韩篮甲", "NBL", "新西联"] as const;
type AuditCategoryFilter = (typeof AUDIT_CATEGORIES)[number];

export default function AuditMatches() {
  const [date, setDate] = useState(getBeijingTodayYmd());
  const [assignments, setAssignments] = useState<any[]>([]);
  const [onlyScheduled, setOnlyScheduled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightFilter, setHighlightFilter] = useState<"all" | "pending" | "anomaly">("all");
  const [categoryFilter, setCategoryFilter] = useState<AuditCategoryFilter>("全部");
  const [auditTarget, setAuditTarget] = useState<any | null>(null);
  const [playedOnTime, setPlayedOnTime] = useState(true);
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [incidentNote, setIncidentNote] = useState("");
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const ASSIGNMENT_STATUS: Record<string, string> = {
    scheduled: "已排程",
    completed: "已完成",
    cancelled: "已取消",
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/applications/assignments?date=${date}`);
      setAssignments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [date]);

  const openAuditModal = (assignment: any) => {
    setAuditTarget(assignment);
    setPlayedOnTime(true);
    setIncidentFlag(false);
    setIncidentType("");
    setIncidentNote("");
  };

  const filteredAssignments = assignments.filter((a) => {
    if (categoryFilter !== "全部") {
      const cat = String(a.category || "足球");
      if (cat !== categoryFilter) return false;
    }
    if (onlyScheduled && a.status !== "scheduled") return false;
    const signals = getAdminMatchSignals(a);
    if (highlightFilter === "pending") return a.status === "scheduled" || signals.businessStatus === "即将截止";
    if (highlightFilter === "anomaly") return signals.hasAnomaly || Number(a.incident_flag || 0) === 1;
    return true;
  });

  const auditCategoryCounts = assignments.reduce<Record<string, number>>((acc, a) => {
    const cat = String(a.category || "足球");
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const auditTotalCount = assignments.length;

  const submitAudit = async () => {
    if (!auditTarget) return;
    try {
      await api.put(`/applications/audit/${auditTarget.id}`, {
        played_on_time: playedOnTime,
        incident_flag: incidentFlag,
        incident_type: incidentFlag ? incidentType || "other" : "",
        incident_note: incidentFlag ? incidentNote : "",
      });
      setAuditTarget(null);
      setBanner({ type: "success", text: "稽核已提交" });
      fetchAssignments();
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "稽核失败" });
    }
  };

  return (
    <div className="space-y-6 motion-rise">
      <h2 className="text-2xl font-bold text-stone-900">赛程稽核</h2>
      
      <div className="app-card p-4 space-y-3">
        <div>
          <DateQuickPicker value={date} onChange={setDate} label="日期" />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-stone-500 shrink-0">分类</span>
            {AUDIT_CATEGORIES.map((cat) => {
              const count = cat === "全部" ? auditTotalCount : (auditCategoryCounts[cat] || 0);
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
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
            <button
              type="button"
              onClick={() => setOnlyScheduled((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${onlyScheduled ? "bg-stone-800 text-white border-stone-800 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}
          >
            {onlyScheduled ? "仅看待稽核：开" : "仅看待稽核：关"}
          </button>
          {([['all', '全部'], ['pending', '优先处理'], ['anomaly', '仅异常']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setHighlightFilter(key)} className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${highlightFilter === key ? (key === 'anomaly' ? 'bg-red-600 text-white border-red-600' : 'bg-stone-800 text-white border-stone-800 shadow-sm') : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50'}`}>{label}</button>
          ))}
            <span className="text-xs text-stone-400 self-center ml-auto tabular-nums">{filteredAssignments.length} 条</span>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">赛程</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">主播</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-stone-200">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-stone-500">载入中...</td></tr>
            ) : filteredAssignments.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-stone-500">目前没有符合条件的排班</td></tr>
            ) : (
              filteredAssignments.map((assignment) => {
                const signals = getAdminMatchSignals(assignment);
                return (
                  <tr key={assignment.id} className={signals.hasAnomaly || assignment.incident_flag === 1 ? "bg-red-50/40" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-stone-900">
                        <span className="shrink-0 rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{assignment.category || "足球"}</span>
                        {assignment.kickoff_time} - {assignment.league_name}
                      </div>
                      <div className="text-sm text-stone-500">{assignment.home_team} vs {assignment.away_team}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <span className={`chip ${signals.businessStatusClass}`}>{signals.businessStatus}</span>
                        <span className={signals.coverageTone}>{signals.coverageLabel}</span>
                        <span className={signals.hasAnomaly ? 'text-red-600 font-medium' : 'text-amber-700'}>{signals.kickoffAlert}</span>
                      </div>
                      {signals.hasAnomaly && (
                        <div className="mt-2 text-xs text-red-700 flex flex-wrap gap-2">
                          {signals.anomalies.map((issue) => <span key={issue}>⚠ {issue}</span>)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900"><div className="flex items-center gap-1.5">{assignment.nickname}{assignment.site_name && (<span className={"rounded-md border px-1.5 py-0.5 text-[11px] font-semibold " + (assignment.site_code === "jyb" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-sky-50 text-sky-700 border-sky-300")}>{assignment.site_name}</span>)}</div></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getAssignmentStatusChipClass(assignment.status, assignment.incident_flag)}`}>
                        {ASSIGNMENT_STATUS[assignment.status] || assignment.status}
                      </span>
                      {assignment.incident_flag === 1 && (
                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
                          异常
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openAuditModal(assignment)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        稽核
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {auditTarget && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card-soft w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-stone-800">赛程稽核</h3>
            <p className="text-sm text-stone-600">{auditTarget.kickoff_time} · {auditTarget.home_team} vs {auditTarget.away_team}</p>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">是否准时开播</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPlayedOnTime(true)} className={`px-3 py-1 rounded border ${playedOnTime ? "bg-green-600 text-white border-green-600" : "bg-white text-stone-700 border-stone-300"}`}>是</button>
                <button type="button" onClick={() => setPlayedOnTime(false)} className={`px-3 py-1 rounded border ${!playedOnTime ? "bg-red-600 text-white border-red-600" : "bg-white text-stone-700 border-stone-300"}`}>否</button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">是否发生异常</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setIncidentFlag(true)} className={`px-3 py-1 rounded border ${incidentFlag ? "bg-red-600 text-white border-red-600" : "bg-white text-stone-700 border-stone-300"}`}>是</button>
                <button type="button" onClick={() => setIncidentFlag(false)} className={`px-3 py-1 rounded border ${!incidentFlag ? "bg-green-600 text-white border-green-600" : "bg-white text-stone-700 border-stone-300"}`}>否</button>
              </div>
            </div>

            {incidentFlag && (
              <>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">异常类型</label>
                  <input
                    type="text"
                    value={incidentType}
                    onChange={(e) => setIncidentType(e.target.value)}
                    placeholder="例如：迟到、网络波动"
                    className="w-full border border-stone-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">异常说明</label>
                  <textarea
                    value={incidentNote}
                    onChange={(e) => setIncidentNote(e.target.value)}
                    rows={3}
                    className="w-full border border-stone-300 rounded-md px-3 py-2"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setAuditTarget(null)} className="px-4 py-2 rounded border border-stone-300 text-stone-700 hover:bg-stone-50">取消</button>
              <button type="button" onClick={submitAudit} className="px-4 py-2 btn-primary">提交稽核</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
