import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3100/api';
const db = new Database('/srv/football-anchor/data/data.db');
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
const adminUsername = 'qa_test_admin';
const adminTempPassword = `QaTemp#${stamp}`;
const anchorUsername = `qa_anchor_${stamp}`;
const anchorPassword = `Anchor#${stamp}`;
const anchorPassword2 = `Anchor2#${stamp}`;
const results = [];
const cleanup = { matchIds: [], anchorUserId: null, anchorId: null, adminOriginal: null };

function assert(condition, message, extra) {
  if (!condition) {
    const err = new Error(message);
    err.extra = extra;
    throw err;
  }
}

async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${path}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login(username, password) {
  const captcha = await api('/auth/captcha');
  const m = String(captcha.question || '').match(/(\d+)\s*\+\s*(\d+)/);
  assert(m, 'captcha parse failed', captcha);
  const answer = Number(m[1]) + Number(m[2]);
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, captcha_id: captcha.captcha_id, captcha_value: answer }),
  });
  return data;
}

function makeKickoff(minutesAhead) {
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const d = new Date(Date.now() + minutesAhead * 60000 + beijingOffsetMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const utcIso = new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0)).toISOString();
  return {
    date: `${year}${pad(month)}${pad(day)}`,
    kickoff: `${month}-${day} ${pad(hour)}:${pad(minute)}`,
    iso: utcIso,
  };
}

