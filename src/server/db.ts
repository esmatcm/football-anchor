import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "../../data.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);

export function setupDb() {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL, -- 'super_admin', 'admin', 'anchor'
      nickname TEXT,
      status TEXT DEFAULT 'active', -- 'active', 'inactive'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anchors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      phone TEXT,
      note TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS fetch_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetch_date TEXT NOT NULL,
      source_url TEXT,
      fetch_status TEXT,
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT,
      source_match_key TEXT UNIQUE,
      match_date TEXT NOT NULL,
      kickoff_time TEXT,
      league_name TEXT,
      home_team TEXT,
      away_team TEXT,
      match_status TEXT,
      is_open INTEGER DEFAULT 0,
      required_anchor_count INTEGER DEFAULT 1,
      apply_deadline TEXT,
      priority TEXT DEFAULT 'normal', -- 'normal', 'high'
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      anchor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'waitlist'
      apply_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      review_note TEXT,
      FOREIGN KEY(match_id) REFERENCES matches(id),
      FOREIGN KEY(anchor_id) REFERENCES anchors(id),
      UNIQUE(match_id, anchor_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      anchor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled'
      actual_start_time DATETIME,
      actual_end_time DATETIME,
      played_on_time INTEGER, -- 1 or 0
      incident_flag INTEGER DEFAULT 0, -- 1 or 0
      incident_type TEXT,
      incident_note TEXT,
      audited_by INTEGER,
      audited_at DATETIME,
      FOREIGN KEY(match_id) REFERENCES matches(id),
      FOREIGN KEY(anchor_id) REFERENCES anchors(id),
      UNIQUE(match_id, anchor_id)
    );
    
    CREATE TABLE IF NOT EXISTS league_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_name TEXT UNIQUE NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admin_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      summary TEXT,
      detail_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(actor_user_id) REFERENCES users(id)
    );
  `);

  // Lightweight migrations
  try {
    db.prepare("ALTER TABLE matches ADD COLUMN category TEXT DEFAULT '足球'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE anchors ADD COLUMN wechat TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE anchors ADD COLUMN qq TEXT").run();
  } catch {}

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_matches_match_date_open ON matches(match_date, is_open);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_natural_unique ON matches(
      category,
      match_date,
      COALESCE(kickoff_time, ''),
      COALESCE(league_name, ''),
      COALESCE(home_team, ''),
      COALESCE(away_team, '')
    );
    CREATE INDEX IF NOT EXISTS idx_applications_match_status ON applications(match_id, status);
    CREATE INDEX IF NOT EXISTS idx_applications_anchor_status ON applications(anchor_id, status);
    CREATE INDEX IF NOT EXISTS idx_assignments_match_status ON assignments(match_id, status);
    CREATE INDEX IF NOT EXISTS idx_assignments_anchor_status ON assignments(anchor_id, status);
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
  `);

  const adminExists = db.prepare("SELECT id FROM users WHERE role IN ('total_admin', 'super_admin', 'admin') LIMIT 1").get() as any;
  if (!adminExists) {
    const bootstrapUsername = String(process.env.BOOTSTRAP_ADMIN_USERNAME || "").trim();
    const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
    const bootstrapNickname = String(process.env.BOOTSTRAP_ADMIN_NICKNAME || bootstrapUsername || "Bootstrap Admin").trim();
    const bootstrapRole = ["total_admin", "super_admin", "admin"].includes(String(process.env.BOOTSTRAP_ADMIN_ROLE || ""))
      ? String(process.env.BOOTSTRAP_ADMIN_ROLE)
      : "super_admin";

    if (!bootstrapUsername || bootstrapPassword.length < 8) {
      throw new Error("No admin user found. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (min 8 chars) for first run.");
    }

    const hash = bcrypt.hashSync(bootstrapPassword, 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, role, nickname, must_change_password) VALUES (?, ?, ?, ?, 1)"
    ).run(bootstrapUsername, hash, bootstrapRole, bootstrapNickname);
    console.log(`Bootstrap admin created from environment: ${bootstrapUsername}`);
  }
}
