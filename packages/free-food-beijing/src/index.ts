import "@bb-tools/shared";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

// ── Configuration ───────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);           // e.g. "2026-05-02"
const YEAR  = new Date().getFullYear();                         // e.g. 2026
const MIN_LIKELIHOOD = 30;                                      // minimum score to keep
const MAX_DETAIL_PAGES = 6;                                     // max detail pages to visit per source
const EVENTBRITE_LIMIT = 8;                                     // max Eventbrite detail pages

// ── Stagehand (OpenRouter) ──────────────────────────────────────

const stagehand = new Stagehand({
  env: "BROWSERBASE",
  modelName: "meta-llama/llama-3.3-70b-instruct:free",
  modelClientOptions: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  },
});

await stagehand.init();
const page = stagehand.context.pages()[0];

// ── Types & Schemas ─────────────────────────────────────────────

interface ScoredEvent {
  name: string;
  nameEnglish: string;
  timeAndLocation: string;
  likelihood: number;
  reasoning: string;
  foodAndDrinks: string;
  url: string;
  source: string;
}

const results: ScoredEvent[] = [];

const listingSchema = z.object({
  events: z.array(
    z.object({
      name: z.string(),
      nameEnglish: z.string(),
      time: z.string(),
      likelihood: z.number().min(0).max(100),
      reasoning: z.string(),
      foodAndDrinks: z.string(),
    }),
  ),
});

const detailSchema = z.object({
  name: z.string(),
  nameEnglish: z.string(),
  timeAndLocation: z.string(),
  likelihood: z.number().min(0).max(100),
  reasoning: z.string(),
  foodAndDrinks: z.string(),
});

// ── Prompts (strict grading) ────────────────────────────────────

const LISTING_PROMPT = `You are a strict free-food analyst for Beijing. Today is ${TODAY}.

TASK: Extract event cards from this page. ONLY include events dated ${YEAR} or later.
Skip any event from ${YEAR - 1} or earlier — those are stale.

For each event, score the likelihood (0-100) that a regular attendee receives FREE food or drinks AT NO EXTRA COST beyond the ticket/registration:

SCORING RULES (be harsh — most events do NOT have free food):
  95-100 → Page explicitly says "free food", "免费餐饮", "complimentary drinks", "free pizza/beer/snacks"
  80-94  → Event explicitly mentions "refreshments provided", "茶歇", "提供茶点", "catering included"
  65-79  → Tech demo day, product launch, hackathon, or investor event (these almost always cater)
  50-64  → Networking mixer, happy hour, or reception where drinks/appetizers are standard
  35-49  → Professional workshop, panel, or community meetup (sometimes light refreshments)
  15-34  → General event where food is theoretically possible but not mentioned
  0-14   → ZERO evidence of free food. This includes:
           • Food festivals / markets / tastings where you PAY for food
           • Restaurant promos, cooking classes, food tours
           • Concerts, yoga, lectures, film screenings
           • Any "dinner meetup" where attendees pay for their own meal
           • Online/virtual events

IMPORTANT: If the page is in Chinese, translate the event name to English in the "nameEnglish" field.
If the event name is already in English, copy it to "nameEnglish" as-is.

Return: name (original language), nameEnglish (English translation), time, likelihood (int), reasoning (1 sentence — must explain what SPECIFIC evidence of free food exists or why there is none), foodAndDrinks (specific items mentioned, or empty string).`;

const DETAIL_PROMPT = `You are a strict free-food analyst for Beijing. Today is ${TODAY}.

Analyze this single event page. ONLY process if the event is dated ${YEAR} or later.

Score the likelihood (0-100) that a regular attendee receives FREE food or drinks AT NO EXTRA COST:

SCORING RULES (be conservative):
  95-100 → Explicitly says "free food/drinks", "免费餐饮", "complimentary refreshments"
  80-94  → Mentions "refreshments provided", "茶歇", "提供茶点", "catering included"
  65-79  → Tech demo/launch/hackathon (usually catered even if not stated)
  50-64  → Networking mixer, happy hour, reception (drinks/apps standard)
  35-49  → Workshop, panel, meetup (sometimes light refreshments)
  15-34  → No evidence of food but theoretically possible
  0-14   → No free food. Paid food events, restaurants, online events, etc.

DISQUALIFIERS (auto-score 0-5):
  • "费用自理" / "AA制" / "pay for your own" → attendees pay for food
  • Food festival / market / tasting with paid vendors
  • Online/virtual event
  • Past event (before ${TODAY})

IMPORTANT: Translate Chinese event names to English in "nameEnglish".

Return: name (original), nameEnglish (English), timeAndLocation (date+time+venue), likelihood, reasoning (must cite specific evidence), foodAndDrinks (specific items or empty).`;

// ── Helpers ──────────────────────────────────────────────────────

function dedup(events: ScoredEvent[]): ScoredEvent[] {
  const seen = new Map<string, ScoredEvent>();
  for (const e of events) {
    const key = e.nameEnglish.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    const existing = seen.get(key);
    if (!existing || e.likelihood > existing.likelihood) {
      seen.set(key, e);
    }
  }
  return [...seen.values()];
}