try {
  const admin = db.prepare("SELECT id, username, password_hash, must_change_password, role, status FROM users WHERE username = ?").get(adminUsername);
  assert(admin && ['admin','super_admin','total_admin'].includes(admin.role) && admin.status === 'active', 'admin account unavailable', admin);
  cleanup.adminOriginal = { password_hash: admin.password_hash, must_change_password: admin.must_change_password };
  const newHash = bcrypt.hashSync(adminTempPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, admin.id);

  const adminLogin = await login(adminUsername, adminTempPassword);
  const adminToken = adminLogin.token;
  results.push({ step: 'admin_login', ok: Boolean(adminToken && adminLogin.user?.username === adminUsername), role: adminLogin.user?.role });

  const createAnchor = await api('/auth/anchors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username: anchorUsername, password: anchorPassword, nickname: 'QA Anchor', phone: '13800138000', wechat: 'qa_wechat', qq: '123456', note: 'regression create', status: 'active' }),
  });
  cleanup.anchorUserId = Number(createAnchor.userId);
  const anchorRow1 = db.prepare("SELECT u.id AS user_id, u.username, u.nickname, u.status, a.id AS anchor_id, a.phone, a.wechat, a.qq, a.note FROM users u JOIN anchors a ON a.user_id = u.id WHERE u.id = ?").get(cleanup.anchorUserId);
  cleanup.anchorId = anchorRow1.anchor_id;
  assert(anchorRow1 && anchorRow1.username === anchorUsername && anchorRow1.phone === '13800138000', 'anchor create verify failed', anchorRow1);
  results.push({ step: 'anchor_create', ok: true, userId: cleanup.anchorUserId });

  await api(`/auth/anchors/${cleanup.anchorUserId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ nickname: 'QA Anchor Edited', phone: '13900139000', wechat: 'qa_wechat_2', qq: '654321', note: 'regression edit', status: 'inactive', password: anchorPassword2 }),
  });
  const anchorRow2 = db.prepare("SELECT u.nickname, u.status, u.must_change_password, a.phone, a.wechat, a.qq, a.note FROM users u JOIN anchors a ON a.user_id = u.id WHERE u.id = ?").get(cleanup.anchorUserId);
  assert(anchorRow2 && anchorRow2.nickname === 'QA Anchor Edited' && anchorRow2.status === 'inactive' && anchorRow2.phone === '13900139000' && anchorRow2.wechat === 'qa_wechat_2' && anchorRow2.qq === '654321', 'anchor edit verify failed', anchorRow2);
  results.push({ step: 'anchor_edit', ok: true });

  db.prepare("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(cleanup.anchorUserId);
  const anchorLogin = await login(anchorUsername, anchorPassword2);
  const anchorToken = anchorLogin.token;
  results.push({ step: 'anchor_login_after_edit', ok: Boolean(anchorToken && anchorLogin.user?.username === anchorUsername) });

  const autoClose = makeKickoff(20);
  const schedule = makeKickoff(120);
  const insertMatch = db.prepare("INSERT INTO matches (source_url, source_match_key, match_date, kickoff_time, league_name, home_team, away_team, match_status, is_open, required_anchor_count, apply_deadline, priority, admin_note, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'normal', ?, '足球')");
  let r = insertMatch.run('qa://autoclose', `qa-autoclose-${stamp}`, autoClose.date, autoClose.kickoff, '英超', 'QA AutoClose Home', 'QA AutoClose Away', '未开赛', null, 'regression auto-close');
  cleanup.matchIds.push(Number(r.lastInsertRowid));
  r = insertMatch.run('qa://schedule', `qa-schedule-${stamp}`, schedule.date, schedule.kickoff, '西甲', 'QA Schedule Home', 'QA Schedule Away', '未开赛', null, 'regression schedule');
  const scheduleMatchId = Number(r.lastInsertRowid);
  cleanup.matchIds.push(scheduleMatchId);

  const applyRes = await api('/applications/apply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${anchorToken}` },
    body: JSON.stringify({ match_id: scheduleMatchId }),
  });
  assert(applyRes.success === true, 'anchor apply failed', applyRes);
  const myApps = await api('/applications/my', { headers: { Authorization: `Bearer ${anchorToken}` } });
  const applied = myApps.find((x) => x.match_id === scheduleMatchId && x.status === 'pending');
  assert(applied, 'anchor my applications missing pending item', myApps);
  results.push({ step: 'anchor_apply', ok: true, applicationId: applied.id });

  const reviewMatches = await api(`/applications/review-matches?date=${autoClose.date}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const autoCloseRow = db.prepare("SELECT id, is_open, admin_note FROM matches WHERE id = ?").get(cleanup.matchIds[0]);
  assert(autoCloseRow && Number(autoCloseRow.is_open) === 0 && String(autoCloseRow.admin_note || '').includes('开赛前30分钟无人报名'), 'review auto-close verify failed', { reviewMatches, autoCloseRow });
  results.push({ step: 'reviews_auto_close', ok: true, autoClosedCount: reviewMatches.autoClosedCount });

  const matchApps = await api(`/applications/match/${scheduleMatchId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const app = matchApps.find((x) => x.match_id === scheduleMatchId && x.username === anchorUsername);
  assert(app, 'admin match applications missing test anchor', matchApps);
  await api(`/applications/review/${app.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'approved' }),
  });
  const assignment = db.prepare("SELECT * FROM assignments WHERE match_id = ? AND anchor_id = ?").get(scheduleMatchId, cleanup.anchorId);
  assert(assignment && assignment.status === 'scheduled', 'assignment not created after approval', assignment);
  const dayOverview = await api(`/applications/day-overview?date=${schedule.date}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const dayRow = dayOverview.find((x) => x.id === scheduleMatchId);
  assert(dayRow && Number(dayRow.approved_count) >= 1, 'day overview approved count missing', dayOverview);
  results.push({ step: 'review_approve_schedule_linkage', ok: true, assignmentId: assignment.id });

  await api(`/applications/audit/${assignment.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ played_on_time: true, actual_start_time: schedule.iso, actual_end_time: new Date(new Date(schedule.iso).getTime() + 45 * 60000).toISOString(), incident_flag: false, incident_note: 'qa audit ok' }),
  });
  const audited = db.prepare("SELECT status, played_on_time, audited_by, audited_at FROM assignments WHERE id = ?").get(assignment.id);
  assert(audited && audited.status === 'completed' && Number(audited.played_on_time) === 1 && audited.audited_by === admin.id, 'audit verify failed', audited);
  const myAssignments = await api('/applications/my-assignments', { headers: { Authorization: `Bearer ${anchorToken}` } });
  const myAssignment = myAssignments.find((x) => x.id === assignment.id && x.status === 'completed');
  assert(myAssignment, 'anchor my assignments missing completed item', myAssignments);
  results.push({ step: 'audit_complete_linkage', ok: true });

  await api(`/auth/anchors/${cleanup.anchorUserId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  const deletedAnchor = db.prepare("SELECT u.id FROM users u LEFT JOIN anchors a ON a.user_id = u.id WHERE u.id = ?").get(cleanup.anchorUserId);
  assert(!deletedAnchor, 'anchor delete verify failed', deletedAnchor);
  cleanup.anchorUserId = null;
  cleanup.anchorId = null;
  results.push({ step: 'anchor_delete', ok: true });

  db.prepare(`DELETE FROM matches WHERE id IN (${cleanup.matchIds.map(() => '?').join(',')})`).run(...cleanup.matchIds);
  cleanup.matchIds = [];

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, extra: error.extra || error.data || null, results }, null, 2));
  process.exitCode = 1;
} finally {
  try {
    if (cleanup.anchorUserId) {
      const anchor = db.prepare("SELECT id FROM anchors WHERE user_id = ?").get(cleanup.anchorUserId);
      if (anchor) {
        db.prepare("DELETE FROM applications WHERE anchor_id = ?").run(anchor.id);
        db.prepare("DELETE FROM assignments WHERE anchor_id = ?").run(anchor.id);
        db.prepare("DELETE FROM anchors WHERE id = ?").run(anchor.id);
      }
      db.prepare("DELETE FROM users WHERE id = ? AND role = 'anchor'").run(cleanup.anchorUserId);
    }
    if (cleanup.matchIds.length) {
      db.prepare(`DELETE FROM matches WHERE id IN (${cleanup.matchIds.map(() => '?').join(',')})`).run(...cleanup.matchIds);
    }
    if (cleanup.adminOriginal) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(cleanup.adminOriginal.password_hash, cleanup.adminOriginal.must_change_password, adminUsername);
    }
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: String(cleanupError) }, null, 2));
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
