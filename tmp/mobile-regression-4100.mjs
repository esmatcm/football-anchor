import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const ORIGIN = 'http://127.0.0.1:4100';
const API = `${ORIGIN}/api`;
const db = new Database('/srv/football-anchor/data/data.db');
const outDir = '/srv/football-anchor/tmp/mobile-regression';
const adminUsername = 'qa_test_admin';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const adminTempPassword = `QaTemp#${stamp}`;
const cleanup = { adminOriginal: null, chrome: null, pageId: null };
let msgId = 0;

function assert(condition, message, extra) {
  if (!condition) {
    const err = new Error(message);
    err.extra = extra;
    throw err;
  }
}

async function api(pathname, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`${API}${pathname}`, { ...rest, headers: { 'Content-Type': 'application/json', ...headers } });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${pathname}`);
    err.data = data;
    throw err;
  }
  return data;
}

async function login(username, password) {
  const captcha = await api('/auth/captcha');
  const m = String(captcha.question || '').match(/(\d+)\s*\+\s*(\d+)/);
  assert(m, 'captcha parse failed', captcha);
  return api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, captcha_id: captcha.captcha_id, captcha_value: Number(m[1]) + Number(m[2]) }),
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitChrome() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) return true;
    } catch {}
    await wait(200);
  }
  throw new Error('chrome remote debugging not ready');
}

async function newPageWs() {
  const res = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
  const data = await res.json();
  cleanup.pageId = data.id;
  return data.webSocketDebuggerUrl;
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(String(ev.data));
    if (data.id) {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(data.error); else p.resolve(data.result);
      return;
    }
    const fns = listeners.get(data.method) || [];
    for (const fn of fns) fn(data.params);
  });
  return {
    send(method, params = {}) {
      const id = ++msgId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, fn) {
      const arr = listeners.get(method) || [];
      arr.push(fn);
      listeners.set(method, arr);
    },
    close() { ws.close(); },
  };
}

async function evalValue(page, expression) {
  const res = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return res.result?.value;
}

async function navigate(page, url) {
  await page.send('Page.navigate', { url });
  await wait(1800);
  for (let i = 0; i < 40; i++) {
    const ready = await evalValue(page, 'document.readyState');
    if (ready === 'complete') return;
    await wait(150);
  }
}

async function screenshot(page, name, fullPage = true) {
  const res = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: fullPage });
  await fs.writeFile(path.join(outDir, name), Buffer.from(res.data, 'base64'));
}

async function click(page, selector) {
  return evalValue(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const admin = db.prepare("SELECT id, username, password_hash, must_change_password, role, status FROM users WHERE username = ?").get(adminUsername);
  assert(admin && ['admin','super_admin','total_admin'].includes(admin.role) && admin.status === 'active', 'admin unavailable', admin);
  cleanup.adminOriginal = { password_hash: admin.password_hash, must_change_password: admin.must_change_password };
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bcrypt.hashSync(adminTempPassword, 10), admin.id);
  const auth = await login(adminUsername, adminTempPassword);

  cleanup.chrome = spawn('chromium-browser', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222', '--user-data-dir=/tmp/chrome-mobile-regression', 'about:blank'
  ], { stdio: 'ignore' });
  await waitChrome();
  const page = await connect(await newPageWs());

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('DOM.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 812 });
  await page.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

  await navigate(page, ORIGIN + '/login');
  await evalValue(page, `localStorage.setItem('token', ${JSON.stringify(auth.token)}); localStorage.setItem('user', ${JSON.stringify(JSON.stringify(auth.user))}); true`);

  await navigate(page, ORIGIN + '/admin/timeline');
  await wait(2500);
  const timelineMeta = await evalValue(page, `(() => ({
    path: location.pathname,
    cards: document.querySelectorAll('article.app-card').length,
    detailsCount: document.querySelectorAll('details').length,
    text: document.body.innerText.slice(0, 1200)
  }))()`);
  await screenshot(page, 'timeline.png');
  await click(page, 'details');
  await wait(500);
  await screenshot(page, 'timeline-details.png');

  await navigate(page, ORIGIN + '/admin/monthly-stats');
  await wait(1800);
  const monthlyMeta = await evalValue(page, `(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 1200) }))()`);
  await screenshot(page, 'monthly.png');

  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify({ timelineMeta, monthlyMeta }, null, 2));
  console.log(JSON.stringify({ ok: true, outDir, timelineMeta, monthlyMeta }, null, 2));
  page.close();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, extra: error.extra || error.data || null }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (cleanup.pageId) await fetch(`http://127.0.0.1:9222/json/close/${cleanup.pageId}`);
  } catch {}
  try {
    if (cleanup.chrome) cleanup.chrome.kill('SIGKILL');
    if (cleanup.adminOriginal) db.prepare('UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?').run(cleanup.adminOriginal.password_hash, cleanup.adminOriginal.must_change_password, adminUsername);
  } catch {}
  db.close();
});