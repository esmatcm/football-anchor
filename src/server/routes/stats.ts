import express from "express";
import { db } from "../db.js";
import { authenticate, requireAdmin } from "./auth.js";

const router = express.Router();

router.get("/today", authenticate, requireAdmin, (req, res) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const today = `${year}${month}${day}`;

  const scraped = (db.prepare("SELECT COUNT(*) as count FROM matches WHERE match_date = ?").get(today) as any)?.count || 0;
  const open = (db.prepare("SELECT COUNT(*) as count FROM matches WHERE match_date = ? AND is_open = 1").get(today) as any)?.count || 0;

  const scheduled = (db.prepare(`
    SELECT COUNT(DISTINCT a.anchor_id) as count
    FROM assignments a
    JOIN matches m ON a.match_id = m.id
    WHERE m.match_date = ?
  `).get(today) as any)?.count || 0;

  const pending = (db.prepare(`
    SELECT COUNT(*) as count
    FROM applications ap
    JOIN matches m ON ap.match_id = m.id
    WHERE m.match_date = ? AND ap.status = 'pending'
  `).get(today) as any)?.count || 0;

  const incidents = (db.prepare(`
    SELECT COUNT(*) as count
    FROM assignments a
    JOIN matches m ON a.match_id = m.id
    WHERE m.match_date = ? AND a.incident_flag = 1
  `).get(today) as any)?.count || 0;

  // Site breakdown for today
  const siteBreakdown = db.prepare(`
    SELECT s.code, s.name, COUNT(*) as count
    FROM assignments a
    JOIN matches m ON a.match_id = m.id
    LEFT JOIN sites s ON s.id = a.site_id
    WHERE m.match_date = ?
    GROUP BY s.code, s.name
  `).all(today) as any[];

  const siteStats: Record<string, number> = {};
  let unassignedSite = 0;
  for (const r of siteBreakdown) {
    if (r.code) siteStats[r.code] = Number(r.count || 0);
    else unassignedSite += Number(r.count || 0);
  }

  res.json({ scraped, open, scheduled, pending, incidents, siteStats, unassignedSite });
});



