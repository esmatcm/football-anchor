import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ManageAnchors from "./Anchors";
import AdminConfig from "./AdminConfig";

export default function UserCenter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"anchor" | "admin">("anchor");

  useEffect(() => {
    if (location.pathname.endsWith("/config")) setTab("admin");
    else setTab("anchor");
  }, [location.pathname]);

  const switchTab = (next: "anchor" | "admin") => {
    setTab(next);
    navigate(next === "anchor" ? "/admin/anchors" : "/admin/config");
  };

  return (
    <div className="space-y-4 motion-rise">
      <div className="app-card p-3 flex gap-2 overflow-x-auto">
        <button onClick={() => switchTab("anchor")} className={`px-4 py-1.5 rounded-full text-sm border whitespace-nowrap ${tab === "anchor" ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300"}`}>主播管理</button>
        <button onClick={() => switchTab("admin")} className={`px-4 py-1.5 rounded-full text-sm border whitespace-nowrap ${tab === "admin" ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300"}`}>管理员管理</button>
      </div>
      {tab === "anchor" ? <ManageAnchors /> : <AdminConfig />}
    </div>
  );
}
