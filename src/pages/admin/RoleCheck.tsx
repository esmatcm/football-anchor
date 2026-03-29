import { useEffect, useState } from "react";
import api from "../../lib/api";

const MATRIX = [
  { role: "total_admin", canSeeTotal: true, canManageAdmins: true },
  { role: "super_admin", canSeeTotal: false, canManageAdmins: true },
  { role: "admin", canSeeTotal: false, canManageAdmins: false },
];

export default function RoleCheck() {
  const [data, setData] = useState<any>(null);
  const [adminApiOk, setAdminApiOk] = useState<string>("检测中...");

  const fetchData = async () => {
    const res = await api.get("/stats/role-overview");
    setData(res.data);
    try {
      const r = await api.get("/auth/admins");
      setAdminApiOk(`可访问 /auth/admins（返回 ${Array.isArray(r.data) ? r.data.length : 0} 人）`);
    } catch (err: any) {
      setAdminApiOk(`不可访问 /auth/admins（${err?.response?.status || "ERR"}）`);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-stone-800">角色回归检查</h2>

      <div className="bg-white p-4 rounded-lg border text-sm space-y-1">
        <div>当前登录：{data?.viewer?.username} / <b>{data?.viewer?.role}</b></div>
        <div>权限探针：{adminApiOk}</div>
      </div>

      <div className="app-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">可见总管理</th>
              <th className="px-4 py-3 text-left">可管理管理员</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.role} className="border-t">
                <td className="px-4 py-3">{m.role}</td>
                <td className="px-4 py-3">{m.canSeeTotal ? "是" : "否"}</td>
                <td className="px-4 py-3">{m.canManageAdmins ? "是" : "否"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="app-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-stone-50 text-sm font-medium">用户角色清单</div>
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">账号</th>
              <th className="px-4 py-3 text-left">昵称</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users || []).map((u: any) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3">{u.id}</td>
                <td className="px-4 py-3">{u.username}</td>
                <td className="px-4 py-3">{u.nickname}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