router.get("/anchor-monthly", authenticate, requireAdmin, (req, res) => {
  const monthInput = String(req.query.month || "").trim();
  const metric = String(req.query.metric || "approved"); // YYYYMM
  const now = new Date();
  const baseYear = /^\d{6}$/.test(monthInput) ? Number(monthInput.slice(0, 4)) : now.getFullYear();
  const baseMonth = /^\d{6}$/.test(monthInput) ? Number(monthInput.slice(4, 6)) - 1 : now.getMonth();

  const monthStart = new Date(baseYear, baseMonth, 1);
  const nextMonthStart = new Date(baseYear, baseMonth + 1, 1);
  const prevMonthStart = new Date(baseYear, baseMonth - 1, 1);

  const fmt = (d: Date) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  const curStart = fmt(monthStart);
  const curEnd = fmt(new Date(nextMonthStart.getTime() - 86400000));
  const prevStart = fmt(prevMonthStart);
  const prevEnd = fmt(new Date(monthStart.getTime() - 86400000));

  const q = metric === "completed"
    ? `
    SELECT
      u.id as user_id,
      u.username,
      u.nickname,
      COUNT(DISTINCT m.match_date) as success_days,
      COUNT(*) as success_matches
    FROM assignments asg
    JOIN anchors a ON asg.anchor_id = a.id
    JOIN users u ON a.user_id = u.id
    JOIN matches m ON asg.match_id = m.id
    WHERE asg.status = 'completed'
      AND m.match_date >= ?
      AND m.match_date <= ?
    GROUP BY u.id, u.username, u.nickname
  `
    : `
    SELECT
      u.id as user_id,
      u.username,
      u.nickname,
      COUNT(DISTINCT m.match_date) as success_days,
      COUNT(*) as success_matches
    FROM applications ap
    JOIN anchors a ON ap.anchor_id = a.id
    JOIN users u ON a.user_id = u.id
    JOIN matches m ON ap.match_id = m.id
    WHERE ap.status = 'approved'
      AND m.match_date >= ?
      AND m.match_date <= ?
    GROUP BY u.id, u.username, u.nickname
  `;

  const curRows = db.prepare(q).all(curStart, curEnd) as any[];
  const prevRows = db.prepare(q).all(prevStart, prevEnd) as any[];

  const map: Record<string, any> = {};
  const ensure = (r: any) => {
    if (!map[r.user_id]) {
      map[r.user_id] = {
        user_id: r.user_id,
        username: r.username,
        nickname: r.nickname || r.username,
        current: { success_days: 0, success_matches: 0, fee: 0 },
        previous: { success_days: 0, success_matches: 0, fee: 0 },
      };
    }
    return map[r.user_id];
  };

  for (const r of curRows) {
    const row = ensure(r);
    row.current.success_days = Number(r.success_days || 0);
    row.current.success_matches = Number(r.success_matches || 0);
    row.current.fee = row.current.success_matches * 1600;
  }
  for (const r of prevRows) {
    const row = ensure(r);
    row.previous.success_days = Number(r.success_days || 0);
    row.previous.success_matches = Number(r.success_matches || 0);
    row.previous.fee = row.previous.success_matches * 1600;
  }

  // Add site breakdown per anchor for current month
  const siteQ = `
    SELECT u.id as user_id, s.code as site_code, s.name as site_name, COUNT(*) as cnt
    FROM assignments asg
    JOIN anchors a ON asg.anchor_id = a.id
    JOIN users u ON a.user_id = u.id
    JOIN matches m ON asg.match_id = m.id
    LEFT JOIN sites s ON s.id = asg.site_id
    WHERE m.match_date >= ? AND m.match_date <= ?
    GROUP BY u.id, s.code, s.name
  `;
  const siteRows = db.prepare(siteQ).all(curStart, curEnd) as any[];
  for (const sr of siteRows) {
    const row = map[sr.user_id];
    if (!row) continue;
    if (!row.current.sites) row.current.sites = {};
    row.current.sites[sr.site_code || 'unassigned'] = { name: sr.site_name || '\u672a\u5206\u914d', count: Number(sr.cnt || 0) };
  }

  const rows = Object.values(map).sort((a: any, b: any) => b.current.fee - a.current.fee);

  res.json({
    currentMonth: `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}`,
    previousMonth: `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}`,
    unitPrice: 1600,
    metric,
    rows,
  });
});

router.get("/anchor-monthly/:userId/details", authenticate, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const monthInput = String(req.query.month || "").trim();
  const metric = String(req.query.metric || "approved");
  const now = new Date();
  const baseYear = /^\d{6}$/.test(monthInput) ? Number(monthInput.slice(0, 4)) : now.getFullYear();
  const baseMonth = /^\d{6}$/.test(monthInput) ? Number(monthInput.slice(4, 6)) - 1 : now.getMonth();
  const monthStart = new Date(baseYear, baseMonth, 1);
  const nextMonthStart = new Date(baseYear, baseMonth + 1, 1);

  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const start = fmt(monthStart);
  const end = fmt(new Date(nextMonthStart.getTime() - 86400000));

  const detailSql = metric === "completed"
    ? `
    SELECT
      m.match_date,
      COUNT(*) as success_matches,
      GROUP_CONCAT(m.kickoff_time || ' ' || m.home_team || ' vs ' || m.away_team, '
') as matches
    FROM assignments asg
    JOIN anchors a ON asg.anchor_id = a.id
    JOIN users u ON a.user_id = u.id
    JOIN matches m ON asg.match_id = m.id
    WHERE asg.status = 'completed'
      AND u.id = ?
      AND m.match_date >= ?
      AND m.match_date <= ?
    GROUP BY m.match_date
    ORDER BY m.match_date ASC
  `
    : `
    SELECT
      m.match_date,
      COUNT(*) as success_matches,
      GROUP_CONCAT(m.kickoff_time || ' ' || m.home_team || ' vs ' || m.away_team, '
') as matches
    FROM applications ap
    JOIN anchors a ON ap.anchor_id = a.id
    JOIN users u ON a.user_id = u.id
    JOIN matches m ON ap.match_id = m.id
    WHERE ap.status = 'approved'
      AND u.id = ?
      AND m.match_date >= ?
      AND m.match_date <= ?
    GROUP BY m.match_date
    ORDER BY m.match_date ASC
  `;

  const rows = db.prepare(detailSql).all(userId, start, end) as any[];

  const totalMatches = rows.reduce((n, r) => n + Number(r.success_matches || 0), 0);
  res.json({ month: `${baseYear}${String(baseMonth + 1).padStart(2, "0")}`, unitPrice: 1600, metric, totalMatches, totalFee: totalMatches * 1600, rows });
});



