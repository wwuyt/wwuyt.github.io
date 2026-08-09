#!/usr/bin/env bash
# 本地开发服务器：从 .env.local 读取 Token 后启动 Hugo
set -a
[ -f .env.local ] && . ./.env.local
set +a
export HUGO_PARAMS_NEODBTOKEN="${NEODB_TOKEN:-}"
export HUGO_PARAMS_BANGUMITOKEN="${BANGUMI_TOKEN:-}"

# 有 Steam 配置时自动刷新游戏库数据
if [ -n "${STEAM_API_KEY:-}" ] && [ -n "${STEAM_ID:-}" ]; then
  node scripts/fetch_steam.mjs || echo "⚠ Steam 数据拉取失败，使用上次数据"
fi

hugo server "$@"
