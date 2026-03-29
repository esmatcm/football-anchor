export function getTzDateParts(timeZone = "Asia/Shanghai", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function getBeijingTodayYmd(date = new Date()) {
  const { year, month, day } = getTzDateParts("Asia/Shanghai", date);
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

export function parseYmdAsLocalNoon(v: string) {
  if (!/^\d{8}$/.test(v)) {
    const { year, month, day } = getTzDateParts("Asia/Shanghai", new Date());
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(4, 6));
  const day = Number(v.slice(6, 8));
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function getBeijingTodayDate(date = new Date()) {
  return parseYmdAsLocalNoon(getBeijingTodayYmd(date));
}
