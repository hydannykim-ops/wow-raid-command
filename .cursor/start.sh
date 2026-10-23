#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
fi

CI=1 npm run db:migrate:local
exec npx --yes wrangler@4 pages dev . --ip 0.0.0.0 --port 8788 --show-interactive-dev-session false
