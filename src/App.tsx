/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import Login from "./pages/Login";
import MainLayout from "./components/MainLayout";
import ErrorBoundary from "./components/ErrorBoundary";

import AdminDashboard from "./pages/admin/Dashboard";
import Scraper from "./pages/admin/Scraper";
import MatchesHub from "./pages/admin/MatchesHub";
import UserCenter from "./pages/admin/UserCenter";
import ReviewAuditHub from "./pages/admin/ReviewAudit";
import ScheduleCenter from "./pages/admin/ScheduleCenter";
import MonthlyStats from "./pages/admin/MonthlyStats";
import DataReconcile from "./pages/admin/Reconcile";
import DailyOverview from "./pages/admin/DailyOverview";
import AnchorDashboard from "./pages/anchor/Dashboard";
import AvailableMatches from "./pages/anchor/Matches";
import MySchedule from "./pages/anchor/MySchedule";

type SeoEntry = {
  title: string;
  description: string;
  ogType?: string;
};

const SEO_MAP: Record<string, SeoEntry> = {
  "/login": {
    title: "金银伯直播管理系统登入｜安全驗證與後台入口",
    description: "登入金银伯直播管理系统後台，進行賽程管理、主播排班、審核與營運追蹤。",
  },
  "/admin": {
    title: "金银伯直播管理系统後台｜營運總覽與賽程數據看板",
    description: "集中查看今日賽程、開放狀態、主播排班與異常事件，快速掌握直播營運核心指標。",
  },
  "/admin/scrape": {
    title: "賽程抓取管理｜足球賽事資料採集與成功率追蹤",
    description: "按日期執行賽程抓取並查看歷史記錄，確保賽事資料更新穩定、可追蹤。",
  },
  "/admin/matches": {
    title: "賽程管理系統｜聯賽篩選、報名開關與狀態控管",
    description: "支援多聯賽賽程篩選與主播招募開關，提升足球直播排程效率與準確度。",
  },
  "/admin/anchors": {
    title: "主播管理後台｜主播資料、排班與狀態維護",
    description: "集中管理主播資料與可用狀態，快速完成排班分配，提升場次覆蓋率。",
  },
  "/admin/reviews": {
    title: "審核中心｜主播申請審核與流程追蹤",
    description: "管理主播申請審核流程，快速處理待審項目，降低人工審核遺漏風險。",
  },
  "/admin/audits": {
    title: "稽核管理｜營運日誌、異常追蹤與合規控管",
    description: "彙整稽核紀錄與異常事件，支援問題回溯與營運合規管理。",
  },
  "/admin/timeline": {
    title: "時間表管理｜賽事時序、排班節奏與執行追蹤",
    description: "透過時間軸掌握賽事與主播安排，協助團隊跨時段協作與執行監控。",
  },
  "/admin/config": {
    title: "管理員配置｜子管理員帳號與權限管理",
    description: "總管理員可在此建立與維護子管理員帳號狀態，確保後台權限控管。",
  },
  "/anchor": {
    title: "主播工作台｜今日任務與直播行程總覽",
    description: "主播專用工作台，查看可報名賽事、我的排班與當日任務安排。",
  },
  "/anchor/matches": {
    title: "可報名賽事｜主播接單與場次篩選",
    description: "快速查看可報名賽事與時間，提升主播接單效率與場次匹配。",
  },
  "/anchor/schedule": {
    title: "我的排班｜主播直播時間表與任務追蹤",
    description: "一站查看主播排班、開播時間與任務進度，減少漏播與衝堂。",
  },
};

function upsertMetaByName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const entry = SEO_MAP[location.pathname] || SEO_MAP["/admin"];
    const currentUrl = `${window.location.origin}${location.pathname}`;

    document.title = entry.title;
    upsertMetaByName("description", entry.description);
    upsertMetaByProperty("og:title", entry.title);
    upsertMetaByProperty("og:description", entry.description);
    upsertMetaByProperty("og:type", entry.ogType || "website");
    upsertMetaByProperty("og:url", currentUrl);
  }, [location.pathname]);

  return null;
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "anchor" ? "/anchor" : "/admin"} replace />;
}


export default function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<MainLayout />}>
              <Route index element={<HomeRedirect />} />

              <Route path="admin">
                <Route index element={<AdminDashboard />} />
                <Route path="scrape" element={<Scraper />} />
                <Route path="matches" element={<MatchesHub />} />
                <Route path="anchors" element={<UserCenter />} />
                <Route path="reviews" element={<ReviewAuditHub />} />
                <Route path="timeline" element={<ScheduleCenter />} />
                <Route path="audits" element={<ReviewAuditHub />} />
                <Route path="config" element={<UserCenter />} />
                <Route path="monthly-stats" element={<MonthlyStats />} />
                <Route path="reconcile" element={<DataReconcile />} />
                <Route path="overview" element={<DailyOverview />} />
              </Route>

              <Route path="anchor">
                <Route index element={<AnchorDashboard />} />
                <Route path="matches" element={<AvailableMatches />} />
                <Route path="schedule" element={<MySchedule />} />
              </Route>
            </Route>
          </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
