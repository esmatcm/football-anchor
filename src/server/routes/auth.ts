import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { logAdminAction } from "../adminAudit.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production environment");
}

const captchaStore = new Map<string, { answer: number; expireAt: number }>();
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_IP_ATTEMPTS = 20;
const LOGIN_MAX_USER_ATTEMPTS = 8;
const ipFailures = new Map<string, number[]>();
const userFailures = new Map<string, number[]>();
const ipLocks = new Map<string, number>();
const userLocks = new Map<string, number>();

const clearExpiredCaptcha = () => {
  const now = Date.now();
  for (const [key, value] of captchaStore.entries()) {
    if (value.expireAt < now) captchaStore.delete(key);
  }
};

const getClientIp = (req: any) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
};

const pruneFailures = (store: Map<string, number[]>, now: number) => {
  for (const [key, values] of store.entries()) {
    const kept = values.filter((ts) => now - ts < LOGIN_WINDOW_MS);
    if (kept.length > 0) store.set(key, kept);
    else store.delete(key);
  }
};

const clearExpiredLocks = (store: Map<string, number>, now: number) => {
  for (const [key, expiresAt] of store.entries()) {
    if (expiresAt <= now) store.delete(key);
  }
};

const recordFailure = (store: Map<string, number[]>, lockStore: Map<string, number>, key: string, maxAttempts: number, now: number) => {
  const current = (store.get(key) || []).filter((ts) => now - ts < LOGIN_WINDOW_MS);
  current.push(now);
  store.set(key, current);
  if (current.length >= maxAttempts) {
    lockStore.set(key, now + LOGIN_LOCK_MS);
  }
};

const getRetrySeconds = (lockStore: Map<string, number>, key: string, now: number) => {
  const expiresAt = lockStore.get(key);
  if (!expiresAt || expiresAt <= now) return 0;
  return Math.max(1, Math.ceil((expiresAt - now) / 1000));
};

const rejectIfLocked = (req: any, res: any, username: string) => {
  const now = Date.now();
  pruneFailures(ipFailures, now);
  pruneFailures(userFailures, now);
  clearExpiredLocks(ipLocks, now);
  clearExpiredLocks(userLocks, now);

  const ip = getClientIp(req);
  const retryIp = getRetrySeconds(ipLocks, ip, now);
  const retryUser = getRetrySeconds(userLocks, username, now);
  const retryAfter = Math.max(retryIp, retryUser);

  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: `登录失败次数过多，请 ${retryAfter} 秒后再试` });
    return true;
  }

  return false;
};

const onLoginFailure = (req: any, username: string, reason: string) => {
  const now = Date.now();
  const ip = getClientIp(req);
  recordFailure(ipFailures, ipLocks, ip, LOGIN_MAX_IP_ATTEMPTS, now);
  if (username) recordFailure(userFailures, userLocks, username, LOGIN_MAX_USER_ATTEMPTS, now);
  console.warn(`[AUTH] login failure ip=${ip} username=${username || "<empty>"} reason=${reason}`);
};

const onLoginSuccess = (req: any, username: string) => {
  const ip = getClientIp(req);
  ipFailures.delete(ip);
  ipLocks.delete(ip);
  if (username) {
    userFailures.delete(username);
    userLocks.delete(username);
  }
};

const normalizeAnchorPayload = (body: any = {}) => ({
  username: String(body.username || "").trim(),
  password: String(body.password || ""),
  nickname: String(body.nickname || "").trim(),
  phone: String(body.phone || "").trim(),
  wechat: String(body.wechat || "").trim(),
  qq: String(body.qq || "").trim(),
  note: String(body.note || "").trim(),
  status: body.status === "inactive" ? "inactive" : "active",
});

const parseAnchorUserId = (raw: string) => Number(raw);

// Middleware to authenticate
export const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireAdmin = (req: any, res: any, next: any) => {
  if (!["total_admin","super_admin","admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

router.get("/captcha", (_req, res) => {
  clearExpiredCaptcha();
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const id = randomUUID();
  captchaStore.set(id, {
    answer: a + b,
    expireAt: Date.now() + CAPTCHA_TTL_MS,
  });

  res.json({ captcha_id: id, question: `${a} + ${b} = ?` });
});

router.post("/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const captcha_id = String(req.body?.captcha_id || "");
  const captcha_value = req.body?.captcha_value;
  clearExpiredCaptcha();

  if (rejectIfLocked(req, res, username)) {
    return;
  }

  const captcha = captchaStore.get(captcha_id);
  if (!captcha || captcha.expireAt < Date.now() || Number(captcha_value) !== captcha.answer) {
    if (captcha_id) captchaStore.delete(captcha_id);
    onLoginFailure(req, username, "captcha");
    return res.status(400).json({ error: "数字验证错误，请重试" });
  }
  captchaStore.delete(captcha_id);
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    onLoginFailure(req, username, "credentials");
    return res.status(401).json({ error: "账号或密码错误" });
  }

  if (user.status !== "active") {
    onLoginFailure(req, username, "inactive");
    return res.status(403).json({ error: "Account inactive" });
  }

  onLoginSuccess(req, username);

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, nickname: user.nickname }, JWT_SECRET, {
    expiresIn: "24h",
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      nickname: user.nickname,
      must_change_password: Number(user.must_change_password || 0),
    },
  });
});

