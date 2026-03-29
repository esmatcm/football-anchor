import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { createHash } from "crypto";
import { db } from "./db.js";
import { getEnabledFootballLeagues } from "./footballLeagues.js";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").replace(/\[[^\]]+\]/g, "").trim();
}

function normalizeMatchDate(dateStr: string, kickoffTime: string) {
  const match = kickoffTime.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) {
    return dateStr;
  }

  const sourceYear = Number(dateStr.slice(0, 4));
  const sourceMonth = Number(dateStr.slice(4, 6));
  const sourceDay = Number(dateStr.slice(6, 8));
  let year = sourceYear;
  const month = Number(match[1]);
  const day = Number(match[2]);

  if (sourceMonth === 12 && month === 1) {
    year += 1;
  } else if (sourceMonth === 1 && month === 12) {
    year -= 1;
  }

  const normalized = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  if (!/^\d{8}$/.test(normalized)) {
    return `${sourceYear}${String(sourceMonth).padStart(2, "0")}${String(sourceDay).padStart(2, "0")}`;
  }

  return normalized;
}

function shiftDateYmd(dateStr: string, offsetDays: number) {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const day = Number(dateStr.slice(6, 8));
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function buildStableSourceMatchKey(match: {
  match_date: string;
  kickoff_time: string;
  league_name: string;
  home_team: string;
  away_team: string;
}) {
  const identity = [
    String(match.match_date || "").trim(),
    String(match.kickoff_time || "").trim(),
    String(match.league_name || "").trim(),
    String(match.home_team || "").trim(),
    String(match.away_team || "").trim(),
  ].join("|");

  return `stable_${createHash("sha1").update(identity).digest("hex")}`;
}

function buildBasketballSeason(dateStr: string) {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const startYear = month >= 7 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(2)}-${String(endYear).slice(2)}`;
}

function buildBasketballStatus(matchDateTime: string) {
  const ts = new Date(matchDateTime.replace(" ", "T") + ":00+08:00").getTime();
  if (Number.isFinite(ts) && ts > Date.now()) {
    return "未开赛";
  }
  return "完场";
}

const TITAN_REMOTE_JS_FORBIDDEN = /\b(?:require|process|global|window|document|Function|eval|fetch|XMLHttpRequest|WebSocket|import|export)\b/;

function assertSafeTitanPayload(payload: string, requiredKeys: string[]) {
  const text = String(payload || "");
  if (!text.trim()) throw new Error("Titan payload is empty");
  if (text.length > 1_000_000) throw new Error("Titan payload too large");
  if (TITAN_REMOTE_JS_FORBIDDEN.test(text)) throw new Error("Titan payload contains forbidden tokens");
  for (const key of requiredKeys) {
    if (!new RegExp(`\\b${key}\\b`).test(text)) {
      throw new Error(`Titan payload missing ${key}`);
    }
  }
}

function parseJsArrayLiteral(text: string, varName: string): any[] {
  const BS = String.fromCharCode(92);
  const pattern = new RegExp("(?:var|let|const)?" + BS + "s*" + varName + BS + "s*=" + BS + "s*(" + BS + "[)", "s");
  const startMatch = pattern.exec(text);
  if (!startMatch) return [];
  const startIdx = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  let jsonCandidate = text
    .slice(startIdx, endIdx)
    .replace(/'/g, '"')
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}")
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  // Handle consecutive commas (e.g. ,,) by inserting null
  while (jsonCandidate.includes(",,")) jsonCandidate = jsonCandidate.replace(/,,/g, ",null,");
  // Handle leading comma after [ like [,
  jsonCandidate = jsonCandidate.replace(/\[,/g, "[null,");
  try { return JSON.parse(jsonCandidate); } catch { return []; }
}

function parseTitanArrayPayload(payload: string) {
  assertSafeTitanPayload(payload, ["arrLeague", "arrTeam", "arrData"]);
  return {
    arrLeague: parseJsArrayLiteral(payload, "arrLeague"),
    arrTeam: parseJsArrayLiteral(payload, "arrTeam"),
    arrData: parseJsArrayLiteral(payload, "arrData"),
  };
}

function buildIncomingIdentity(match: {
  category?: string | null;
  match_date?: string | null;
  kickoff_time?: string | null;
  league_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
}) {
  return [
    String(match.category || "足球").trim().toLowerCase(),
    String(match.match_date || "").trim(),
    String(match.kickoff_time || "").trim(),
    String(match.league_name || "").trim().toLowerCase(),
    String(match.home_team || "").trim().toLowerCase(),
    String(match.away_team || "").trim().toLowerCase(),
  ].join("|");
}

function dedupeIncomingMatches<T extends {
  source_match_key?: string | null;
  category?: string | null;
  match_date?: string | null;
  kickoff_time?: string | null;
  league_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
}>(matches: T[]) {
  const bySource = new Map<string, T>();
  const byNatural = new Map<string, T>();

  for (const match of matches) {
    const sourceKey = String(match.source_match_key || "").trim();
    const naturalKey = buildIncomingIdentity(match);
    if (sourceKey) bySource.set(sourceKey, match);
    byNatural.set(naturalKey, match);
  }

  const output: T[] = [];
  const seen = new Set<string>();
  for (const match of byNatural.values()) {
    const sourceKey = String(match.source_match_key || "").trim();
    const key = sourceKey || buildIncomingIdentity(match);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(match);
  }
  return output;
}

function reconcileMatchesForDate(category: string, matchDate: string, sourceMatchKeys: string[]) {
  const normalizedCategory = String(category || "").trim();
  const keys = Array.from(new Set(sourceMatchKeys.map((key) => String(key || "").trim()).filter(Boolean)));

  if (normalizedCategory === "足球") {
    if (keys.length === 0) {
      db.prepare(`
        DELETE FROM matches
        WHERE match_date = ?
          AND COALESCE(category, '足球') = '足球'
          AND COALESCE(match_status, '') NOT IN ('完', '完场', '已结束')
          AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.match_id = matches.id)
          AND NOT EXISTS (SELECT 1 FROM assignments s WHERE s.match_id = matches.id)
      `).run(matchDate);
      return;
    }

    const placeholders = keys.map(() => "?").join(", ");
    db.prepare(`
      DELETE FROM matches
      WHERE match_date = ?
        AND COALESCE(category, '足球') = '足球'
        AND COALESCE(match_status, '') NOT IN ('完', '完场', '已结束')
        AND source_match_key NOT IN (${placeholders})
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.match_id = matches.id)
        AND NOT EXISTS (SELECT 1 FROM assignments s WHERE s.match_id = matches.id)
    `).run(matchDate, ...keys);
    return;
  }

  if (keys.length === 0) {
    db.prepare(`
      DELETE FROM matches
      WHERE match_date = ?
        AND category = ?
        AND COALESCE(match_status, '') NOT IN ('完', '完场', '已结束')
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.match_id = matches.id)
        AND NOT EXISTS (SELECT 1 FROM assignments s WHERE s.match_id = matches.id)
    `).run(matchDate, normalizedCategory);
    return;
  }

  const placeholders = keys.map(() => "?").join(", ");
  db.prepare(`
    DELETE FROM matches
    WHERE match_date = ?
      AND category = ?
      AND COALESCE(match_status, '') NOT IN ('完', '完场', '已结束')
      AND source_match_key NOT IN (${placeholders})
      AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.match_id = matches.id)
      AND NOT EXISTS (SELECT 1 FROM assignments s WHERE s.match_id = matches.id)
  `).run(matchDate, normalizedCategory, ...keys);
}

function upsertBasketballMatches(matches: Array<{
  source_url: string;
  source_match_key: string;
  match_date: string;
  kickoff_time: string;
  league_name: string;
  home_team: string;
  away_team: string;
  match_status: string;
  category: string;
}>) {
  const findExistingBySourceKey = db.prepare(`
    SELECT id
    FROM matches
    WHERE source_match_key = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `);

  const findExistingByNaturalKey = db.prepare(`
    SELECT id
    FROM matches
    WHERE category = ?
      AND match_date = ?
      AND COALESCE(kickoff_time, '') = COALESCE(?, '')
      AND COALESCE(league_name, '') = COALESCE(?, '')
      AND COALESCE(home_team, '') = COALESCE(?, '')
      AND COALESCE(away_team, '') = COALESCE(?, '')
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `);

  const updateByIdStmt = db.prepare(`
    UPDATE matches
    SET source_url = ?,
        source_match_key = ?,
        match_date = ?,
        kickoff_time = ?,
        league_name = ?,
        home_team = ?,
        away_team = ?,
        match_status = ?,
        category = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertStmt = db.prepare(`
    INSERT INTO matches (
      source_url,
      source_match_key,
      match_date,
      kickoff_time,
      league_name,
      home_team,
      away_team,
      match_status,
      category
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const normalizedMatches = dedupeIncomingMatches(matches);

  let successCount = 0;
  const transaction = db.transaction((items: typeof normalizedMatches) => {
    for (const match of items) {
      const existingBySource = findExistingBySourceKey.get(match.source_match_key) as { id: number } | undefined;
      const existingByNatural = existingBySource?.id
        ? existingBySource
        : (findExistingByNaturalKey.get(
            match.category,
            match.match_date,
            match.kickoff_time,
            match.league_name,
            match.home_team,
            match.away_team,
          ) as { id: number } | undefined);

      if (existingByNatural?.id) {
        updateByIdStmt.run(
          match.source_url,
          match.source_match_key,
          match.match_date,
          match.kickoff_time,
          match.league_name,
          match.home_team,
          match.away_team,
          match.match_status,
          match.category,
          existingByNatural.id,
        );
      } else {
        insertStmt.run(
          match.source_url,
          match.source_match_key,
          match.match_date,
          match.kickoff_time,
          match.league_name,
          match.home_team,
          match.away_team,
          match.match_status,
          match.category,
        );
      }

      successCount++;
    }
  });

  transaction(normalizedMatches);

  if (normalizedMatches.length > 0) {
    reconcileMatchesForDate(normalizedMatches[0].category, normalizedMatches[0].match_date, normalizedMatches.map((match) => match.source_match_key));
  }

  return successCount;
}

function extractPlayoffMatches(payload: string): any[] {
  const allRows: any[] = [];
  // Match pfData patterns
  const re = /pfData\['[^']*'\]\s*=\s*(\[[\s\S]*?\]);/g;
  let m;
  while ((m = re.exec(payload)) !== null) {
    try {
      const parsed = parseJsArrayLiteral("var _d=" + m[1] + ";", "_d");
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (!Array.isArray(item)) continue;
        // Direct match row: [matchId, type, datetime, homeId, awayId, ...]
        if (item.length >= 5 && typeof item[2] === "string" && /^\d{4}-/.test(String(item[2]))) {
          allRows.push(item);
        } else {
          // Series format: [team1, team2, wins1, wins2, [[match rows]]]
          // Find nested arrays that look like match rows
          for (const sub of item) {
            if (Array.isArray(sub)) {
              for (const row of sub) {
                if (Array.isArray(row) && row.length >= 5 && typeof row[2] === "string" && /^\d{4}-/.test(String(row[2]))) {
                  allRows.push(row);
                }
              }
            }
          }
        }
      }
    } catch {}
  }
  return allRows;
}

async function fetchTitanBasketballSource(url: string, dateStr: string, category: string, isPlayoff = false) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    Referer: "https://nba.titan007.com/",
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  const response = await axios.get<string>(url, { timeout: 20000, responseType: "text", headers });
  const payload = String(response.data || "");

  // Parse team map - arrTeam exists in both formats
  const arrTeam = parseJsArrayLiteral(payload, "arrTeam");
  const teamMap = new Map<number, string>();
  for (const team of arrTeam) {
    if (Array.isArray(team) && team.length >= 2) {
      teamMap.set(Number(team[0]), cleanText(String(team[1] || "")));
    }
  }

  // Get match rows from either regular or playoff format
  let dataRows: any[];
  if (isPlayoff) {
    dataRows = extractPlayoffMatches(payload);
  } else {
    assertSafeTitanPayload(payload, ["arrLeague", "arrTeam", "arrData"]);
    dataRows = parseJsArrayLiteral(payload, "arrData");
  }

  const targetDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  return dataRows
    .filter((row: any) => Array.isArray(row) && String(row[2] || "").startsWith(targetDate))
    .map((row: any) => {
      const matchId = String(row[0] || "").trim();
      const matchDateTime = String(row[2] || "").trim();
      const homeTeam = teamMap.get(Number(row[3])) || "";
      const awayTeam = teamMap.get(Number(row[4])) || "";
      const kickoffTime = matchDateTime.split(" ")[1]?.slice(0, 5) || "";
      return {
        source_url: url,
        source_match_key: `${category}_${dateStr}_${matchId}`,
        match_date: dateStr,
        kickoff_time: kickoffTime,
        league_name: category,
        home_team: homeTeam,
        away_team: awayTeam,
        match_status: buildBasketballStatus(matchDateTime),
        category,
      };
    })
    .filter((match: any) => match.home_team && match.away_team && match.kickoff_time);
}

async function scrapeTitanBasketball(dateStr: string, leagueId: number, category: string) {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const season = buildBasketballSeason(dateStr);
  const regularUrl = `https://nba.titan007.com/jsData/matchResult/${season}/l${leagueId}_1_${year}_${month}.js`;
  const playoffUrl = `https://nba.titan007.com/jsData/matchResult/${season}/l${leagueId}_2.js`;
  const urls: string[] = [];

  try {
    let allMatches: any[] = [];

    // Try regular season
    try {
      const rm = await fetchTitanBasketballSource(regularUrl, dateStr, category);
      if (rm.length > 0) allMatches.push(...rm);
      urls.push(regularUrl);
    } catch {}

    // Try playoff
    try {
      const pm = await fetchTitanBasketballSource(playoffUrl, dateStr, category, true);
      if (pm.length > 0) allMatches.push(...pm);
      urls.push(playoffUrl);
    } catch {}

    // Deduplicate by source_match_key
    const seen = new Set<string>();
    allMatches = allMatches.filter((m) => {
      if (seen.has(m.source_match_key)) return false;
      seen.add(m.source_match_key);
      return true;
    });

    const successCount = upsertBasketballMatches(allMatches);
    const urlStr = urls.join(",") || regularUrl;

    db.prepare(`
      INSERT INTO fetch_jobs (fetch_date, source_url, fetch_status, total_count, success_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(dateStr, urlStr, "success", allMatches.length, successCount);

    return { success: true, count: successCount, category: category.toLowerCase(), date: dateStr, source_url: urlStr };
  } catch (error: any) {
    console.error(`${category} scraping error:`, error.message);
    db.prepare(`
      INSERT INTO fetch_jobs (fetch_date, source_url, fetch_status, fail_reason)
      VALUES (?, ?, ?, ?)
    `).run(dateStr, urls.join(",") || regularUrl, "failed", error.message);
    return { success: false, error: error.message, category: category.toLowerCase(), date: dateStr, source_url: urls.join(",") || regularUrl };
  }
}

export async function scrapeMatches(dateStr: string) {
  const sourceDates = Array.from(new Set([shiftDateYmd(dateStr, -1), dateStr]));
  const sourceUrls = sourceDates.map((sourceDate) => `https://bf.titan007.com/football/Next_${sourceDate}.htm`);

  try {
    const matches: any[] = [];

    for (const sourceDate of sourceDates) {
      const url = `https://bf.titan007.com/football/Next_${sourceDate}.htm`;
      const response = await axios.get<ArrayBuffer>(url, {
        timeout: 15000,
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          Referer: "https://bf.titan007.com/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      });

      const html = iconv.decode(Buffer.from(response.data), "gb18030");
      const $ = cheerio.load(html);
      const importantMatch = html.match(/importantSclass\s*=\s*"([^"]*)"/);
      const importantLeagueIds = new Set(
        String(importantMatch?.[1] || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      const enabledLeagueNames = new Set(getEnabledFootballLeagues());
      const useLeagueNameFallback = importantLeagueIds.size === 0;

      $("table tr[id^='tr1_']").each((i, el) => {
        const cells = $(el).children("td");
        if (cells.length < 6) return;

        const leagueName = cleanText(cells.eq(0).text());
        const kickoffTime = cleanText(cells.eq(1).text());
        const matchStatus = cleanText(cells.eq(2).text()) || "未开赛";
        const leagueId = String($(el).attr("name") || "").split(",")[0].trim();

        const homeCell = cells.eq(3).clone();
        homeCell.find("span[name='order'], font, img").remove();
        const homeTeam = cleanText(homeCell.text());

        const awayCell = cells.eq(5).clone();
        awayCell.find("span[name='order'], font, img").remove();
        const awayTeam = cleanText(awayCell.text());

        const matchDate = normalizeMatchDate(sourceDate, kickoffTime);
        if (matchDate !== dateStr) return;

        const allowedByImportant = Boolean(leagueId && importantLeagueIds.has(leagueId));
        const allowedByFallback = Boolean(useLeagueNameFallback && enabledLeagueNames.has(leagueName));
        if (leagueName && homeTeam && awayTeam && (allowedByImportant || allowedByFallback)) {
          matches.push({
            source_url: url,
            source_match_key: buildStableSourceMatchKey({
              match_date: matchDate,
              kickoff_time: kickoffTime,
              league_name: leagueName,
              home_team: homeTeam,
              away_team: awayTeam,
            }),
            match_date: matchDate,
            kickoff_time: kickoffTime,
            league_name: leagueName,
            home_team: homeTeam,
            away_team: awayTeam,
            match_status: matchStatus,
          });
        }
      });
    }

    if (matches.length === 0) {
      if (process.env.NODE_ENV === "production" || process.env.ALLOW_MOCK_SCRAPE !== "1") {
        throw new Error(`No matches scraped for ${dateStr}; refusing to generate mock data in production mode`);
      }

      console.log("No matches found from scraping, generating mock data for " + dateStr);
      const leagues = ["英超", "西甲", "德甲", "意甲", "法甲", "中超", "欧冠", "亚冠"];
      for (let i = 0; i < 15; i++) {
        matches.push({
          source_url: sourceUrls[0],
          source_match_key: `mock_${dateStr}_${i}`,
          match_date: dateStr,
          kickoff_time: `1${Math.floor(Math.random() * 9)}:00`,
          league_name: leagues[Math.floor(Math.random() * leagues.length)],
          home_team: `主队${i}`,
          away_team: `客队${i}`,
          match_status: "未开赛",
        });
      }
    }

    const findExistingBySourceKey = db.prepare(`
      SELECT id
      FROM matches
      WHERE source_match_key = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);

    const findExistingByNaturalKey = db.prepare(`
      SELECT id
      FROM matches
      WHERE COALESCE(category, '足球') = '足球'
        AND match_date = ?
        AND COALESCE(kickoff_time, '') = COALESCE(?, '')
        AND COALESCE(league_name, '') = COALESCE(?, '')
        AND COALESCE(home_team, '') = COALESCE(?, '')
        AND COALESCE(away_team, '') = COALESCE(?, '')
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);

    const updateByIdStmt = db.prepare(`
      UPDATE matches
      SET source_url = ?,
          source_match_key = ?,
          match_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO matches (source_url, source_match_key, match_date, kickoff_time, league_name, home_team, away_team, match_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const normalizedMatches = dedupeIncomingMatches(matches);

    let successCount = 0;
    const transaction = db.transaction((items) => {
      for (const match of items) {
        const existingBySource = findExistingBySourceKey.get(match.source_match_key) as { id: number } | undefined;
        const existing = existingBySource?.id
          ? existingBySource
          : (findExistingByNaturalKey.get(
              match.match_date,
              match.kickoff_time,
              match.league_name,
              match.home_team,
              match.away_team,
            ) as { id: number } | undefined);

        if (existing?.id) {
          updateByIdStmt.run(match.source_url, match.source_match_key, match.match_status, existing.id);
        } else {
          insertStmt.run(
            match.source_url,
            match.source_match_key,
            match.match_date,
            match.kickoff_time,
            match.league_name,
            match.home_team,
            match.away_team,
            match.match_status,
          );
        }

        successCount++;
      }
    });

    transaction(normalizedMatches);

    const groupedByDate = new Map<string, string[]>();
    for (const match of normalizedMatches) {
      const keys = groupedByDate.get(match.match_date) || [];
      keys.push(match.source_match_key);
      groupedByDate.set(match.match_date, keys);
    }
    for (const [matchDate, sourceKeys] of groupedByDate.entries()) {
      reconcileMatchesForDate("足球", matchDate, sourceKeys);
    }

    db.prepare(`
      INSERT INTO fetch_jobs (fetch_date, source_url, fetch_status, total_count, success_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(dateStr, sourceUrls.join(","), "success", normalizedMatches.length, successCount);

    return { success: true, count: successCount, total: normalizedMatches.length };
  } catch (error: any) {
    console.error("Scraping error:", error.message);
    db.prepare(`
      INSERT INTO fetch_jobs (fetch_date, source_url, fetch_status, fail_reason)
      VALUES (?, ?, ?, ?)
    `).run(dateStr, sourceUrls.join(","), "failed", error.message);
    return { success: false, error: error.message };
  }
}

export async function scrapeCba(dateStr: string) {
  return await scrapeTitanBasketball(dateStr, 5, "CBA");
}

export async function scrapeNba(dateStr: string) {
  return await scrapeTitanBasketball(dateStr, 1, "NBA");
}

export async function scrapeKbl(dateStr: string) {
  return await scrapeTitanBasketball(dateStr, 15, "韩篮甲");
}

export async function scrapeNbl(dateStr: string) {
  return await scrapeTitanBasketball(dateStr, 14, "NBL");
}

export async function scrapeAllCategories(dateStr: string) {
  const settled = await Promise.allSettled([
    scrapeMatches(dateStr),
    scrapeCba(dateStr),
    scrapeNba(dateStr),
    scrapeKbl(dateStr),
    scrapeNbl(dateStr),
  ]);

  const unwrap = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? r.value : { success: false, error: (r as PromiseRejectedResult).reason?.message || "unknown" };

  const football = unwrap(settled[0]);
  const cba = unwrap(settled[1]);
  const nba = unwrap(settled[2]);
  const kbl = unwrap(settled[3]);
  const nbl = unwrap(settled[4]);

  const success = Boolean(football?.success && cba?.success && nba?.success && kbl?.success && nbl?.success);
  const count = Number(football?.count || 0) + Number(cba?.count || 0) + Number(nba?.count || 0) + Number(kbl?.count || 0) + Number(nbl?.count || 0);

  return {
    success,
    count,
    date: dateStr,
    results: { football, cba, nba, kbl, nbl },
  };
}
