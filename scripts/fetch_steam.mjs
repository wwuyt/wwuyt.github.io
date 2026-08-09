#!/usr/bin/env node
/**
 * 拉取 Steam 游戏库数据，生成 data/steam.json（供 Hugo 静态渲染）。
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

(async () => {
  // 游戏库
  const owned = await fetchJson(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${KEY}&steamid=${STEAM_ID}&include_appinfo=true&include_played_free_games=true&format=json`
  );
  const games = (owned.response.games || [])
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      playtime_hours: Math.round((g.playtime_forever || 0) / 60 * 10) / 10,
      playtime_text: fmtPlaytime(g.playtime_forever || 0),
      last_played: g.rt_last_played
        ? new Date(g.rt_last_played * 1000).toISOString().slice(0, 10)
        : null,
      header: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
    }))
    .sort((a, b) => b.playtime_hours - a.playtime_hours);

  // 用户资料
  const summary = await fetchJson(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${KEY}&steamids=${STEAM_ID}&format=json`
  );
  const p = (summary.response.players || [])[0] || {};

  // 等级
  let level = 0;
  try {
    const lv = await fetchJson(
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${KEY}&steamid=${STEAM_ID}&format=json`
    );
    level = (lv.response && lv.response.player_level) || 0;
  } catch (e) { /* 忽略等级失败 */ }

  const out = {
    updated_at: new Date().toISOString(),
    player: {
      steamid: p.steamid || STEAM_ID,
      name: p.personaname || 'Steam User',
      avatar: p.avatarfull || '',
      profile_url: p.profileurl || `https://steamcommunity.com/profiles/${STEAM_ID}/`,
      level,
    },
    total_games: games.length,
    total_playtime_hours: Math.round(games.reduce((s, g) => s + g.playtime_hours, 0) * 10) / 10,
    games,
  };

  const target = path.join(__dirname, '..', 'data', 'steam.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2));
  console.log(`✓ 已写入 ${path.relative(process.cwd(), target)}：${games.length} 款游戏`);
})().catch((e) => {
  console.error('拉取失败：', e.message);
  process.exit(1);
});