router.post("/change-password", authenticate, (req: any, res: any) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ error: "旧密码和新密码不能为空" });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: "新密码长度至少 6 位" });
  }

  const currentUser = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
  if (!currentUser) return res.status(404).json({ error: "用户不存在" });

  if (!bcrypt.compareSync(old_password, currentUser.password_hash)) {
    return res.status(400).json({ error: "旧密码错误" });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, req.user.id);

  res.json({ success: true });
});

// Admin: Get all anchors
router.get("/anchors", authenticate, requireAdmin, (_req, res) => {
  const anchors = db.prepare(`
    SELECT
      u.id as user_id,
      u.username,
      u.nickname,
      u.status,
      u.must_change_password,
      a.id as anchor_id,
      a.phone,
      a.wechat,
      a.qq,
      a.note
    FROM users u
    JOIN anchors a ON u.id = a.user_id
    WHERE u.role = 'anchor'
    ORDER BY u.id DESC
  `).all();
  res.json(anchors);
});

// Admin: Create anchor
router.post("/anchors", authenticate, requireAdmin, (req, res) => {
  const payload = normalizeAnchorPayload(req.body);
  if (!payload.username || !payload.password || !payload.nickname) {
    return res.status(400).json({ error: "账号、密码、昵称必填" });
  }

  try {
    const createAnchor = db.transaction(() => {
      const hash = bcrypt.hashSync(payload.password, 10);
      const result = db.prepare("INSERT INTO users (username, password_hash, role, nickname, status, must_change_password) VALUES (?, ?, 'anchor', ?, ?, 1)").run(
        payload.username,
        hash,
        payload.nickname,
        payload.status,
      );
      const userId = Number(result.lastInsertRowid);
      db.prepare("INSERT INTO anchors (user_id, phone, wechat, qq, note) VALUES (?, ?, ?, ?, ?)").run(
        userId,
        payload.phone || null,
        payload.wechat || null,
        payload.qq || null,
        payload.note || null,
      );
      return userId;
    });

    const userId = createAnchor();
    res.json({ success: true, userId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Reset anchor password
router.post("/anchors/:userId/reset-password", authenticate, requireAdmin, (req, res) => {
  const userId = parseAnchorUserId(req.params.userId);
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "密码不能为空" });
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId) as any;
  if (!user || user.role !== "anchor") return res.status(404).json({ error: "主播不存在" });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, userId);
  logAdminAction({
    actorUserId: (req as any).user?.id,
    action: "anchor.reset_password",
    targetType: "anchor_user",
    targetId: userId,
    summary: `重置主播密码 ${userId}`,
  });
  res.json({ success: true });
});

// Admin: Update anchor
router.put("/anchors/:userId", authenticate, requireAdmin, (req, res) => {
  const userId = parseAnchorUserId(req.params.userId);
  const payload = normalizeAnchorPayload(req.body);

  const target = db.prepare("SELECT u.id, u.role FROM users u JOIN anchors a ON a.user_id = u.id WHERE u.id = ?").get(userId) as any;
  if (!target || target.role !== "anchor") return res.status(404).json({ error: "主播不存在" });
  if (!payload.nickname) return res.status(400).json({ error: "昵称不能为空" });

  try {
    const updateAnchor = db.transaction(() => {
      if (payload.password) {
        const hash = bcrypt.hashSync(payload.password, 10);
        db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, userId);
      }
      db.prepare("UPDATE users SET nickname = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(payload.nickname, payload.status, userId);
      db.prepare("UPDATE anchors SET phone = ?, wechat = ?, qq = ?, note = ? WHERE user_id = ?").run(
        payload.phone || null,
        payload.wechat || null,
        payload.qq || null,
        payload.note || null,
        userId,
      );
    });

    updateAnchor();
    logAdminAction({
      actorUserId: (req as any).user?.id,
      action: "anchor.update",
      targetType: "anchor_user",
      targetId: userId,
      summary: `更新主播 ${userId}`,
      detail: { status: payload.status, nickname: payload.nickname, passwordUpdated: Boolean(payload.password) },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Delete anchor
router.delete("/anchors/:userId", authenticate, requireAdmin, (req, res) => {
  const userId = parseAnchorUserId(req.params.userId);
  const anchor = db.prepare(`
    SELECT a.id AS anchor_id, u.id AS user_id, u.role
    FROM users u
    JOIN anchors a ON a.user_id = u.id
    WHERE u.id = ?
  `).get(userId) as any;

  if (!anchor || anchor.role !== "anchor") return res.status(404).json({ error: "主播不存在" });

  try {
    const removeAnchor = db.transaction(() => {
      db.prepare("DELETE FROM applications WHERE anchor_id = ?").run(anchor.anchor_id);
      db.prepare("DELETE FROM assignments WHERE anchor_id = ?").run(anchor.anchor_id);
      db.prepare("DELETE FROM anchors WHERE id = ?").run(anchor.anchor_id);
      db.prepare("DELETE FROM users WHERE id = ? AND role = 'anchor'").run(userId);
    });

    removeAnchor();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (!["total_admin","super_admin"].includes(req.user.role)) return res.status(403).json({ error: "仅高权限管理员可操作" });
  next();
};

router.get("/admins", authenticate, requireSuperAdmin, (req: any, res: any) => {
  const sql = req.user.role === "total_admin"
    ? "SELECT id, username, role, nickname, status, must_change_password, created_at FROM users WHERE role IN ('admin','super_admin','total_admin') ORDER BY id DESC"
    : "SELECT id, username, role, nickname, status, must_change_password, created_at FROM users WHERE role IN ('admin','super_admin') ORDER BY id DESC";
  const admins = db.prepare(sql).all();
  res.json(admins);
});

router.get("/admin-action-logs", authenticate, requireSuperAdmin, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
  const rows = db.prepare(`
    SELECT l.id, l.action, l.target_type, l.target_id, l.summary, l.detail_json, l.created_at,
           u.username AS actor_username,
           u.nickname AS actor_nickname
    FROM admin_action_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

router.post("/admins", authenticate, requireSuperAdmin, (req, res) => {
  const { username, password, nickname } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "账号和密码必填" });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare("INSERT INTO users (username, password_hash, role, nickname, status, must_change_password) VALUES (?, ?, 'admin', ?, 'active', 1)").run(username, hash, nickname || username);
    logAdminAction({
      actorUserId: (req as any).user?.id,
      action: "admin.create",
      targetType: "admin_user",
      targetId: Number(r.lastInsertRowid),
      summary: `创建管理员 ${username}`,
      detail: { username, nickname: nickname || username },
    });
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/admins/:id/status", authenticate, requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === "inactive" ? "inactive" : "active";
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as any;
  if (!target || target.role !== "admin") return res.status(404).json({ error: "管理员不存在" });
  db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
  logAdminAction({
    actorUserId: (req as any).user?.id,
    action: "admin.update_status",
    targetType: "admin_user",
    targetId: id,
    summary: `管理员状态 -> ${status}`,
  });
  res.json({ success: true });
});

router.post("/admins/:id/reset-password", authenticate, requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ error: "密码不能为空" });
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as any;
  if (!target || target.role !== "admin") return res.status(404).json({ error: "管理员不存在" });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, id);
  logAdminAction({
    actorUserId: (req as any).user?.id,
    action: "admin.reset_password",
    targetType: "admin_user",
    targetId: id,
    summary: `重置管理员密码 ${id}`,
  });
  res.json({ success: true });
});

router.delete("/admins/:id", authenticate, requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as any;
  if (!target || target.role !== "admin") return res.status(404).json({ error: "管理员不存在" });
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(id);
  logAdminAction({
    actorUserId: (req as any).user?.id,
    action: "admin.delete",
    targetType: "admin_user",
    targetId: id,
    summary: `删除管理员 ${id}`,
  });
  res.json({ success: true });
});


// ─── Sites management ───

router.get('/sites', authenticate, requireAdmin, (_req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY id').all();
  res.json(sites);
});

router.get('/anchors-with-sites', authenticate, requireAdmin, (_req, res) => {
  const anchors = db.prepare(`
    SELECT
      u.id as user_id,
      u.username,
      u.nickname,
      u.status,
      u.must_change_password,
      a.id as anchor_id,
      a.phone,
      a.wechat,
      a.qq,
      a.note,
      GROUP_CONCAT(s.code) as site_codes,
      GROUP_CONCAT(s.name) as site_names
    FROM users u
    JOIN anchors a ON u.id = a.user_id
    LEFT JOIN anchor_sites acs ON a.id = acs.anchor_id
    LEFT JOIN sites s ON acs.site_id = s.id AND s.is_active = 1
    WHERE u.role = 'anchor'
    GROUP BY u.id
    ORDER BY u.id DESC
  `).all();
  res.json(anchors);
});

router.put('/anchor-sites/:anchorId', authenticate, requireAdmin, (req: any, res) => {
  const anchorId = Number(req.params.anchorId);
  const siteIds: number[] = Array.isArray(req.body?.site_ids) ? req.body.site_ids.map(Number) : [];
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM anchor_sites WHERE anchor_id = ?').run(anchorId);
      const ins = db.prepare('INSERT INTO anchor_sites (anchor_id, site_id) VALUES (?, ?)');
      for (const sid of siteIds) ins.run(anchorId, sid);
    });
    tx();
    logAdminAction({
      actorUserId: req.user?.id,
      action: 'anchor.update_sites',
      targetType: 'anchor',
      targetId: anchorId,
      summary: `更新主播站点 anchor_id=${anchorId} sites=[${siteIds.join(',')}]`,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
