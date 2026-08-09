#!/usr/bin/env bash
# 本地开发服务器：从 .env.local 读取 Token 后启动 Hugo
set -a
[ -f .env.local ] && . ./.env.local
set +a
export HUGO_PARAMS_NEODBTOKEN="${NEODB_TOKEN:-}"
export HUGO_PARAMS_BANGUMITOKEN="${BANGUMI_TOKEN:-}"
hugo server "$@"
