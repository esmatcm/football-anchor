import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";

type Site = { id: number; code: string; name: string; is_active: number };

export default function ManageAnchors() {
  const [anchors, setAnchors] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ username: "", password: "", nickname: "", phone: "", wechat: "", qq: "", note: "" });
  const [createdCredential, setCreatedCredential] = useState<{ username: string; password: string } | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<any | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [siteEditTarget, setSiteEditTarget] = useState<any | null>(null);
  const [siteEditSelection, setSiteEditSelection] = useState<number[]>([]);

  const fetchAnchors = async () => {
    setLoading(true);
    try {
      const [anchorRes, siteRes] = await Promise.all([
        api.get("/auth/anchors-with-sites"),
        api.get("/auth/sites"),
      ]);
      setAnchors(anchorRes.data);
      setSites(siteRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnchors();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/auth/anchors", formData);
      setCreatedCredential({ username: formData.username, password: formData.password });
      setBanner({ type: "success", text: `主播 ${formData.username} 已创建` });
      setShowModal(false);
      setFormData({ username: "", password: "", nickname: "", phone: "", wechat: "", qq: "", note: "" });
      fetchAnchors();
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "新增主播失败" });
    }
  };

  const toggleAnchorStatus = async (anchor: any) => {
    const nextStatus = anchor.status === "active" ? "inactive" : "active";
    try {
      await api.put(`/auth/anchors/${anchor.user_id}`, {
        nickname: anchor.nickname, phone: anchor.phone, wechat: anchor.wechat,
        qq: anchor.qq, note: anchor.note, status: nextStatus,
      });
      setBanner({ type: "success", text: `主播 ${anchor.username} 已${nextStatus === "active" ? "启用" : "停用"}` });
      fetchAnchors();
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "状态更新失败" });
    }
  };

  const deleteAnchor = (anchor: any) => setDeleteTarget(anchor);

  const confirmDeleteAnchor = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/auth/anchors/${deleteTarget.user_id}`);
      setBanner({ type: "success", text: `主播 ${deleteTarget.username} 已删除` });
      setDeleteTarget(null);
      fetchAnchors();
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "删除失败" });
    }
  };

  const resetAnchorPassword = (anchor: any) => { setPasswordTarget(anchor); setPasswordInput(""); };

  const submitAnchorPasswordReset = async () => {
    if (!passwordTarget || !passwordInput.trim()) return;
    try {
      await api.post(`/auth/anchors/${passwordTarget.user_id}/reset-password`, { password: passwordInput.trim() });
      setBanner({ type: "success", text: `主播 ${passwordTarget.username} 密码已重置` });
      setPasswordTarget(null);
      setPasswordInput("");
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "密码重置失败" });
    }
  };

  const openSiteEdit = (anchor: any) => {
    const codes = (anchor.site_codes || "").split(",").filter(Boolean);
    const ids = sites.filter((s) => codes.includes(s.code)).map((s) => s.id);
    setSiteEditSelection(ids);
    setSiteEditTarget(anchor);
  };

  const saveSiteEdit = async () => {
    if (!siteEditTarget) return;
    try {
      await api.put(`/auth/anchor-sites/${siteEditTarget.anchor_id}`, { site_ids: siteEditSelection });
      setBanner({ type: "success", text: `${siteEditTarget.nickname} 站点已更新` });
      setSiteEditTarget(null);
      fetchAnchors();
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "站点更新失败" });
    }
  };

  // Site filter
  const filteredAnchors = siteFilter === "all"
    ? anchors
    : siteFilter === "none"
      ? anchors.filter((a) => !a.site_codes)
      : anchors.filter((a) => {
          const codes = (a.site_codes || "").split(",");
          return codes.includes(siteFilter);
        });

  const siteCounts = anchors.reduce<Record<string, number>>((acc, a) => {
    const codes = (a.site_codes || "").split(",").filter(Boolean);
    if (codes.length === 0) acc["none"] = (acc["none"] || 0) + 1;
    for (const c of codes) acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  const getSiteBadges = (anchor: any) => {
    const codes = (anchor.site_codes || "").split(",").filter(Boolean);
    const names = (anchor.site_names || "").split(",").filter(Boolean);
    if (codes.length === 0) return <span className="text-xs text-stone-400">未分配</span>;
    return codes.map((code: string, i: number) => (
      <span key={code} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${code === "jyb" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-sky-100 text-sky-700 border border-sky-200"}`}>
        {names[i] || code}
      </span>
    ));
  };

  return (
    <div className="space-y-6 motion-rise">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-stone-900">主播管理</h2>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增主播</button>
      </div>

      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">关闭</button>
          </div>
        </div>
      ) : null}

      {/* Site filter bar */}
      <div className="app-card p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-stone-500 shrink-0">站点</span>
          <button type="button" onClick={() => setSiteFilter("all")} className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${siteFilter === "all" ? "bg-stone-800 text-white border-stone-800 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}>
            <span>全部</span>
            <span className={`ml-0.5 text-[11px] tabular-nums ${siteFilter === "all" ? "text-white/70" : "text-stone-400"}`}>{anchors.length}</span>
          </button>
          {sites.map((site) => (
            <button key={site.code} type="button" onClick={() => setSiteFilter(site.code)} className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${siteFilter === site.code ? (site.code === "jyb" ? "bg-amber-600 text-white border-amber-600 shadow-sm" : "bg-sky-600 text-white border-sky-600 shadow-sm") : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}>
              <span>{site.name}</span>
              <span className={`ml-0.5 text-[11px] tabular-nums ${siteFilter === site.code ? "text-white/70" : "text-stone-400"}`}>{siteCounts[site.code] || 0}</span>
            </button>
          ))}
          <button type="button" onClick={() => setSiteFilter("none")} className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-all ${siteFilter === "none" ? "bg-red-600 text-white border-red-600 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"}`}>
            <span>未分配</span>
            <span className={`ml-0.5 text-[11px] tabular-nums ${siteFilter === "none" ? "text-white/70" : "text-stone-400"}`}>{siteCounts["none"] || 0}</span>
          </button>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="app-card p-4 text-center text-stone-500">载入中...</div>
        ) : filteredAnchors.length === 0 ? (
          <div className="app-card p-4 text-center text-stone-500">暂无主播</div>
        ) : (
          filteredAnchors.map((anchor) => (
            <div key={`m-${anchor.user_id}`} className="app-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-stone-900">{anchor.username}（{anchor.nickname}）</div>
                <div className="flex items-center gap-1">{getSiteBadges(anchor)}</div>
              </div>
              <div className="text-sm text-stone-600">手机号：{anchor.phone || "-"}</div>
              <div className="text-sm text-stone-600">微信：{anchor.wechat || "-"} | QQ：{anchor.qq || "-"}</div>
              <div className="text-sm text-stone-600">备注：{anchor.note || "-"}</div>
              <div className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${anchor.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {anchor.status === "active" ? "启用" : "停用"}
              </div>
              <div className="flex gap-3 pt-1 text-sm flex-wrap">
                <button onClick={() => openSiteEdit(anchor)} className="text-indigo-600">站点</button>
                <button onClick={() => toggleAnchorStatus(anchor)} className={anchor.status === "active" ? "text-red-600" : "text-blue-600"}>
                  {anchor.status === "active" ? "停用" : "启用"}
                </button>
                <button onClick={() => resetAnchorPassword(anchor)} className="text-amber-600">重置密码</button>
                <button onClick={() => deleteAnchor(anchor)} className="text-rose-700">删除</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block app-card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">帐号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">昵称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">站点</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">联系方式</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">备注</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-stone-500">载入中...</td></tr>
            ) : filteredAnchors.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-stone-500">暂无主播</td></tr>
            ) : (
              filteredAnchors.map((anchor) => (
                <tr key={anchor.user_id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-stone-900">{anchor.username}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-stone-900">{anchor.nickname}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {getSiteBadges(anchor)}
                      <button onClick={() => openSiteEdit(anchor)} className="ml-1 text-indigo-500 hover:text-indigo-700 text-xs">编辑</button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {anchor.phone && <div>手机: {anchor.phone}</div>}
                    {anchor.wechat && <div>微信: {anchor.wechat}</div>}
                    {anchor.qq && <div>QQ: {anchor.qq}</div>}
                    {!anchor.phone && !anchor.wechat && !anchor.qq && "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${anchor.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {anchor.status === "active" ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-500 max-w-[120px] truncate">{anchor.note || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                    <button onClick={() => toggleAnchorStatus(anchor)} className={anchor.status === "active" ? "text-red-600 hover:text-red-700" : "text-blue-600 hover:text-blue-700"}>
                      {anchor.status === "active" ? "停用" : "启用"}
                    </button>
                    <button onClick={() => resetAnchorPassword(anchor)} className="text-amber-600 hover:text-amber-700">密码</button>
                    <button onClick={() => deleteAnchor(anchor)} className="text-rose-700 hover:text-rose-800">删除</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Site edit modal */}
      {siteEditTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-lg font-semibold text-stone-900">站点分配</h3>
            <p className="text-sm text-stone-500">为 <span className="font-semibold text-stone-900">{siteEditTarget.nickname}</span> 选择所属站点</p>
            <div className="space-y-2">
              {sites.map((site) => {
                const checked = siteEditSelection.includes(site.id);
                return (
                  <label key={site.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${checked ? (site.code === "jyb" ? "border-amber-400 bg-amber-50" : "border-sky-400 bg-sky-50") : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSiteEditSelection((prev) => e.target.checked ? [...prev, site.id] : prev.filter((x) => x !== site.id))}
                      className="w-4 h-4 rounded"
                    />
                    <div>
                      <div className="text-sm font-medium text-stone-900">{site.name}</div>
                      <div className="text-xs text-stone-500">{site.code}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setSiteEditTarget(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={saveSiteEdit} className="btn-primary">保存</button>
            </div>
          </div>
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">新增主播</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">帐号</label>
                <input required type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">密码</label>
                <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">昵称</label>
                <input required type="text" value={formData.nickname} onChange={e => setFormData({ ...formData, nickname: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">手机号</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">微信</label>
                  <input type="text" value={formData.wechat} onChange={e => setFormData({ ...formData, wechat: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">QQ</label>
                  <input type="text" value={formData.qq} onChange={e => setFormData({ ...formData, qq: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">备注</label>
                <textarea value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} className="w-full border border-stone-300 rounded-md px-3 py-2" />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
                <button type="submit" className="btn-primary">储存</button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-stone-900">确认删除主播</h3>
            <p className="text-sm text-stone-600">确定要删除主播 <span className="font-semibold text-stone-900">{deleteTarget.username}</span> 吗？</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={confirmDeleteAnchor} className="rounded-md bg-red-600 px-4 py-2 text-white">确认删除</button>
            </div>
          </div>
        </div>
      , document.body)}

      {passwordTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-stone-900">重置主播密码</h3>
            <p className="text-sm text-stone-600">为 <span className="font-semibold text-stone-900">{passwordTarget.username}</span> 设置新密码</p>
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="请输入新密码" className="w-full border border-stone-300 rounded-md px-3 py-2" />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setPasswordTarget(null); setPasswordInput(""); }} className="btn-secondary">取消</button>
              <button type="button" onClick={submitAnchorPasswordReset} disabled={!passwordInput.trim()} className="btn-primary disabled:opacity-50">确认重置</button>
            </div>
          </div>
        </div>
      , document.body)}

      {createdCredential && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-3">主播帐号已创建</h3>
            <div className="text-sm text-stone-700 space-y-1">
              <div>账号：<span className="font-semibold">{createdCredential.username}</span></div>
              <div>密码：<span className="font-semibold">{createdCredential.password}</span></div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={async () => {
                  const text = `账号: ${createdCredential.username}\n密码: ${createdCredential.password}`;
                  try { await navigator.clipboard.writeText(text); setBanner({ type: "success", text: "已复制帐号密码" }); }
                  catch { setBanner({ type: "error", text: "复制失败" }); }
                }}
                className="btn-primary"
              >一键复制帐号密码</button>
              <button onClick={() => setCreatedCredential(null)} className="px-4 py-2 border border-stone-300 rounded-md">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
