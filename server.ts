import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupDb, db } from "./src/server/db.js";
import authRoutes from "./src/server/routes/auth.js";
import matchRoutes from "./src/server/routes/matches.js";
import applicationRoutes from "./src/server/routes/applications.js";
import statsRoutes from "./src/server/routes/stats.js";
import { scrapeAllCategories } from "./src/server/scraper.js";
import { parseMatchKickoff } from "./src/lib/matchTime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=() ");
    next();
  });

  // Initialize DB
  setupDb();

  // Periodic WAL checkpoint (every 30 min)
  setInterval(() => {
    try { db.pragma("wal_checkpoint(PASSIVE)"); } catch {}
  }, 30 * 60 * 1000);

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/matches", matchRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/stats", statsRoutes);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "../dist");
    app.use("/assets", express.static(path.join(distPath, "assets"), {
      maxAge: "30d",
      immutable: true,
    }));
    app.use(express.static(distPath, { maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Auto-complete: mark past-match assignments as completed ──
  const AUTO_COMPLETE_HOURS = 3; // hours after kickoff to auto-complete
  const autoCompleteAssignments = () => {
    try {
      const scheduled = db.prepare(`
        SELECT a.id, m.match_date, m.kickoff_time
        FROM assignments a
        JOIN matches m ON a.match_id = m.id
        WHERE a.status = 'scheduled'
      `).all() as any[];

      const now = Date.now();
      const threshold = AUTO_COMPLETE_HOURS * 60 * 60 * 1000;
      let completed = 0;

      const updateStmt = db.prepare(
        `UPDATE assignments SET status = 'completed' WHERE id = ?`
      );

      const tx = db.transaction(() => {
        for (const row of scheduled) {
          const kickoff = parseMatchKickoff(row.match_date, row.kickoff_time);
          if (!kickoff) continue;
          if (now - kickoff.getTime() >= threshold) {
            updateStmt.run(row.id);
            completed++;
          }
        }
      });
      tx();

      if (completed > 0) {
        console.log(`[AUTO_COMPLETE] completed ${completed} assignments for ended matches`);
      }
    } catch (e: any) {
      console.error(`[AUTO_COMPLETE] error:`, e?.message || e);
    }
  };

  // Run immediately on startup, then every 10 minutes
  autoCompleteAssignments();
  setInterval(autoCompleteAssignments, 10 * 60 * 1000);
  console.log(`[AUTO_COMPLETE] enabled: auto-complete assignments ${AUTO_COMPLETE_HOURS}h after kickoff`);

  const getAutoScrapeDaysAhead = () => {
    const raw = Number(process.env.AUTO_SCRAPE_DAYS_AHEAD ?? 30);
    if (!Number.isFinite(raw)) return 30;
    return Math.max(0, Math.min(60, Math.floor(raw)));
  };

  if (process.env.AUTO_SCRAPE !== "0") {
    const autoScrapeDaysAhead = getAutoScrapeDaysAhead();
    const runAuto = async () => {
      const base = new Date();
      const currentHour = base.getHours();
      for (let i = 0; i <= autoScrapeDaysAhead; i++) {
        // Tiered frequency: reduce requests for far-future dates
        // +0~+3 days: every round (high priority, imminent matches)
        // +4~+7 days: every 2 hours (medium priority)
        // +8~+30 days: every 6 hours (low priority, rarely changes)
        if (i >= 8 && currentHour % 6 !== 0) continue;
        if (i >= 4 && i < 8 && currentHour % 2 !== 0) continue;

        const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        const day = `${y}${m}${d}`;
        try {
          const result = await scrapeAllCategories(day);
          const failedScopes = Object.entries(result?.results || {})
            .filter(([, value]: any) => value?.success === false)
            .map(([scope]) => scope);

          if (failedScopes.length === 0) {
            console.log(`[AUTO_SCRAPE] success for ${day} (${Number(result?.count || 0)} matches)`);
          } else {
            console.warn(`[AUTO_SCRAPE] partial for ${day}: failed=${failedScopes.join(",") || "unknown"} total=${Number(result?.count || 0)}`);
          }
        } catch (e: any) {
          console.error(`[AUTO_SCRAPE] failed for ${day}:`, e?.message || e);
        }
      }
    };

    console.log(`[AUTO_SCRAPE] enabled: today + ${autoScrapeDaysAhead} days`);
    runAuto();
    setInterval(runAuto, Number(process.env.AUTO_SCRAPE_INTERVAL_MS || 30 * 60 * 1000));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
