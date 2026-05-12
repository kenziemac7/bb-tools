#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h:h}"

for script in "$ROOT_DIR"/skills/bb-*/scripts/run.sh; do
  zsh -n "$script"
done

echo "Skill wrapper syntax checks passed."
