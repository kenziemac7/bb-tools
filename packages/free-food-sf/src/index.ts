import "@bb-tools/shared";
import { requireEnv } from "@bb-tools/shared";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

requireEnv("XAI_API_KEY");

const stagehand = new Stagehand({
  env: "BROWSERBASE",
  model: "xai/grok-4-fast-reasoning",
});

await stagehand.init();
const page = stagehand.context.pages()[0];

interface ScoredEvent {
  name: string;
  timeAndLocation: string;
  likelihood: number;
  reasoning: string;
  foodAndDrinks: string;
  url: string;
}

const results: ScoredEvent[] = [];

const scoredListingSchema = z.object({
  events: z.array(
    z.object({
      name: z.string(),
      time: z.string(),
      likelihood: z.number().min(0).max(100),
      reasoning: z.string(),
      foodAndDrinks: z.string(),
    }),
  ),
});

const LISTING_PROMPT = `Extract all event cards from this page. For each, score the likelihood (0-100) that attendees will get free food or drinks:

90-100 → explicitly mentions free food, drinks, pho, pizza, wine, snacks, etc.
70-89  → tech/startup event, product launch, demo night, hackathon (almost always have food)
50-69  → networking event, professional meetup, mixer, happy hour, after-party
30-49  → community event, panel, workshop (sometimes have light refreshments)
10-29  → general event where food is possible but not typical
0-9    → job fair, concert, yoga class, film screening, lecture (no food expected)

For each event return: name, time, likelihood (int), reasoning (1 sentence), foodAndDrinks (what's offered or expected, empty string if nothing).`;

const detailSchema = z.object({
  name: z.string(),
  timeAndLocation: z.string(),
  likelihood: z.number().min(0).max(100),
  reasoning: z.string(),
  foodAndDrinks: z.string(),
});

const DETAIL_PROMPT = `Analyze this event page and estimate the likelihood (0-100) that attendees get free food or drinks.

90-100 → explicitly offers free food/drinks to attendees
70-89  → tech/startup/product launch (almost always have food)
50-69  → networking, mixer, happy hour
30-49  → community/workshop events
0-29   → performances, job fairs, lectures (no food expected)

Extract: name, timeAndLocation (date + time + venue), likelihood (int), reasoning (1 sentence), foodAndDrinks (what's offered or empty string).`;

try {
  // ---- Luma SF ----
  const LUMA_URL = "https://lu.ma/sf";
  await page!.goto(LUMA_URL);
  await page!.waitForLoadState("networkidle");
  await page!.waitForTimeout(3000);

  const lumaListing = await stagehand.extract(LISTING_PROMPT, scoredListingSchema);

  for (const event of lumaListing.events) {
    if (event.likelihood < 30) continue;

    if (event.likelihood >= 50) {
      try {
        await stagehand.act(`click the "${event.name}" event`);
        await page!.waitForTimeout(2500);
        const url = page!.url();

        const detail = await stagehand.extract(DETAIL_PROMPT, detailSchema);
        results.push({ ...detail, url });

        await page!.goto(LUMA_URL);
        await page!.waitForLoadState("networkidle");
        await page!.waitForTimeout(1500);
        continue;
      } catch { /* fall through to listing data */ }
    }

    results.push({
      name: event.name,
      timeAndLocation: event.time,
      likelihood: event.likelihood,
      reasoning: event.reasoning,
      foodAndDrinks: event.foodAndDrinks,
      url: LUMA_URL,
    });
  }

  // ---- Eventbrite food & drink ----
  await page!.goto("https://www.eventbrite.com/d/ca--san-francisco/food-drink/");
  await page!.waitForLoadState("networkidle");
  await page!.waitForTimeout(3000);

  const ebUrls: string[] = await page!.evaluate(() =>
    [...new Set(
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.includes("eventbrite.com/e/")),
    )],
  );

  for (const url of ebUrls.slice(0, 8)) {
    try {
      await page!.goto(url);
      await page!.waitForLoadState("networkidle");
      const detail = await stagehand.extract(DETAIL_PROMPT, detailSchema);
      if (detail.likelihood >= 30) {
        results.push({ ...detail, url });
      }
    } catch { /* skip */ }
  }
} catch (e) {
  console.error("\nScraping stopped early:", e instanceof Error ? e.message : String(e));
} finally {
  results.sort((a, b) => b.likelihood - a.likelihood);

  console.log("\n🍕 SF FREE FOOD EVENTS — RANKED BY LIKELIHOOD:\n");
  if (results.length === 0) {
    console.log("No events found.");
  } else {
    results.forEach((e, i) => {
      const pct = `${e.likelihood}%`.padStart(4);
      console.log(`${i + 1}. [${pct}] ${e.name}`);
      console.log(`        🕐 ${e.timeAndLocation}`);
      if (e.foodAndDrinks) console.log(`        🍽️  ${e.foodAndDrinks}`);
      console.log(`        💭 ${e.reasoning}`);
      console.log(`        🔗 ${e.url}`);
      console.log();
    });
  }

  try { await stagehand.close(); } catch { /* ignore */ }
}
