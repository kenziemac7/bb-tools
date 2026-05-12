# OpenClaw Trial Plan

This plan is intentionally non-disruptive for production OpenClaw gateways.

## Goal

Evaluate the Browserbase skills without changing a running gateway, restarting launch daemons, or editing production `openclaw.json`.

## Recommended Trial

1. Keep this repository outside `~/.openclaw`, for example under `~/dev/web/browserautomation/openclaw-browserbase-tools`.
2. Run `pnpm install` and `pnpm check` in this repository.
3. Use a separate OpenClaw test workspace or a non-production agent state directory.
4. Symlink exactly one skill at a time from `skills/` into the test workspace.
5. Set `OPENCLAW_BROWSERBASE_TOOLS_REPO` for the test agent if the skill is not inside this checkout.
6. Validate with `openclaw skills info <skill-name>`.
7. Run only low-cost smoke tests first, such as `bb-ice-cream-bot` against one city.

## Production Adoption

After validation, prefer a maintenance window for production. Add skills one at a time, keep the existing Browserbase plugin and browser skill unchanged, and avoid gateway restart unless OpenClaw reports that one is required.