async function safeGoto(url: string): Promise<boolean> {
  try {
    await page!.goto(url, { timeout: 30_000 });
    await page!.waitForLoadState("networkidle");
    await page!.waitForTimeout(2000);
    return true;
  } catch {
    console.log(`  ⚠ Failed to load: ${url}`);
    return false;
  }
}

function log(source: string, msg: string) {
  console.log(`  [${source}] ${msg}`);
}

// ── Source scrapers ─────────────────────────────────────────────

async function scrapeLuma(): Promise<void> {
  const SOURCE = "Luma";
  const LUMA_URL = "https://lu.ma/beijing";
  log(SOURCE, `Loading ${LUMA_URL}`);
  if (!(await safeGoto(LUMA_URL))) return;
  await page!.waitForTimeout(1500);

  const listing = await stagehand.extract(LISTING_PROMPT, listingSchema);
  log(SOURCE, `Found ${listing.events.length} events on listing page`);

  let detailCount = 0;
  for (const event of listing.events) {
    if (event.likelihood < MIN_LIKELIHOOD) {
      log(SOURCE, `  Skip (${event.likelihood}%): ${event.nameEnglish || event.name}`);
      continue;
    }

    // Try to get detail page for higher-confidence events
    if (event.likelihood >= 50 && detailCount < MAX_DETAIL_PAGES) {
      try {
        await stagehand.act(`click the "${event.name}" event`);
        await page!.waitForTimeout(2500);
        const url = page!.url();
        const detail = await stagehand.extract(DETAIL_PROMPT, detailSchema);
        if (detail.likelihood >= MIN_LIKELIHOOD) {
          results.push({ ...detail, url, source: SOURCE });
          log(SOURCE, `  ✓ Detail (${detail.likelihood}%): ${detail.nameEnglish || detail.name}`);
        } else {
          log(SOURCE, `  ✗ Detail rejected (${detail.likelihood}%): ${detail.nameEnglish || detail.name}`);
        }
        detailCount++;
        await safeGoto(LUMA_URL);
        continue;
      } catch { /* fall through to listing data */ }
    }

    results.push({
      name: event.name,
      nameEnglish: event.nameEnglish || event.name,
      timeAndLocation: event.time,
      likelihood: event.likelihood,
      reasoning: event.reasoning,
      foodAndDrinks: event.foodAndDrinks,
      url: LUMA_URL,
      source: SOURCE,
    });
    log(SOURCE, `  ✓ Listed (${event.likelihood}%): ${event.nameEnglish || event.name}`);
  }
}

async function scrapeEventbrite(): Promise<void> {
  const SOURCE = "Eventbrite";

  // Search multiple relevant categories for Beijing
  const ebUrls: string[] = [];
  const categories = [
    "https://www.eventbrite.com/d/china--beijing/food-and-drink--events/",
    "https://www.eventbrite.com/d/china--beijing/business--events/",
    "https://www.eventbrite.com/d/china--beijing/science-and-tech--events/",
  ];

  for (const catUrl of categories) {
    log(SOURCE, `Loading ${catUrl}`);
    if (!(await safeGoto(catUrl))) continue;

    const urls: string[] = await page!.evaluate(() =>
      [...new Set(
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((h) => h.includes("eventbrite.com/e/")),
      )],
    );
    log(SOURCE, `  Found ${urls.length} event links`);
    ebUrls.push(...urls);
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(ebUrls)];
  log(SOURCE, `Total unique event URLs: ${uniqueUrls.length}`);

  for (const url of uniqueUrls.slice(0, EVENTBRITE_LIMIT)) {
    try {
      if (!(await safeGoto(url))) continue;
      const detail = await stagehand.extract(DETAIL_PROMPT, detailSchema);
      if (detail.likelihood >= MIN_LIKELIHOOD) {
        results.push({ ...detail, url, source: SOURCE });
        log(SOURCE, `  ✓ (${detail.likelihood}%): ${detail.nameEnglish || detail.name}`);
      } else {
        log(SOURCE, `  ✗ Rejected (${detail.likelihood}%): ${detail.nameEnglish || detail.name}`);
      }
    } catch {
      log(SOURCE, `  ⚠ Error processing: ${url}`);
    }
  }
}

async function scrapeMeetup(): Promise<void> {
  const SOURCE = "Meetup";
  const MEETUP_URL = "https://www.meetup.com/find/?location=cn--Beijing&source=EVENTS&categoryId=546";
  log(SOURCE, `Loading ${MEETUP_URL}`);
  if (!(await safeGoto(MEETUP_URL))) return;
  await page!.waitForTimeout(2000);

  const listing = await stagehand.extract(LISTING_PROMPT, listingSchema);
  log(SOURCE, `Found ${listing.events.length} events`);

  for (const event of listing.events) {
    if (event.likelihood < MIN_LIKELIHOOD) continue;
    results.push({
      name: event.name,
      nameEnglish: event.nameEnglish || event.name,
      timeAndLocation: event.time,
      likelihood: event.likelihood,
      reasoning: event.reasoning,
      foodAndDrinks: event.foodAndDrinks,
      url: MEETUP_URL,
      source: SOURCE,
    });
    log(SOURCE, `  ✓ (${event.likelihood}%): ${event.nameEnglish || event.name}`);
  }
}

