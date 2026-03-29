import express from "express";
import { db } from "../db.js";
import { authenticate, requireAdmin } from "./auth.js";
import { logAdminAction } from "../adminAudit.js";
import { hasMatchStarted, parseMatchKickoff } from "../../lib/matchTime.js";

const router = express.Router();

const autoCloseReviewMatchesForDate = (date: string) => {
  const openMatches = db.prepare(`
    SELECT m.*,
           COALESCE((SELECT COUNT(1) FROM applications a WHERE a.match_id = m.id), 0) AS application_count
    FROM matches m
    WHERE m.match_date = ? AND (m.is_open = 1 OR m.apply_deadline IS NOT NULL)
    ORDER BY m.kickoff_time ASC, m.id ASC
  `).all(date) as any[];

  const now = Date.now();
  let autoClosedCount = 0;

  const closeStmt = db.prepare(`
    UPDATE matches
    SET is_open = 0,
        admin_note = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_open = 1
  `);

  const tx = db.transaction(() => {
    for (const match of openMatches) {
      const kickoff = parseMatchKickoff(match.match_date, match.kickoff_time);
      if (!kickoff) continue;

      const diffMinutes = Math.floor((kickoff.getTime() - now) / 60000);
      const hasApps = Number(match.application_count || 0) > 0;

      // Already started: always close regardless of applications
      if (diffMinutes < 0) {
        const result = closeStmt.run("系统自动结束报名：比赛已开赛", match.id);
        if (result.changes > 0) autoClosedCount += 1;
        continue;
      }

      // Within 30 min of kickoff and no applications: close
      if (!hasApps && diffMinutes <= 30) {
        const result = closeStmt.run("系统自动结束报名：开赛前30分钟无人报名", match.id);
        if (result.changes > 0) autoClosedCount += 1;
      }
    }
  });

  tx();

  const matches = db.prepare(`
    SELECT m.*,
           COALESCE((SELECT COUNT(1) FROM applications a WHERE a.match_id = m.id), 0) AS application_count,
           COALESCE((SELECT COUNT(1) FROM applications a WHERE a.match_id = m.id AND a.status = 'approved'), 0) AS approved_count,
           COALESCE((SELECT COUNT(1) FROM applications a WHERE a.match_id = m.id AND a.status = 'pending'), 0) AS pending_count
    FROM matches m
    WHERE m.match_date = ? AND (m.is_open = 1 OR m.apply_deadline IS NOT NULL)
    ORDER BY m.kickoff_time ASC, m.id ASC
  `).all(date);

  return { matches, autoClosedCount };
};

// Anchor: Apply for a match
router.post("/apply", authenticate, (req: any, res) => {
  const { match_id } = req.body;
  const user_id = req.user.id;

  try {
    const anchor = db.prepare("SELECT id FROM anchors WHERE user_id = ?").get(user_id) as any;
    if (!anchor) return res.status(400).json({ error: "Anchor profile not found" });

    const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(match_id) as any;
    if (!match || !match.is_open) return res.status(400).json({ error: "Match not open for application" });

    if (match.apply_deadline && new Date() > new Date(match.apply_deadline)) {
      return res.status(400).json({ error: "Application deadline passed" });
    }

    if (hasMatchStarted(match)) {
      return res.status(400).json({ error: "Match already started" });
    }

    db.prepare(`
      INSERT INTO applications (match_id, anchor_id, status)
      VALUES (?, ?, 'pending')
    `).run(match_id, anchor.id);

    res.json({ success: true });
  } catch (err: any) {
    if (err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Already applied" });
    }
    res.status(400).json({ error: err.message });
  }
});

