import { createPortal } from "react-dom";
import { useEffect, useState, type FormEvent } from "react";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";

type AdminUser = {
  id: number;
  username: string;
  role: string;
  nickname: string;
  status: "active" | "inactive";
};

export default function AdminConfig() {
  const { user } = useAuthStore();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", nickname: "" });
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "total_admin";

  const fetchAdmins = async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await api.get("/auth/admins");
      setAdmins(res.data || []);
    } catch (err) {
      console.error(err);
      setBanner({ type: "error", text: "读取管理员失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, [isSuperAdmin]);

  const createAdmin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setBanner({ type: "error", text: "请填写账号和密码" });
      return;
    }
    try {
      await api.post("/auth/admins", { username: form.username, password: form.password, nickname: form.nickname || form.username });
      setBanner({ type: "success", text: `管理员 ${form.username} 已创建` });
      setForm({ username: "", password: "", nickname: "" });
      fetchAdmins();
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "新增失败" });
    }
  };

  const toggleStatus = async (id: number, nextStatus: "active" | "inactive") => {
    try {
      await api.put(`/auth/admins/${id}/status`, { status: nextStatus });
      setBanner({ type: "success", text: `管理员已${nextStatus === "active" ? "启用" : "停用"}` });
      fetchAdmins();
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "状态更新失败" });
    }
  };

  const deleteAdmin = (admin: AdminUser) => {
    setDeleteTarget(admin);
  };

  const confirmDeleteAdmin = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/auth/admins/${deleteTarget.id}`);
      setBanner({ type: "success", text: `子管理员 ${deleteTarget.username} 已删除` });
      setDeleteTarget(null);
      fetchAdmins();
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "删除失败" });
    }
  };

  const resetPassword = (admin: AdminUser) => {
    setPasswordTarget(admin);
    setPasswordInput("");
  };

  const submitResetPassword = async () => {
    if (!passwordTarget || !passwordInput.trim()) return;
    try {
      await api.post(`/auth/admins/${passwordTarget.id}/reset-password`, { password: passwordInput.trim() });
      setBanner({ type: "success", text: `管理员 ${passwordTarget.username} 密码已重置` });
      setPasswordTarget(null);
      setPasswordInput("");
    } catch (err: any) {
      setBanner({ type: "error", text: err?.response?.data?.error || "密码重置失败" });
    }
  };

  if (!isSuperAdmin) return <div className="text-red-600">仅高权限管理员可访问管理员管理页面。</div>;

  return (
    <div className="space-y-6 motion-rise">
      <h2 className="text-2xl font-bold text-stone-900">管理员管理</h2>

      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">关闭</button>
          </div>
        </div>
      ) : null}

      <form onSubmit={createAdmin} className="app-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input className="border border-stone-300 rounded-md px-3 py-2" placeholder="账号 username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input type="password" className="border border-stone-300 rounded-md px-3 py-2" placeholder="密码 password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="border border-stone-300 rounded-md px-3 py-2" placeholder="昵称 nickname" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        <button type="submit" className="btn-primary">新增管理员</button>
      </form>


      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="state-empty">载入中...</div>
        ) : admins.length === 0 ? (
          <div className="state-empty">暂无子管理员</div>
        ) : admins.map((item) => (
          <div key={`m-${item.id}`} className="app-card p-3 space-y-2">
            <div className="text-sm font-semibold text-stone-900">{item.username}（{item.nickname}）</div>
            <div className="text-xs text-stone-600">角色：{item.role === "total_admin" ? "总管理" : item.role === "super_admin" ? "超级管理" : "管理员"}</div>
            <div className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{item.status === "active" ? "启用" : "停用"}</div>
            <div className="flex gap-3 pt-1 text-sm">
              {item.status === "active" ? (
                <button onClick={() => toggleStatus(item.id, "inactive")} className="text-red-600">停用</button>
              ) : (
                <button onClick={() => toggleStatus(item.id, "active")} className="text-blue-600">启用</button>
              )}
              <button onClick={() => resetPassword(item)} className="text-amber-600">重置密码</button>
              <button onClick={() => deleteAdmin(item)} className="text-rose-700">删除</button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block app-card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">账号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">昵称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-stone-500">载入中...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-stone-500">暂无子管理员</td></tr>
            ) : (
              admins.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">{item.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">{item.nickname}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-700">{item.role === "total_admin" ? "总管理" : item.role === "super_admin" ? "超级管理" : "管理员"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {item.status === "active" ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                    {item.status === "active" ? (
                      <button onClick={() => toggleStatus(item.id, "inactive")} className="text-red-600 hover:text-red-700">停用</button>
                    ) : (
                      <button onClick={() => toggleStatus(item.id, "active")} className="text-blue-600 hover:text-blue-700">启用</button>
                    )}
                    <button onClick={() => resetPassword(item)} className="text-amber-600 hover:text-amber-700">重置密码</button>
                    <button onClick={() => deleteAdmin(item)} className="text-rose-700 hover:text-rose-800">删除</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-stone-900">确认删除管理员</h3>
            <p className="text-sm text-stone-600">确定要删除子管理员 <span className="font-semibold text-stone-900">{deleteTarget.username}</span> 吗？</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={confirmDeleteAdmin} className="rounded-md bg-red-600 px-4 py-2 text-white">确认删除</button>
            </div>
          </div>
        </div>
      , document.body)}

      {passwordTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-stone-900">重置管理员密码</h3>
            <p className="text-sm text-stone-600">为 <span className="font-semibold text-stone-900">{passwordTarget.username}</span> 设置新密码</p>
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="请输入新密码" className="w-full border border-stone-300 rounded-md px-3 py-2" />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setPasswordTarget(null); setPasswordInput(""); }} className="btn-secondary">取消</button>
              <button type="button" onClick={submitResetPassword} disabled={!passwordInput.trim()} className="btn-primary disabled:opacity-50">确认重置</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
