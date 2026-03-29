import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReviewApplications from "./Reviews";
import AuditMatches from "./Audits";

export default function ReviewAuditHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"reviews" | "audits">("reviews");

  useEffect(() => {
    if (location.pathname.endsWith('/audits')) setTab('audits');
    else setTab('reviews');
  }, [location.pathname]);

  const switchTab = (next: "reviews" | "audits") => {
    setTab(next);
    navigate(next === "reviews" ? "/admin/reviews" : "/admin/audits");
  };

  return (
    <div className="space-y-4 motion-rise">
      <div className="app-card p-3 overflow-x-auto flex gap-2">
        <button onClick={() => switchTab("reviews")} className={`px-4 py-1.5 rounded-full border text-sm ${tab === "reviews" ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300"}`}>报名审核</button>
        <button onClick={() => switchTab("audits")} className={`px-4 py-1.5 rounded-full border text-sm ${tab === "audits" ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300"}`}>赛程稽核</button>
      </div>

      {tab === "reviews" ? <ReviewApplications /> : <AuditMatches />}
    </div>
  );
}
