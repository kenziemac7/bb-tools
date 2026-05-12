import "@bb-tools/shared";
import { requireEnv } from "@bb-tools/shared";
import Browserbase from "@browserbasehq/sdk";
import chalk from "chalk";

const WIDTH = 62;
const DIVIDER = chalk.dim("─".repeat(WIDTH));
const HEADER_LINE = chalk.dim("═".repeat(WIDTH));

interface ShopInfo {
  name: string;
  address: string;
  hours: string;
  knownFor: string;
  url: string;
}

// ── JSON-LD helpers ──────────────────────────────────────────

function extractJsonLdItems(html: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1]!);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      items.push(...(entries as Record<string, unknown>[]));
    } catch {
      // skip malformed blocks
    }
  }
  return items;
}

const BUSINESS_TYPES = new Set([
  "Restaurant",
  "FoodEstablishment",
  "CafeOrCoffeeShop",
  "Bakery",
  "LocalBusiness",
  "IceCreamShop",
  "Store",
  "FastFoodRestaurant",
]);

function findBusinessNode(
  items: Record<string, unknown>[],
): Record<string, unknown> | null {
  for (const item of items) {
    const type = item["@type"];
    if (typeof type === "string" && BUSINESS_TYPES.has(type)) return item;
    if (
      Array.isArray(type) &&
      (type as string[]).some((t) => BUSINESS_TYPES.has(t))
    )
      return item;
    if (Array.isArray(item["@graph"])) {
      const found = findBusinessNode(item["@graph"] as Record<string, unknown>[]);
      if (found) return found;
    }
  }
  return null;
}

function formatAddress(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function formatHours(biz: Record<string, unknown>): string {
  if (biz.openingHours) {
    const oh = biz.openingHours;
    return Array.isArray(oh) ? (oh as string[]).join("  |  ") : String(oh);
  }
  if (Array.isArray(biz.openingHoursSpecification)) {
    return (biz.openingHoursSpecification as Record<string, unknown>[])
      .map((s) => {
        const days = Array.isArray(s.dayOfWeek)
          ? (s.dayOfWeek as string[]).join(", ")
          : String(s.dayOfWeek ?? "");
        return `${days}: ${s.opens ?? "?"} – ${s.closes ?? "?"}`;
      })
      .join("  |  ");
  }
  return "";
}

// ── Meta / basic HTML helpers ────────────────────────────────

function extractMeta(html: string, prop: string): string {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${prop}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1]!.trim();
  }
  return "";
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return "";
  return m[1]!.trim().split(/\s*[|–]\s*/)[0]!.trim();
}

function extractNameFromYelpUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const bizMatch = pathname.match(/\/biz\/([^/?#]+)/);
    if (bizMatch) {
      const slug = bizMatch[1]!
        .replace(
          /-san-francisco.*$|-los-angeles.*$|-new-york.*$|-seattle.*$|-chicago.*$|-austin.*$|-portland.*$/i,
          "",
        )
        .replace(/-\d+$/, "");
      return slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  } catch {
    // ignore
  }
  return "";
}

const MEDIA_DOMAINS = new Set([
  "axios.com",
  "eater.com",
  "sfgate.com",
  "thrillist.com",
  "timeout.com",
  "sfweekly.com",
  "7x7.com",
  "curbed.com",
  "hoodline.com",
  "sfchronicle.com",
  "sfexaminer.com",
  "nytimes.com",
  "washingtonpost.com",
  "latimes.com",
  "infatuation.com",
  "zagat.com",
  "fodors.com",
  "lonelyplanet.com",
]);

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isMediaSite(url: string): boolean {
  const h = getHostname(url);
  return Array.from(MEDIA_DOMAINS).some((d) => h === d || h.endsWith("." + d));
}

function looksLikeDomain(s: string): boolean {
  return /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/.test(s.trim());
}

const CHAIN_KEYWORDS = [
  "ben & jerry",
  "ben and jerry",
  "baskin-robbins",
  "baskin robbins",
  "dairy queen",
  "haagen-dazs",
  "häagen-dazs",
  "marble slab",
  "cold stone creamery",
  "carvel",
  "mcdonald",
  "31 flavors",
  "friendly's",
  "sonic drive",
  "tastee-freez",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Core extraction ──────────────────────────────────────────

function isCityName(candidate: string, city: string): boolean {
  const c = candidate.trim().toLowerCase();
  const cityLower = city.toLowerCase().replace(/,.*$/, "").trim();
  return c === cityLower || cityLower.includes(c);
}

function extractShopInfo(
  html: string,
  searchTitle: string,
  url: string,
  city: string,
): ShopInfo {
  const ldItems = extractJsonLdItems(html);
  const biz = findBusinessNode(ldItems);

  const ogTitle = extractMeta(html, "og:title");
  const ogTitleName = ogTitle ? ogTitle.split(/\s*\|\s*/)[0]!.trim() : "";
  const ogSiteName = extractMeta(html, "og:site_name").trim();
  const htmlTitle = extractTitle(html);
  const bizName = (biz?.name as string | undefined)?.trim() ?? "";

  const name =
    (bizName && !isCityName(bizName, city) ? bizName : "") ||
    (ogTitleName && !looksLikeDomain(ogTitleName) && !isCityName(ogTitleName, city) ? ogTitleName : "") ||
    (ogSiteName && !looksLikeDomain(ogSiteName) && !isCityName(ogSiteName, city) ? ogSiteName : "") ||
    (htmlTitle && !looksLikeDomain(htmlTitle) && !isCityName(htmlTitle, city) ? htmlTitle : "") ||
    extractNameFromYelpUrl(url) ||
    searchTitle;

  const address =
    formatAddress(biz?.address) ||
    extractMeta(html, "og:street-address") ||
    "Not available";

  const hours = (biz ? formatHours(biz) : "") || "Not available";

  const rawDescription =
    (biz?.description as string | undefined) ||
    extractMeta(html, "og:description") ||
    extractMeta(html, "description");

  const knownFor = rawDescription
    ? rawDescription.replace(/\s+/g, " ").trim().slice(0, 220)
    : "Not available";

  return { name, address, hours, knownFor, url };
}

// ── Display ──────────────────────────────────────────────────

function label(text: string): string {
  return chalk.bold.cyan(text.padEnd(11));
}

function printShop(shop: ShopInfo, index: number): void {
  console.log();
  console.log(`  ${chalk.bold.white(`${index}.`)} ${chalk.bold.yellowBright(shop.name)}`);
  console.log(`     ${label("Address")} ${chalk.white(shop.address)}`);
  console.log(`     ${label("Hours")} ${chalk.white(shop.hours)}`);
  console.log(`     ${label("Known for")} ${chalk.italic.gray(shop.knownFor)}`);
  console.log(`     ${label("URL")} ${chalk.dim.underline(shop.url)}`);
  console.log();
  console.log(DIVIDER);
}

// ── Entry point ──────────────────────────────────────────────

async function main(): Promise<void> {
  const city = process.argv.slice(2).join(" ").trim();

  if (!city) {
    console.error("Usage:   pnpm ice-cream-bot -- <city name>");
    console.error('Example: pnpm ice-cream-bot -- "Austin, TX"');
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey: requireEnv("BROWSERBASE_API_KEY") });

  console.log(`\n${chalk.cyan("Searching")} for the best ice cream shops in ${chalk.bold(city)}...`);

  const queries = [
    `best local ice cream shops in ${city}`,
    `artisan gelato ice cream parlor ${city}`,
    `unique ice cream creamery ${city}`,
    `top rated ice cream dessert shop ${city}`,
  ];

  const seenUrls = new Set<string>();
  const allResults: Array<{ title: string; url: string }> = [];

  for (const query of queries) {
    const { results: qResults } = await bb.search.web({ query, numResults: 15 });
    if (qResults) {
      for (const r of qResults) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }
  }

  if (!allResults.length) {
    console.log("\nNo search results found.");
    process.exit(0);
  }

  console.log(chalk.dim(`Found ${allResults.length} unique results across ${queries.length} searches. Fetching page details...\n`));

  const shops: ShopInfo[] = [];

  for (const result of allResults) {
    if (isMediaSite(result.url)) {
      console.log(chalk.dim(`  Skipping (media site): ${getHostname(result.url)}`));
      continue;
    }

    process.stdout.write(chalk.dim(`  Fetching: ${result.title} ... `));
    try {
      const page = await bb.fetchAPI.create({ url: result.url });

      const snippet = page.content.slice(0, 500).toLowerCase();
      if (
        snippet.includes("301 moved") ||
        snippet.includes("302 found") ||
        snippet.includes("moved permanently")
      ) {
        console.log(chalk.yellow("redirect (skipping)"));
        continue;
      }

      const shop = extractShopInfo(page.content, result.title, result.url, city);

      if (
        shop.address === "Not available" &&
        shop.hours === "Not available" &&
        shop.knownFor === "Not available"
      ) {
        console.log(chalk.yellow("no data (skipping)"));
        continue;
      }

      const shopHost = getHostname(result.url);
      const shopNameNorm = shop.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isDuplicate = shops.some((s) => {
        const sHost = getHostname(s.url);
        const sNameNorm = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        return sHost === shopHost || sNameNorm === shopNameNorm;
      });
      if (isDuplicate) {
        console.log(chalk.yellow("duplicate (skipping)"));
        continue;
      }

      shops.push(shop);
      console.log(chalk.green("done"));
    } catch {
      console.log(chalk.red("failed (skipping)"));
    }
  }

  if (!shops.length) {
    console.log(chalk.red("\nCould not retrieve details for any results."));
    process.exit(0);
  }

  const finalShops = shops.filter((s) => !isChain(s.name)).slice(0, 8);

  const heading = ` BEST ICE CREAM SHOPS IN ${city.toUpperCase()}`;
  console.log("\n" + HEADER_LINE);
  console.log(chalk.bold.white(heading));
  console.log(HEADER_LINE);
  console.log(DIVIDER);

  finalShops.forEach((shop, i) => printShop(shop, i + 1));
  console.log();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red("\nFatal error:"), message);
  process.exit(1);
});
