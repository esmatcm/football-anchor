import {
  addDays,
  addMonths,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  endOfMonth,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getBeijingTodayDate, parseYmdAsLocalNoon } from "../lib/beijingDate";

type Range = { start: string; end: string; label?: string };
type Props = {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  onRangeChange?: (range: Range | null) => void;
  hideLabel?: boolean;
  compact?: boolean;
};

function parseYmd(v: string) {
  return parseYmdAsLocalNoon(v);
}

export default function DateQuickPicker({ value, onChange, label = "日期", onRangeChange, hideLabel = false, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [rangeView, setRangeView] = useState<Range | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = useMemo(() => parseYmd(value), [value]);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(selectedDate));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { setMonthCursor(startOfMonth(selectedDate)); }, [value]);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dropW = 340;
    let left = r.right - dropW;
    if (left < 8) left = 8;
    if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
    let top = r.bottom + 8;
    const maxH = window.innerHeight * 0.8;
    if (top + maxH > window.innerHeight - 8) {
      top = r.top - maxH - 8;
      if (top < 8) top = 8;
    }
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const h = () => updatePos();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const chooseDate = (d: Date) => { onChange(format(d, "yyyyMMdd")); setRangeView(null); onRangeChange?.(null); setOpen(false); };
  const chooseRange = (s: Date, e: Date, text: string) => {
    const sy = format(s, "yyyyMMdd"), ey = format(e, "yyyyMMdd");
    onChange(sy);
    const r = { start: sy, end: ey, label: text };
    setRangeView(r); onRangeChange?.(r); setOpen(false);
  };

  const pickPrevWeek = () => { const d = subWeeks(getBeijingTodayDate(), 1); chooseRange(startOfWeek(d, { weekStartsOn: 1 }), endOfWeek(d, { weekStartsOn: 1 }), "前一周"); };
  const pickNextWeek = () => { const d = addWeeks(getBeijingTodayDate(), 1); chooseRange(startOfWeek(d, { weekStartsOn: 1 }), endOfWeek(d, { weekStartsOn: 1 }), "下一周"); };
  const pickPrevMonth = () => { const d = subMonths(getBeijingTodayDate(), 1); chooseRange(startOfMonth(d), endOfMonth(d), "上个月"); };
  const pickNextMonth = () => { const d = addMonths(getBeijingTodayDate(), 1); chooseRange(startOfMonth(d), endOfMonth(d), "下个月"); };
  const pickThisMonth = () => { const d = getBeijingTodayDate(); chooseRange(startOfMonth(d), endOfMonth(d), "本月"); };

  const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 0 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  const displayText = rangeView
    ? `${rangeView.label} ${rangeView.start.slice(4,6)}/${rangeView.start.slice(6,8)}-${rangeView.end.slice(4,6)}/${rangeView.end.slice(6,8)}`
    : format(selectedDate, "yyyy-MM-dd");
  const labelClass = compact ? "mb-1 block cursor-pointer text-[11px] font-medium text-stone-600" : "mb-1 block cursor-pointer text-sm font-medium text-stone-700";
  const buttonClass = compact
    ? "w-full min-w-0 max-w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-left text-[13px] text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none"
    : "w-full min-w-0 sm:min-w-[200px] max-w-full rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-left text-sm text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none";

  return (
    <div className="relative inline-block max-w-full">
      {hideLabel ? null : <label onClick={() => setOpen(true)} className={labelClass}>{label}</label>}
      <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)} className={buttonClass}>{displayText}</button>

      {open && pos ? createPortal(
        <div ref={dropRef} className="motion-rise fixed z-[9999] w-[300px] max-h-[80vh] overflow-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-xl md:w-[340px]" style={{ top: pos.top, left: pos.left }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm text-stone-700">‹</button>
            <div className="text-sm font-semibold text-stone-900">{format(monthCursor, "yyyy年MM月")}</div>
            <button type="button" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm text-stone-700">›</button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-stone-500">{["日","一","二","三","四","五","六"].map(d => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === monthCursor.getMonth();
              const active = isSameDay(d, selectedDate);
              return (<button key={`${format(d,"yyyyMMdd")}-${i}`} type="button" onClick={() => chooseDate(d)} className={`h-9 rounded-xl text-sm transition ${active ? "bg-stone-900 text-white" : inMonth ? "text-stone-800 hover:bg-amber-50" : "text-stone-300"}`}>{d.getDate()}</button>);
            })}
          </div>
          <div className="mt-3 space-y-2 border-t border-stone-200 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-600">过去</span>
              <button type="button" onClick={pickPrevWeek} className="rounded-full border border-stone-300 px-3 py-1">前一周</button>
              <button type="button" onClick={pickPrevMonth} className="rounded-full border border-stone-300 px-3 py-1">上个月</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">本月</span>
              <button type="button" onClick={pickThisMonth} className="rounded-full border border-stone-300 px-3 py-1">本月</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">未来</span>
              <button type="button" onClick={pickNextWeek} className="rounded-full border border-stone-300 px-3 py-1">下一周</button>
              <button type="button" onClick={pickNextMonth} className="rounded-full border border-stone-300 px-3 py-1">下个月</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
