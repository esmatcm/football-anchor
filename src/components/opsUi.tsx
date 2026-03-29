import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHero({
  eyebrow,
  title,
  description,
  stats,
  aside,
  tone = "neutral",
}: {
  eyebrow?: string;
  title: string;
  description: string;
  stats?: Array<{ label: string; value: ReactNode; tone?: "neutral" | "success" | "warning" | "info" | "danger" }>;
  aside?: ReactNode;
  tone?: "neutral" | "sky" | "amber" | "emerald" | "violet";
}) {
  const toneClass = {
    neutral: "bg-[linear-gradient(135deg,rgba(231,229,228,.72),rgba(255,255,255,.94),rgba(245,245,244,.92))]",
    sky: "bg-[linear-gradient(135deg,rgba(191,219,254,.58),rgba(255,255,255,.94),rgba(216,180,254,.24))]",
    amber: "bg-[linear-gradient(135deg,rgba(252,211,77,.28),rgba(255,255,255,.94),rgba(254,240,138,.32))]",
    emerald: "bg-[linear-gradient(135deg,rgba(167,243,208,.34),rgba(255,255,255,.95),rgba(191,219,254,.2))]",
    violet: "bg-[linear-gradient(135deg,rgba(221,214,254,.48),rgba(255,255,255,.94),rgba(191,219,254,.2))]",
  }[tone];

  return (
    <section className="app-card overflow-hidden">
      <div className={`px-5 py-5 md:px-6 md:py-6 ${toneClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            {eyebrow ? <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/78 px-3 py-1 text-xs text-stone-700">{eyebrow}</div> : null}
            <div>
              <h2 className="app-title">{title}</h2>
              <p className="app-subtitle mt-2 max-w-3xl leading-6">{description}</p>
            </div>
          </div>

          {stats?.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[420px]">
              {stats.map((item) => (
                <div key={item.label} className="h-full">
                  <MetricCard label={item.label} value={item.value} tone={item.tone} />
                </div>
              ))}
            </div>
          ) : aside ? (
            <div className="xl:min-w-[320px]">{aside}</div>
          ) : null}
        </div>
        {aside && stats?.length ? <div className="mt-4">{aside}</div> : null}
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info" | "danger";
}) {
  const toneClass = {
    neutral: "border-white/80 bg-white/84 text-stone-900 [&_.meta]:text-stone-500",
    success: "border-emerald-200 bg-emerald-50/90 text-emerald-900 [&_.meta]:text-emerald-700",
    warning: "border-amber-200 bg-amber-50/90 text-amber-900 [&_.meta]:text-amber-700",
    info: "border-sky-200 bg-sky-50/90 text-sky-900 [&_.meta]:text-sky-700",
    danger: "border-red-200 bg-red-50/90 text-red-900 [&_.meta]:text-red-700",
  }[tone];

  return (
    <div className={`flex h-full flex-col rounded-2xl border px-3.5 py-2.5 md:px-4 md:py-3 ${toneClass}`}>
      <div className="meta text-[11px] leading-4 md:text-xs">{label}</div>
      <div className="mt-auto pt-2 text-xl font-semibold leading-6 md:text-2xl">{value}</div>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function InlineLinkCard({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="rounded-2xl border border-stone-200 bg-white/80 p-4 transition hover:border-stone-400">
      <div className="text-sm font-semibold text-stone-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-stone-500">{description}</div>
    </Link>
  );
}

export function InfoCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info" | "danger";
}) {
  const toneClass = {
    neutral: "border-stone-200 bg-white/80",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-900 [&_.sub]:text-emerald-700",
    warning: "border-amber-200 bg-amber-50/70 text-amber-950 [&_.sub]:text-amber-700",
    info: "border-sky-200 bg-sky-50/70 text-sky-950 [&_.sub]:text-sky-700",
    danger: "border-red-200 bg-red-50/70 text-red-900 [&_.sub]:text-red-700",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="sub text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-stone-900">{value}</div>
      {hint ? <div className="sub mt-1 text-xs leading-5 text-stone-500">{hint}</div> : null}
    </div>
  );
}

export function EmptyStateBlock({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="state-empty">
      <div className="text-sm font-medium text-stone-700">{title}</div>
      {description ? <div className="mt-2 text-xs leading-5 text-stone-500">{description}</div> : null}
    </div>
  );
}

export function TableSectionHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="border-b border-stone-200 bg-stone-50/80 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">{title}</div>
          {description ? <div className="mt-1 text-xs text-stone-500">{description}</div> : null}
        </div>
        {meta ? <div className="text-xs text-stone-500">{meta}</div> : null}
      </div>
    </div>
  );
}

export function OpsGuide({
  title,
  description,
  bullets,
  tone = "sky",
  collapsible = false,
  defaultExpanded = false,
  summary,
}: {
  title: string;
  description?: string;
  bullets: Array<{ title: string; body: string }>;
  tone?: "sky" | "amber" | "emerald" | "violet";
  collapsible?: boolean;
  defaultExpanded?: boolean;
  summary?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = collapsible ? expanded : true;

  const toneClass = {
    sky: "border-sky-200 bg-sky-50/50 text-sky-900 [&_.sub]:text-sky-800 [&_.panel]:border-sky-200 [&_.panel]:bg-white/88 [&_.tag]:border-sky-200/90 [&_.tag]:bg-white/80 [&_.tag]:text-sky-900 [&_.button]:border-sky-300 [&_.button]:bg-white/85 [&_.button]:text-sky-800",
    amber: "border-amber-200 bg-amber-50/50 text-amber-950 [&_.sub]:text-amber-900 [&_.panel]:border-amber-200 [&_.panel]:bg-white/86 [&_.tag]:border-amber-200/90 [&_.tag]:bg-white/80 [&_.tag]:text-amber-950 [&_.button]:border-amber-300 [&_.button]:bg-white/85 [&_.button]:text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-950 [&_.sub]:text-emerald-800 [&_.panel]:border-emerald-200 [&_.panel]:bg-white/88 [&_.tag]:border-emerald-200/90 [&_.tag]:bg-white/80 [&_.tag]:text-emerald-900 [&_.button]:border-emerald-300 [&_.button]:bg-white/85 [&_.button]:text-emerald-800",
    violet: "border-violet-200 bg-violet-50/50 text-violet-950 [&_.sub]:text-violet-800 [&_.panel]:border-violet-200 [&_.panel]:bg-white/88 [&_.tag]:border-violet-200/90 [&_.tag]:bg-white/80 [&_.tag]:text-violet-900 [&_.button]:border-violet-300 [&_.button]:bg-white/85 [&_.button]:text-violet-800",
  }[tone];

  return (
    <section className={`app-card border p-3 md:p-4 ${toneClass}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold md:text-base">{title}</div>
            {collapsible ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="button inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-90"
              >
                {isExpanded ? "收起说明" : "展开说明"}
              </button>
            ) : null}
          </div>
          {description ? <div className="sub mt-1 text-xs leading-5 md:text-sm">{description}</div> : null}
          {!isExpanded ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(summary ? [summary] : bullets.map((item) => item.title)).slice(0, 3).map((item) => (
                <span key={item} className="tag inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-3 grid gap-2.5 lg:grid-cols-3">
          {bullets.map((item) => (
            <div key={item.title} className="panel rounded-2xl border px-3.5 py-3 text-sm">
              <div className="font-semibold leading-5">{item.title}</div>
              <div className="sub mt-1.5 text-xs leading-5">{item.body}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  mobileInline = false,
  compact = false,
}: {
  items: ReadonlyArray<{ key: T; label: string; desc?: string }>;
  value: T;
  onChange: (value: T) => void;
  mobileInline?: boolean;
  compact?: boolean;
}) {
  const desktopCols = items.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  const mobileCols = items.length >= 3 ? "grid-cols-3" : items.length === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`app-card ${compact ? "p-2 md:p-3" : "p-3"}`}>
      <div className={`grid gap-2 ${mobileInline ? `${mobileCols} ${desktopCols}` : desktopCols}`}>
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={[
                "text-left transition",
                mobileInline
                  ? "min-w-0 rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-center md:px-2.5 md:py-2"
                  : "rounded-2xl border px-4 py-3",
                active
                  ? mobileInline
                    ? "bg-[var(--brand-50)] text-[var(--brand-700)] shadow-none"
                    : "border-stone-900 bg-stone-900 text-white shadow-sm"
                  : mobileInline
                    ? "text-stone-600 hover:bg-stone-50"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-400",
              ].join(" ")}
            >
              <div className={`${mobileInline ? "text-[12px] leading-4 md:text-sm" : "text-sm"} font-semibold`}>{item.label}</div>
              {item.desc ? (
                <div className={`${mobileInline ? "mt-1 hidden text-[11px] leading-4 md:block" : "mt-1 text-xs"} ${active ? (mobileInline ? "text-stone-600 md:text-stone-200" : "text-stone-200") : "text-stone-500"}`}>
                  {item.desc}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
