# bb-tools (Beijing Fork 🇨🇳)

> Forked from [kenziemac7/bb-tools](https://github.com/kenziemac7/bb-tools) — adds `free-food-beijing`, a bilingual free-food finder that scrapes both English and Chinese event platforms for Beijing.

A pnpm monorepo of tools built with [Browserbase](https://browserbase.com). Each tool shares a common TypeScript setup and env loading via `packages/shared`.

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
| `OPENROUTER_API_KEY`     | **free-food-beijing**                         |
| `ANTHROPIC_API_KEY`      | free-food-sf, competitor-monitoring           |
| `RESEND_API_KEY`         | craigslist-hunter                             |
| `RECIPIENT_EMAIL`        | craigslist-hunter (or pass via `--recipient`) |

## Tools

### 🇨🇳 free-food-beijing *(new)*

Scans **5 sources** across the English and Chinese web to find Beijing events with free food/drinks. Uses Stagehand + OpenRouter (Llama 3.3 70B) for AI-powered extraction, with strict grading to eliminate false positives.

**Sources scraped:**
| Source | Language | What it covers |
|--------|----------|---------------|
| [Luma](https://lu.ma/beijing) | EN | Tech meetups, product launches, hackathons |
| [Eventbrite](https://eventbrite.com) | EN | Food/drink, business, and tech events in Beijing |
| [Meetup](https://meetup.com) | EN | Tech & professional meetups |
| [活动行 (Huodongxing)](https://huodongxing.com) | 中文 | China's largest event platform — tech/internet category |
| [豆瓣 (Douban)](https://douban.com) | 中文 | Community events, parties, exhibitions |

**Features:**
- 🔍 Bilingual scraping (English + Chinese web)
- 🌐 All output in English (Chinese event names auto-translated)
- 📊 Strict 0-100 grading with disqualifier rules (paid food festivals, BYOB, past events)
- 🔄 Cross-source deduplication
- 🎨 Color-coded confidence levels (🟢🔵🟡🟠)

```bash
pnpm free-food-beijing
```

---

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
    ├── free-food-beijing/   # 🇨🇳 NEW — bilingual Beijing free-food finder
    ├── free-food-sf/
    ├── competitor-monitoring/
    ├── craigslist-hunter/
    └── ice-cream-bot/
```

All packages live in `packages/*/src/index.ts` and run via `tsx` — no build step needed.
