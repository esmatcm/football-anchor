import { db } from "./db.js";

export const COMPACT_FOOTBALL_LEAGUES = [
  "英超",
  "西甲",
  "意甲",
  "英冠",
  "阿甲",
  "巴西甲",
  "智利甲",
  "罗甲",
  "丹麦超",
  "委超",
  "波兰超",
  "塞尔超",
  "俄甲",
  "乌超联",
  "哈萨克超",
  "印度超",
  "西乙",
  "法乙",
] as const;

export const DEFAULT_FOOTBALL_LEAGUES = COMPACT_FOOTBALL_LEAGUES;

export function getEnabledFootballLeagues() {
  const rows = db.prepare(`
    SELECT league_name
    FROM league_configs
    WHERE is_enabled = 1
    ORDER BY sort_order ASC, id ASC
  `).all() as Array<{ league_name?: string | null }>;

  const names = rows
    .map((row) => String(row.league_name || "").trim())
    .filter(Boolean);

  return names.length > 0 ? names : [...DEFAULT_FOOTBALL_LEAGUES];
}

export function isAllowedFootballLeague(leagueName: string) {
  const normalized = String(leagueName || "").trim();
  if (!normalized) return false;
  return new Set(getEnabledFootballLeagues()).has(normalized);
}

export function getFootballLeagueScopeStats() {
  const enabled = getEnabledFootballLeagues();
  const enabledSet = new Set(enabled);
  const configured = db.prepare(`SELECT COUNT(*) AS count FROM league_configs WHERE is_enabled = 1`).get() as { count?: number } | undefined;
  const totalKnown = db.prepare(`
    SELECT COUNT(DISTINCT league_name) AS count
    FROM matches
    WHERE category = '足球' AND league_name IS NOT NULL AND TRIM(league_name) <> ''
  `).get() as { count?: number } | undefined;

  const topKnown = db.prepare(`
    SELECT league_name, COUNT(*) AS match_count
    FROM matches
    WHERE category = '足球' AND league_name IS NOT NULL AND TRIM(league_name) <> ''
    GROUP BY league_name
    ORDER BY match_count DESC, league_name COLLATE NOCASE ASC
    LIMIT 100
  `).all() as Array<{ league_name: string; match_count: number }>;

  const knownButDisabled = topKnown.filter((row) => !enabledSet.has(String(row.league_name || "").trim()));

  return {
    source: Number(configured?.count || 0) > 0 ? "db" : "default",
    enabled,
    enabledCount: enabled.length,
    configuredEnabledCount: Number(configured?.count || 0),
    totalKnownLeagueCount: Number(totalKnown?.count || 0),
    disabledKnownLeagueCount: knownButDisabled.length,
    topKnown,
    topKnownButDisabled: knownButDisabled.slice(0, 20),
  };
}