// Anchor: Cancel application
router.delete("/apply/:match_id", authenticate, (req: any, res) => {
  const { match_id } = req.params;
  const user_id = req.user.id;

  try {
    const anchor = db.prepare("SELECT id FROM anchors WHERE user_id = ?").get(user_id) as any;
    if (!anchor) return res.status(400).json({ error: "Anchor profile not found" });

    const app = db.prepare("SELECT * FROM applications WHERE match_id = ? AND anchor_id = ?").get(match_id, anchor.id) as any;
    if (!app || app.status !== 'pending') return res.status(400).json({ error: "Cannot cancel non-pending application" });

    db.prepare("DELETE FROM applications WHERE id = ?").run(app.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Anchor: Get my applications
router.get("/my", authenticate, (req: any, res) => {
  const user_id = req.user.id;
  const anchor = db.prepare("SELECT id FROM anchors WHERE user_id = ?").get(user_id) as any;
  if (!anchor) return res.json([]);

  const apps = db.prepare(`
    SELECT a.*, m.match_date, m.kickoff_time, m.league_name, m.home_team, m.away_team
    FROM applications a
    JOIN matches m ON a.match_id = m.id
    WHERE a.anchor_id = ?
    ORDER BY m.match_date DESC, m.kickoff_time DESC
  `).all(anchor.id);
  res.json(apps);
});

// Admin: Get review matches for a day
router.get("/review-matches", authenticate, requireAdmin, (req, res) => {
  const date = String(req.query?.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required" });

  try {
    const result = autoCloseReviewMatchesForDate(date);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Get all applications for a match (with site info from assignments)
router.get("/match/:match_id", authenticate, requireAdmin, (req, res) => {
  const { match_id } = req.params;
  const apps = db.prepare(`
    SELECT a.*, u.nickname, u.username, an.phone,
           asg.site_id,
           s.name AS site_name,
           s.code AS site_code
    FROM applications a
    JOIN anchors an ON a.anchor_id = an.id
    JOIN users u ON an.user_id = u.id
    LEFT JOIN assignments asg ON asg.match_id = a.match_id AND asg.anchor_id = a.anchor_id
    LEFT JOIN sites s ON s.id = asg.site_id
    WHERE a.match_id = ?
  `).all(match_id);
  res.json(apps);
});

// Admin: Get available sites
router.get("/sites", authenticate, requireAdmin, (_req, res) => {
  const sites = db.prepare("SELECT * FROM sites WHERE is_active = 1 ORDER BY id").all();
  res.json(sites);
});

// Admin: Review application (with site_id for approved)
router.put("/review/:id", authenticate, requireAdmin, (req: any, res) => {
  const { status, review_note, site_id } = req.body;
  const finalNote = review_note || (status === "approved" ? "系统通知：报名已通过" : status === "rejected" ? "系统通知：报名未通过" : "系统通知：报名进入候补");
  const appId = req.params.id;
  const adminId = req.user.id;

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE applications
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
        WHERE id = ?
      `).run(status, adminId, finalNote, appId);

      if (status === 'approved') {
        const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId) as any;
        const siteVal = site_id ? Number(site_id) : null;
        db.prepare(`
          INSERT INTO assignments (match_id, anchor_id, status, site_id)
          VALUES (?, ?, 'scheduled', ?)
          ON CONFLICT(match_id, anchor_id) DO UPDATE SET status = 'scheduled', site_id = ?
        `).run(app.match_id, app.anchor_id, siteVal, siteVal);
      } else if (status === 'rejected' || status === 'waitlist') {
        const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId) as any;
        db.prepare(`
          DELETE FROM assignments WHERE match_id = ? AND anchor_id = ?
        `).run(app.match_id, app.anchor_id);
      }
    });
    transaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Update assignment site
router.put("/assignment/:id/site", authenticate, requireAdmin, (req: any, res) => {
  const { site_id } = req.body;
  const assignmentId = req.params.id;
  const adminId = req.user.id;
  try {
    const siteVal = site_id ? Number(site_id) : null;
    db.prepare("UPDATE assignments SET site_id = ? WHERE id = ?").run(siteVal, assignmentId);
    logAdminAction({
      actorUserId: adminId,
      action: "assignment.update_site",
      targetType: "assignment",
      targetId: assignmentId,
      summary: `更新排班站点 -> site_id=${siteVal}`,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Batch review applications (with site_id for approved)
router.put("/review-batch", authenticate, requireAdmin, (req: any, res) => {
  const { ids, status, review_note, site_id } = req.body || {};
  const finalNote = review_note || (status === "approved" ? "系统通知：报名已通过" : status === "rejected" ? "系统通知：报名未通过" : "系统通知：报名进入候补");
  const adminId = req.user.id;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  if (!["approved", "rejected", "waitlist"].includes(status)) return res.status(400).json({ error: "invalid status" });

  try {
    const tx = db.transaction(() => {
      for (const appId of ids) {
        db.prepare(`
          UPDATE applications
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
          WHERE id = ?
        `).run(status, adminId, finalNote, appId);

        const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId) as any;
        if (!app) continue;

        if (status === 'approved') {
          const siteVal = site_id ? Number(site_id) : null;
          db.prepare(`
            INSERT INTO assignments (match_id, anchor_id, status, site_id)
            VALUES (?, ?, 'scheduled', ?)
            ON CONFLICT(match_id, anchor_id) DO UPDATE SET status = 'scheduled', site_id = ?
          `).run(app.match_id, app.anchor_id, siteVal, siteVal);
        } else {
          db.prepare("DELETE FROM assignments WHERE match_id = ? AND anchor_id = ?").run(app.match_id, app.anchor_id);
        }
      }
    });
    tx();
    logAdminAction({
      actorUserId: adminId,
      action: "application.review_batch",
      targetType: "application_batch",
      targetId: String(ids.length),
      summary: `批次审核 -> ${status} (${ids.length})`,
      detail: { ids, status, site_id },
    });
    res.json({ success: true, count: ids.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Day schedule overview with application status and site info
router.get("/day-overview", authenticate, requireAdmin, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date is required" });

  const rows = db.prepare(`
    SELECT
      m.id,
      m.match_date,
      m.kickoff_time,
      m.league_name,
      m.home_team,
      m.away_team,
      m.is_open,
      m.apply_deadline,
      m.match_status,
      m.category,
      m.required_anchor_count,
      SUM(CASE WHEN ap.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN ap.status = 'approved' THEN 1 ELSE 0 END) AS approved_application_count,
      SUM(CASE WHEN ap.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN ap.status = 'pending' THEN 1 ELSE 0 END) AS pending_application_count,
      COALESCE((SELECT COUNT(1) FROM assignments ax WHERE ax.match_id = m.id), 0) AS total_assignment_count,
      COALESCE((SELECT COUNT(1) FROM assignments ax WHERE ax.match_id = m.id AND ax.status = 'scheduled'), 0) AS scheduled_assignment_count,
      COALESCE((SELECT COUNT(1) FROM assignments ax WHERE ax.match_id = m.id AND ax.status = 'completed'), 0) AS completed_assignment_count
    FROM matches m
    LEFT JOIN applications ap ON ap.match_id = m.id
    LEFT JOIN anchors an ON ap.anchor_id = an.id
    LEFT JOIN users u ON an.user_id = u.id
    WHERE m.match_date = ? AND (m.is_open = 1 OR m.apply_deadline IS NOT NULL)
    GROUP BY m.id
    ORDER BY m.kickoff_time ASC
  `).all(date) as any[];

  // Fetch per-match anchor details with site info
  const anchorDetailStmt = db.prepare(`
    SELECT
      asg.match_id,
      COALESCE(u.nickname, u.username) AS anchor_name,
      s.name AS site_name,
      s.code AS site_code
    FROM assignments asg
    JOIN anchors an ON asg.anchor_id = an.id
    JOIN users u ON an.user_id = u.id
    LEFT JOIN sites s ON s.id = asg.site_id
    WHERE asg.match_id IN (${rows.map(() => "?").join(",")})
    ORDER BY asg.id ASC
  `);

  const anchorDetails = rows.length > 0
    ? (anchorDetailStmt.all(...rows.map((r: any) => r.id)) as any[])
    : [];

  const anchorMap: Record<number, { name: string; site_name: string | null; site_code: string | null }[]> = {};
  for (const d of anchorDetails) {
    if (!anchorMap[d.match_id]) anchorMap[d.match_id] = [];
    anchorMap[d.match_id].push({ name: d.anchor_name, site_name: d.site_name, site_code: d.site_code });
  }

  const payload = rows.map((row: any) => {
    const requiredAnchorCount = Math.max(1, Number(row.required_anchor_count || 1));
    const scheduledAssignmentCount = Number(row.scheduled_assignment_count || 0);
    const details = anchorMap[row.id] || [];
    return {
      ...row,
      approved_anchors: details.map((d) => d.name).join("、"),
      anchor_details: details,
      coverage_gap: Math.max(0, requiredAnchorCount - scheduledAssignmentCount),
      has_coverage_gap: scheduledAssignmentCount < requiredAnchorCount,
    };
  });

  res.json(payload);
});

// Admin: Get assignments (with site info)
router.get("/assignments", authenticate, requireAdmin, (req, res) => {
  const { date } = req.query;
  let query = `
    SELECT a.*, m.match_date, m.kickoff_time, m.league_name, m.home_team, m.away_team, m.is_open, m.apply_deadline, m.match_status,
      m.category, m.required_anchor_count,
           COALESCE((SELECT COUNT(1) FROM assignments ax WHERE ax.match_id = m.id AND ax.status = 'scheduled'), 0) AS scheduled_assignment_count,
           COALESCE((SELECT COUNT(1) FROM applications ap WHERE ap.match_id = m.id AND ap.status = 'pending'), 0) AS pending_count,
           u.nickname,
           s.name AS site_name,
           s.code AS site_code
    FROM assignments a
    JOIN matches m ON a.match_id = m.id
    JOIN anchors an ON a.anchor_id = an.id
    JOIN users u ON an.user_id = u.id
    LEFT JOIN sites s ON s.id = a.site_id
  `;
  const params: any[] = [];
  if (date) {
    query += " WHERE m.match_date = ?";
    params.push(date);
  }
  query += " ORDER BY m.match_date DESC, m.kickoff_time DESC";

  const assignments = db.prepare(query).all(...params);
  res.json(assignments);
});

function normalizeAuditTimestamp(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

// Admin: Audit assignment
router.put("/audit/:id", authenticate, requireAdmin, (req: any, res) => {
  const { played_on_time, actual_start_time, actual_end_time, incident_flag, incident_type, incident_note } = req.body;
  const assignmentId = req.params.id;
  const adminId = req.user.id;
  const normalizedStart = normalizeAuditTimestamp(actual_start_time);
  const normalizedEnd = normalizeAuditTimestamp(actual_end_time);

  try {
    db.prepare(`
      UPDATE assignments
      SET played_on_time = ?, actual_start_time = ?, actual_end_time = ?, incident_flag = ?, incident_type = ?, incident_note = ?, audited_by = ?, audited_at = CURRENT_TIMESTAMP, status = 'completed'
      WHERE id = ?
    `).run(
      played_on_time ? 1 : 0,
      normalizedStart,
      normalizedEnd,
      incident_flag ? 1 : 0,
      incident_type || null,
      incident_note || null,
      adminId,
      assignmentId
    );
    logAdminAction({
      actorUserId: adminId,
      action: "assignment.audit",
      targetType: "assignment",
      targetId: assignmentId,
      summary: incident_flag ? "提交稽核（含异常）" : "提交稽核",
      detail: { assignmentId, played_on_time, incident_flag: Boolean(incident_flag), incident_type: incident_type || null },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Anchor: Get my assignments
router.get("/my-assignments", authenticate, (req: any, res) => {
  const user_id = req.user.id;
  const anchor = db.prepare("SELECT id FROM anchors WHERE user_id = ?").get(user_id) as any;
  if (!anchor) return res.json([]);

  const assignments = db.prepare(`
    SELECT a.*, m.match_date, m.kickoff_time, m.league_name, m.home_team, m.away_team
    FROM assignments a
    JOIN matches m ON a.match_id = m.id
    WHERE a.anchor_id = ?
    ORDER BY m.match_date DESC, m.kickoff_time DESC
  `).all(anchor.id);
  res.json(assignments);
});

export default router;
