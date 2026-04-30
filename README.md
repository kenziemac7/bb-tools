# bb-tools

A pnpm monorepo of tools I've made with browserbase. Each tool shares a common TypeScript setup and env loading via `packages/shared`.

## Setup

```bash
cp .env.example .env
# fill in your keys, then:
pnpm install
```

### Environment variables

| Variable                 | Required by                                   |
| ------------------------ | --------------------------------------------- |
| `BROWSERBASE_API_KEY`    | all tools                                     |
| `BROWSERBASE_PROJECT_ID` | competitor-monitoring, craigslist-hunter      |
| `ANTHROPIC_API_KEY`      | free-food-sf, competitor-monitoring           |
| `RESEND_API_KEY`         | craigslist-hunter                             |
| `RECIPIENT_EMAIL`        | craigslist-hunter (or pass via `--recipient`) |

## Tools

### free-food-sf

Scrapes Luma SF and Eventbrite using Stagehand + Claude to find and rank SF events by likelihood of free food.

```bash
pnpm free-food-sf
```

---

### competitor-monitoring

Screenshots competitor pricing pages via a remote Browserbase browser, then sends them to Claude for analysis. Saves a `comparison.md` and PNGs to `screenshots/`.

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
bb-tools/
├── .env.example
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
