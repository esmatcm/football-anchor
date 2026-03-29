import { useState } from "react";
import ManageMatches from "./Matches";
import DataReconcile from "./Reconcile";
import Scraper from "./Scraper";
import { SegmentedTabs } from "../../components/opsUi";

const TABS = [
  { key: "manage", label: "赛程管理", desc: "看列表、筛选、开放报名、异常排查" },
  { key: "reconcile", label: "赛事核对", desc: "对账、修正、确认源数据是否一致" },
  { key: "scrape", label: "抓取赛事", desc: "补抓、看范围、看最近执行记录" },
] as const;

export default function MatchesHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("manage");

  return (
    <div className="space-y-3 motion-rise md:space-y-4">
      <section className="app-card px-3.5 py-3 md:px-5 md:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500 md:text-[11px] md:tracking-[0.08em]">赛程总控台</div>
            <h1 className="mt-1 text-[17px] font-semibold leading-6 text-stone-900 md:text-[22px] md:font-bold md:tracking-[-0.02em]">赛程管理中枢</h1>
            <p className="mt-1 text-[12px] leading-5 text-stone-500 md:text-sm md:leading-6">统一入口管理抓取、核对、赛程。</p>
          </div>
          <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] text-stone-600 md:px-3 md:text-xs">3 模块</span>
        </div>
      </section>

      <SegmentedTabs items={TABS} value={tab} onChange={setTab} mobileInline compact />
      {tab === "manage" ? <ManageMatches /> : tab === "reconcile" ? <DataReconcile /> : <Scraper />}
    </div>
  );
}
