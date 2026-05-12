# OpenClaw Browserbase Tools

Browserbase-powered automation workflows packaged for OpenClaw as narrow, auditable skills.

This repository contains the runnable TypeScript tools and a `skills/` directory that can be used directly from an OpenClaw workspace. The tools use Browserbase for remote browser sessions and xAI for model-backed analysis where a language model is required.

## What is included

| Skill | Package | Purpose |
| --- | --- | --- |
| `bb-competitor-monitoring` | `competitor-monitoring` | Screenshot pricing pages and generate a structured comparison. |
| `bb-free-food-sf` | `free-food-sf` | Rank San Francisco events by likelihood of free food or drinks. |
| `bb-craigslist-hunter` | `craigslist-hunter` | Search Craigslist SF rentals and optionally email a digest. |
| `bb-ice-cream-bot` | `ice-cream-bot` | Find independent ice cream shops for a city. |

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in the keys you need. When running from OpenClaw, the shared loader also checks `OPENCLAW_STATE_DIR/.env` and `~/.openclaw/.env`, so existing OpenClaw secrets can be reused without copying them into this repository.

### Environment variables

| Variable                 | Required by                                   |
| ------------------------ | --------------------------------------------- |
| `BROWSERBASE_API_KEY`    | all tools                                     |
| `BROWSERBASE_PROJECT_ID` | competitor-monitoring, craigslist-hunter      |
| `XAI_API_KEY`            | free-food-sf, competitor-monitoring           |
| `RESEND_API_KEY`         | craigslist-hunter email delivery only         |
| `RECIPIENT_EMAIL`        | craigslist-hunter email delivery, unless passed with `--recipient` |

## OpenClaw Workspace Use

Copy or symlink one or more directories from `skills/` into your OpenClaw workspace skills directory:

```bash
ln -s "$PWD/skills/bb-ice-cream-bot" ~/.openclaw/workspace/skills/bb-ice-cream-bot
```

The included skill wrappers resolve the repository root automatically when they live inside this checkout. If the skills are installed separately, set:

```bash
export OPENCLAW_BROWSERBASE_TOOLS_REPO="/path/to/openclaw-browserbase-tools"
```

Then verify:

```bash
openclaw skills info bb-ice-cream-bot
```

## Tools

### free-food-sf

Scrapes Luma SF and Eventbrite using Stagehand + xAI to find and rank SF events by likelihood of free food.

```bash
pnpm free-food-sf
```

---

### competitor-monitoring

Screenshots competitor pricing pages via a remote Browserbase browser, then sends them to xAI for analysis. Saves a `comparison.md` and PNGs to `screenshots/`.

```bash
# default competitors: Asana, Linear, Notion
pnpm competitor-monitoring

# custom URLs
pnpm competitor-monitoring -- https://stripe.com/pricing https://paddle.com/pricing
```

---

### craigslist-hunter

Searches Craigslist SF apartments with filters and emails a digest via Resend.

```bash
# defaults: zip 94117, 1.5mi radius, 2BR+, under $6000/mo
pnpm craigslist-hunter

# with options
pnpm craigslist-hunter -- --zipcode 94110 --radius 2 --min-beds 1 --max-price 4500 --parking --recipient you@example.com
```

| Flag          | Default            |
| ------------- | ------------------ |
| `--zipcode`   | `94117`            |
| `--radius`    | `1.5` (miles)      |
| `--min-beds`  | `2`                |
| `--max-price` | `6000`             |
| `--parking`   | off                |
| `--recipient` | `$RECIPIENT_EMAIL` |

---

### ice-cream-bot

Searches for the best local ice cream shops in any city using Browserbase web search and fetch.

```bash
pnpm ice-cream-bot -- "Austin, TX"
pnpm ice-cream-bot -- "Portland, OR"
```

## Structure

```
openclaw-browserbase-tools/
├── .env.example
├── skills/
│   ├── bb-competitor-monitoring/
│   ├── bb-craigslist-hunter/
│   ├── bb-free-food-sf/
│   └── bb-ice-cream-bot/
├── tsconfig.base.json       # shared TS config, extended by each package
├── pnpm-workspace.yaml
└── packages/
    ├── shared/              # @bb-tools/shared — auto-loads .env, exports requireEnv/getEnv
    ├── free-food-sf/
    ├── competitor-monitoring/
    ├── craigslist-hunter/
    └── ice-cream-bot/
```

All packages live in `packages/*/src/index.ts` and run via `tsx` — no build step needed.

## Verification

```bash
pnpm check
```

This runs TypeScript checks across every package and validates all skill wrapper shell scripts.

## Publishing Notes

This repository is prepared as a publishable adaptation layer. Confirm the upstream repository license and attribution requirements before publishing publicly.
