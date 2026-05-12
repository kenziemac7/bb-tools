#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${OPENCLAW_BROWSERBASE_TOOLS_REPO:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

if [[ ! -d "$REPO_DIR" ]]; then
  echo "openclaw-browserbase-tools repo not found at: $REPO_DIR" >&2
  exit 1
fi

exec pnpm --dir "$REPO_DIR" competitor-monitoring "$@"
