#!/usr/bin/env node
/**
 * 拉取 Steam 游戏库数据，生成 data/steam.json（供 Hugo 静态渲染）。
 * 同时维护 data/steam_history.json（每日时长快照，提交到仓库），用于生成活跃度热力图。
 *
 * 需要环境变量：
 *   STEAM_API_KEY  Steam Web API Key（https://steamcommunity.com/dev/apikey）
 *   STEAM_ID      SteamID64（个人资料页 URL 中的数字）
 *
 * 用法：
 *   STEAM_API_KEY=xxx STEAM_ID=xxx node scripts/fetch_steam.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TARGET = path.join(DATA_DIR, 'steam.json');
const HISTORY_FILE = path.join(DATA_DIR, 'steam_history.json');
const HEATMAP_DAYS = 365;

const KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

if (!KEY || !STEAM_ID) {
  console.error('错误：需要设置 STEAM_API_KEY 和 STEAM_ID 环境变量');
  process.exit(1);
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
  return r.json();
}

function fmtPlaytime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtHours(minutes) {
  const h = minutes / 60;
  return h >= 10 ? Math.round(h) + 'h' : (Math.round(h * 10) / 10) + 'h';
}

function toDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

(async () => {
  // ---- 游戏库 ----
  const owned = await fetchJson(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${KEY}&steamid=${STEAM_ID}&include_appinfo=true&include_played_free_games=true&format=json`
  );
  const games = (owned.response.games || [])
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      playtime_hours: Math.round((g.playtime_forever || 0) / 60 * 10) / 10,
      playtime_text: fmtPlaytime(g.playtime_forever || 0),
      last_played: g.rt_last_played ? toDate(g.rt_last_played) : null,
      header: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
    }))
    .sort((a, b) => b.playtime_hours - a.playtime_hours);

  // ---- 用户资料 ----
  const summary = await fetchJson(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${KEY}&steamids=${STEAM_ID}&format=json`
  );
  const p = (summary.response.players || [])[0] || {};

  // ---- 等级 ----
  let level = 0;
  try {
    const lv = await fetchJson(
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${KEY}&steamid=${STEAM_ID}&format=json`
    );
    level = (lv.response && lv.response.player_level) || 0;
  } catch (e) { /* 忽略等级失败 */ }

  // ---- 最近游玩（近两周）----
  let recentGames = [];
  try {
    const recent = await fetchJson(
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${KEY}&steamid=${STEAM_ID}&count=10&format=json`
    );
    recentGames = (recent.response.games || []).map((g) => ({
      appid: g.appid,
      name: g.name,
      playtime_2weeks_text: fmtPlaytime(g.playtime_2weeks || 0),
      playtime_2weeks_hours: Math.round((g.playtime_2weeks || 0) / 60 * 10) / 10,
      header: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
    }));
  } catch (e) { console.warn('⚠ 最近游玩拉取失败：', e.message); }

  const totalMinutes = games.reduce((s, g) => s + g.playtime_hours * 60, 0);
  const recentMinutes = recentGames.reduce((s, g) => s + g.playtime_2weeks_hours * 60, 0);

  // ---- 热力图历史快照（每天记录一次总时长）----
  let history = { records: {} };
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { /* 忽略 */ }
  }
  history.records = history.records || {};

  const today = new Date().toISOString().slice(0, 10);
  const todayMinutes = Math.round(totalMinutes);
  if (history.records[today] !== todayMinutes) {
    history.records[today] = todayMinutes;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  }

  // 生成近 365 天的热力图数据（每天新增时长）
  const dayMs = 86400000;
  const heatmap = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * dayMs).toISOString().slice(0, 10);
    const prev = new Date(Date.now() - (i + 1) * dayMs).toISOString().slice(0, 10);
    const cur = history.records[d] || 0;
    const before = history.records[prev] || 0;
    heatmap.push({
      date: d,
      minutes: Math.max(0, Math.round(cur - before)),
    });
  }

  const out = {
    updated_at: new Date().toISOString(),
    player: {
      steamid: p.steamid || STEAM_ID,
      name: p.personaname || 'Steam User',
      avatar: p.avatarfull || '',
      profile_url: p.profileurl || `https://steamcommunity.com/profiles/${STEAM_ID}/`,
      level,
    },
    stats: {
      total_games: games.length,
      total_playtime_hours: Math.round(totalMinutes / 60 * 10) / 10,
      recent_playtime_text: fmtHours(recentMinutes),
    },
    recent_games: recentGames,
    heatmap,
    games,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(out, null, 2));
  console.log(`✓ 已写入 ${path.relative(process.cwd(), TARGET)}：${games.length} 款游戏，热力图 ${heatmap.length} 天`);
})().catch((e) => {
  console.error('拉取失败：', e.message);
  process.exit(1);
});