function getAutoScrapeDaysAhead() {
  const raw = Number(process.env.AUTO_SCRAPE_DAYS_AHEAD ?? 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(0, Math.min(60, Math.floor(raw)));
}

router.get("/auto-scrape-status", authenticate, requireAdmin, (_req, res) => {
  const intervalMs = Number(process.env.AUTO_SCRAPE_INTERVAL_MS || 30 * 60 * 1000);
  const enabled = process.env.AUTO_SCRAPE !== "0";
  const daysAhead = getAutoScrapeDaysAhead();
  const last = db.prepare(`
    SELECT fetch_date, source_url, fetch_status, success_count, total_count, created_at
    FROM fetch_jobs
    ORDER BY id DESC
    LIMIT 20
  `).all() as any[];

  const latestSuccess = last.find((x) => x.fetch_status === "success") || null;
  const nextRunAt = enabled ? new Date(Date.now() + intervalMs).toISOString() : null;

  res.json({ enabled, intervalMs, daysAhead, nextRunAt, latestSuccess, recent: last.slice(0, 10) });
});



router.get("/reconcile", authenticate, requireAdmin, (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!/^\d{8}$/.test(date)) return res.status(400).json({ error: "date(YYYYMMDD) required" });

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as total,
           SUM(CASE WHEN is_open = 1 THEN 1 ELSE 0 END) as open_count
    FROM matches
    WHERE match_date = ?
    GROUP BY category
  `).all(date) as any[];

  const appStats = db.prepare(`
    SELECT m.category, ap.status, COUNT(*) as cnt
    FROM applications ap
    JOIN matches m ON ap.match_id = m.id
    WHERE m.match_date = ?
    GROUP BY m.category, ap.status
  `).all(date) as any[];

  const result: Record<string, any> = {};
  for (const r of byCategory) {
    result[r.category || "足球"] = {
      total: Number(r.total || 0),
      open: Number(r.open_count || 0),
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlist: 0,
    };
  }
  for (const a of appStats) {
    const c = a.category || "足球";
    result[c] = result[c] || { total: 0, open: 0, pending: 0, approved: 0, rejected: 0, waitlist: 0 };
    result[c][a.status] = Number(a.cnt || 0);
  }

  res.json({ date, result });
});



router.get("/role-overview", authenticate, requireAdmin, (req: any, res) => {
  const roleCounts = db.prepare("SELECT role, COUNT(*) as count FROM users GROUP BY role").all();
  const users = db.prepare("SELECT id, username, nickname, role, status FROM users ORDER BY id").all();
  res.json({ viewer: { id: req.user.id, username: req.user.username, role: req.user.role }, roleCounts, users });
});



router.delete("/anchor-monthly/:userId/date/:date", authenticate, requireAdmin, (_req, res) => {
  return res.status(403).json({
    error: "月统计移除功能已停用：统计修正暂不再直接改业务事实数据，请走后续安全版修正流程。",
  });
});

export default router;