async function scrapeHuodongxing(): Promise<void> {
  const SOURCE = "活动行";
  // Tech/internet category in Beijing
  const HDX_URL = "https://www.huodongxing.com/eventlist?citycode=bj&orderby=n&tag=%E7%A7%91%E6%8A%80%E4%BA%92%E8%81%94%E7%BD%91";
  log(SOURCE, `Loading ${HDX_URL}`);
  if (!(await safeGoto(HDX_URL))) return;
  await page!.waitForTimeout(2000);

  const listing = await stagehand.extract(LISTING_PROMPT, listingSchema);
  log(SOURCE, `Found ${listing.events.length} events`);

  for (const event of listing.events) {
    if (event.likelihood < MIN_LIKELIHOOD) continue;
    results.push({
      name: event.name,
      nameEnglish: event.nameEnglish || event.name,
      timeAndLocation: event.time,
      likelihood: event.likelihood,
      reasoning: event.reasoning,
      foodAndDrinks: event.foodAndDrinks,
      url: HDX_URL,
      source: SOURCE,
    });
    log(SOURCE, `  ✓ (${event.likelihood}%): ${event.nameEnglish || event.name}`);
  }
}

async function scrapeDouban(): Promise<void> {
  const SOURCE = "豆瓣";
  const DOUBAN_URL = "https://www.douban.com/location/beijing/events/future-ede/";
  log(SOURCE, `Loading ${DOUBAN_URL}`);
  if (!(await safeGoto(DOUBAN_URL))) return;
  await page!.waitForTimeout(2000);

  const listing = await stagehand.extract(LISTING_PROMPT, listingSchema);
  log(SOURCE, `Found ${listing.events.length} events`);

  for (const event of listing.events) {
    if (event.likelihood < MIN_LIKELIHOOD) continue;
    results.push({
      name: event.name,
      nameEnglish: event.nameEnglish || event.name,
      timeAndLocation: event.time,
      likelihood: event.likelihood,
      reasoning: event.reasoning,
      foodAndDrinks: event.foodAndDrinks,
      url: DOUBAN_URL,
      source: SOURCE,
    });
    log(SOURCE, `  ✓ (${event.likelihood}%): ${event.nameEnglish || event.name}`);
  }
}

// ── Main ────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`  🍕 FREE FOOD BEIJING — ${TODAY}`);
console.log(`  Scanning English & Chinese web for free food events...`);
console.log(`${"═".repeat(60)}\n`);

try {
  // ── English-language sources ──
  console.log("── English-language sources ──────────────────────────");
  await scrapeLuma();
  await scrapeEventbrite();
  await scrapeMeetup();

  // ── Chinese-language sources ──
  console.log("\n── Chinese-language sources ─────────────────────────");
  await scrapeHuodongxing();
  await scrapeDouban();

} catch (e) {
  console.error("\n⚠ Scraping stopped early:", e instanceof Error ? e.message : String(e));
} finally {
  // Deduplicate and sort
  const final = dedup(results).sort((a, b) => b.likelihood - a.likelihood);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🍕 BEIJING FREE FOOD EVENTS — RANKED BY LIKELIHOOD`);
  console.log(`  ${final.length} events found across ${new Set(final.map(e => e.source)).size} sources`);
  console.log(`${"═".repeat(60)}\n`);

  if (final.length === 0) {
    console.log("  No events with high enough free-food likelihood found.");
    console.log("  Try again in a few days — Beijing events update frequently.\n");
  } else {
    final.forEach((e, i) => {
      const pct = `${e.likelihood}%`.padStart(4);
      const grade =
        e.likelihood >= 90 ? "🟢" :
        e.likelihood >= 70 ? "🔵" :
        e.likelihood >= 50 ? "🟡" :
        "🟠";

      console.log(`${grade} ${i + 1}. [${pct}] ${e.nameEnglish}`);
      if (e.name !== e.nameEnglish) {
        console.log(`        📛 ${e.name}`);
      }
      console.log(`        🕐 ${e.timeAndLocation}`);
      if (e.foodAndDrinks) console.log(`        🍽️  ${e.foodAndDrinks}`);
      console.log(`        💭 ${e.reasoning}`);
      console.log(`        📡 Source: ${e.source}`);
      console.log(`        🔗 ${e.url}`);
      console.log();
    });

    // Legend
    console.log("─".repeat(60));
    console.log("  🟢 90%+ Confirmed free food   🔵 70-89% Very likely");
    console.log("  🟡 50-69% Probable             🟠 30-49% Possible");
    console.log("─".repeat(60));
    console.log();
  }

  try { await stagehand.close(); } catch { /* ignore */ }
}
