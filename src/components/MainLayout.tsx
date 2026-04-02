import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import api from "../lib/api";
import { APP_VERSION } from "../lib/version";
import {
  LogOut,
  LayoutDashboard,
  Calendar,
  Users,
  CheckSquare,
  FileText,
  ShieldCheck,
  Eye,
  RadioTower,
  UserCircle2,
  Clock,
  BarChart3,
} from "lucide-react";

export default function MainLayout() {
  const { user, logout, login } = useAuthStore();
  const [changePwdModal, setChangePwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");

  const isAdmin = ["admin", "super_admin", "total_admin"].includes((user?.role ?? "") as string);
  const forceChange = user?.role === "anchor" && Number((user as any)?.must_change_password || 0) === 1;

  useEffect(() => {
    if (forceChange) {
      setChangePwdModal(true);
    }
  }, [forceChange]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const submitChangePassword = async () => {
    if (!oldPwd || !newPwd) return alert("请填写旧密码和新密码");
    try {
      await api.post("/auth/change-password", { old_password: oldPwd, new_password: newPwd });
      login({ ...user, must_change_password: 0 } as any, localStorage.getItem("token") || "");
      setChangePwdModal(false);
      setOldPwd("");
      setNewPwd("");
      alert("密码修改成功");
    } catch (err: any) {
      alert(err?.response?.data?.error || "修改失败");
    }
  };

  const adminNavGroups = [
    {
      label: "监控",
      links: [
        { to: "/admin", label: "营运总览", icon: LayoutDashboard, end: true },
        { to: "/admin/overview", label: "今日赛事", icon: Eye },
      ],
    },
    {
      label: "运营",
      links: [
        { to: "/admin/matches", label: "赛程管理", icon: Calendar },
        { to: "/admin/reviews", label: "报名审核", icon: CheckSquare },
        { to: "/admin/timeline", label: "排班时间表", icon: Clock },
        { to: "/admin/monthly-stats", label: "月度统计", icon: BarChart3 },
      ],
    },
    {
      label: "管理",
      links: [
        { to: "/admin/anchors", label: "主播管理", icon: Users },
        { to: "/admin/reconcile", label: "数据核对", icon: ShieldCheck },
      ],
    },
  ];

  const anchorLinks = [
    { to: "/anchor", label: "总览", icon: LayoutDashboard, end: true },
    { to: "/anchor/matches", label: "可报名赛事", icon: RadioTower },
    { to: "/anchor/schedule", label: "我的排班", icon: UserCircle2 },
  ];

  const flatAdminLinks = adminNavGroups.flatMap((g) => g.links);
  const mobileAdminLinks = [
    { to: "/admin", label: "总览", icon: LayoutDashboard, end: true },
    { to: "/admin/overview", label: "赛事", icon: Eye },
    { to: "/admin/matches", label: "赛程", icon: Calendar },
    { to: "/admin/reviews", label: "审核", icon: CheckSquare },
    { to: "/admin/timeline", label: "排班", icon: Clock },
  ];

  const productBadge = isAdmin ? "运营 / 管理后台" : "主播工作台";
  const roleLabel = isAdmin ? "管理后台" : "主播中心";
  const mobileLinks = isAdmin ? mobileAdminLinks : anchorLinks;

  return (
    <div className="min-h-[100dvh] bg-[var(--surface-bg)]">
      {changePwdModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="shell-panel w-full max-w-md p-6">
            <h3 className="mb-2 text-[20px] font-semibold tracking-[-0.02em]">修改密码</h3>
            <p className="mb-4 text-[13px] leading-6 text-stone-500">为确保帐号安全，请定期更新密码。</p>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="旧密码"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
              />
              <input
                type="password"
                placeholder="新密码"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {!forceChange && (
                <button onClick={() => setChangePwdModal(false)} className="btn-secondary">
                  取消
                </button>
              )}
              <button onClick={submitChangePassword} className="btn-primary">
                确认修改
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1680px] gap-0  px-0 md:min-h-screen md:gap-5 md:px-4 md:py-4 md:pb-4">
        <aside className="hidden md:flex md:w-72 md:flex-col md:gap-4">
          <div className="shell-panel overflow-hidden">
            <div className="border-b border-stone-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,.94),rgba(245,245,244,.88),rgba(254,249,195,.32))] px-5 py-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-stone-600">
                {productBadge}
              </div>
              <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-stone-900">金银伯直播管理系统</h1>
              <div className="mt-1 text-[11px] text-stone-400">v{APP_VERSION}</div>
              <p className="mt-2 text-[13px] leading-6 text-stone-500">赛程 · 排班 · 审核 · 统计一站管理</p>
            </div>
            <div className="px-4 py-4">
              <div className="rounded-[22px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,.94),rgba(245,245,244,.92))] p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-sm">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold leading-5 text-stone-900">{user.nickname}</div>
                    <div className="text-[12px] leading-5 text-stone-500">{roleLabel}</div>
                  </div>
                </div>
              </div>

              {isAdmin ? (
                <nav className="mt-4 space-y-4">
                  {adminNavGroups.map((group) => (
                    <div key={group.label}>
                      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        {group.label}
                      </div>
                      <div className="space-y-1">
                        {group.links.map((link) => {
                          const Icon = link.icon;
                          return (
                            <NavLink
                              key={link.to}
                              to={link.to}
                              end={link.end}
                              className={({ isActive }) => `nav-pill ${isActive ? "nav-pill-active" : "nav-pill-idle"}`}
                            >
                              <Icon size={18} />
                              <span>{link.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
              ) : (
                <>
                  <div className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">工作面</div>
                  <nav className="mt-3 space-y-2 overflow-y-auto">
                    {anchorLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          end={link.end}
                          className={({ isActive }) => `nav-pill ${isActive ? "nav-pill-active" : "nav-pill-idle"}`}
                        >
                          <Icon size={18} />
                          <span>{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </>
              )}
            </div>
          </div>

          <div className="shell-panel space-y-2 p-4 text-[13px] leading-6 text-stone-600">
            <button onClick={() => setChangePwdModal(true)} className="btn-secondary w-full justify-center">
              修改密码
            </button>
            <button
              onClick={logout}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-medium text-red-700 transition hover:bg-red-100"
            >
              <LogOut size={18} />
              退出登录
            </button>
          </div>
        </aside>

        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col gap-3 md:min-h-screen md:gap-4">
          <header className="shell-panel sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 mx-2 rounded-[22px] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.8rem)] md:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] text-stone-600">
                  {productBadge}
                </div>
                <h1 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-stone-900">金银伯直播管理系统 <span className="text-[11px] font-normal text-stone-400">v{APP_VERSION}</span></h1>
                <p className="text-[12px] leading-5 text-stone-500">
                  {user.nickname} · {roleLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setChangePwdModal(true)} className="btn-secondary px-3 py-2 text-[12px]">
                  改密
                </button>
                <button onClick={logout} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                  退出
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-[var(--mobile-content-bottom-spacing)] pt-2 scroll-pb-[calc(var(--mobile-content-bottom-spacing)+1rem)] md:overflow-y-auto md:px-0 md:pb-6 md:pt-0">
            <Outlet />
          </main>

          <div className="h-[var(--mobile-content-bottom-spacing)] shrink-0 md:hidden" aria-hidden="true" />

          <div className="mobile-bottom-dock md:hidden">
            <nav className="mobile-bottom-nav" aria-label="底部导航">
              {mobileLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `mobile-bottom-nav-item ${isActive ? "mobile-bottom-nav-item-active" : "mobile-bottom-nav-item-idle"}`
                    }
                  >
                    <Icon size={18} strokeWidth={2.15} />
                    <span>{link.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
