import "@bb-tools/shared";
import { requireEnv, getEnv } from "@bb-tools/shared";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { Resend } from "resend";

// --- Types ---

type Listing = {
  title: string;
  price: string;
  neighborhood: string;
  posted: string;
  url: string;
  lat?: number;
  lon?: number;
};

type Params = {
  zipcode?: string;
  radius?: number;
  minBeds?: number;
  maxPrice?: number;
  parking?: boolean;
  recipient?: string;
};

// --- Geo helpers ---

const ZIP_COORDS: Record<string, [number, number]> = {
  "94102": [37.7794, -122.4194],
  "94103": [37.7726, -122.4124],
  "94107": [37.7576, -122.3946],
  "94109": [37.794, -122.4215],
  "94110": [37.749, -122.4151],
  "94114": [37.7598, -122.435],
  "94115": [37.7853, -122.436],
  "94117": [37.7698, -122.447],
  "94118": [37.7816, -122.4625],
  "94121": [37.7786, -122.4939],
  "94122": [37.7606, -122.4855],
  "94131": [37.7406, -122.4384],
  "94133": [37.8003, -122.4103],
};

function haversinemiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- CLI arg parsing ---

function parseArgs(): Params {
  const args = process.argv.slice(2);
  const params: Params = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--zipcode" && next) { params.zipcode = next; i++; }
    else if (arg === "--radius" && next) { params.radius = parseFloat(next); i++; }
    else if ((arg === "--min-beds" || arg === "--minBeds") && next) { params.minBeds = parseInt(next, 10); i++; }
    else if ((arg === "--max-price" || arg === "--maxPrice") && next) { params.maxPrice = parseInt(next, 10); i++; }
    else if (arg === "--parking") { params.parking = true; }
    else if (arg === "--recipient" && next) { params.recipient = next; i++; }
  }
  return params;
}

// --- Email template ---

function buildEmail(listings: Listing[], maxPrice: number, minBeds: number): string {
  const rows = listings
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:600; color:#111827;">${l.title}</div>
          <div style="font-size:13px; color:#6b7280; margin-top:3px;">
            ${l.neighborhood}${l.neighborhood && l.posted ? " · " : ""}${l.posted}
          </div>
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; text-align:center; font-weight:700; color:#111827; white-space:nowrap;">
          ${l.price}
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; text-align:right; white-space:nowrap;">
          <a href="${l.url}" style="background:#6b21a8; color:#fff; text-decoration:none; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:600;">
            View →
          </a>
        </td>
      </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f9fafb;">
  <div style="max-width:620px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#6b21a8; padding:28px 32px;">
      <h1 style="margin:0; color:#fff; font-size:22px;">🏠 Apartment Hunter</h1>
      <p style="margin:6px 0 0; color:#e9d5ff; font-size:14px;">
        ${listings.length} listings · NOPA / Lower Haight · ${minBeds}BR+ · under $${maxPrice.toLocaleString()}/mo
      </p>
    </div>
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px 16px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:.05em;">Listing</th>
          <th style="padding:10px 16px; text-align:center; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:.05em;">Price</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="padding:20px 32px; background:#f9fafb; text-align:center; font-size:12px; color:#9ca3af;">
      Powered by Browserbase · Craigslist SF
    </div>
  </div>
</body>
</html>`;
}

// --- Main ---

async function main(): Promise<void> {
  const params = parseArgs();

  const zipcode = params.zipcode ?? "94117";
  const radius = params.radius ?? 1.5;
  const minBeds = params.minBeds ?? 2;
  const maxPrice = params.maxPrice ?? 6000;
  const parking = params.parking ?? false;
  const recipient = params.recipient ?? getEnv("RECIPIENT_EMAIL") ?? "";

  const searchUrl =
    `https://sfbay.craigslist.org/search/sfc/apa` +
    `?max_price=${maxPrice}&min_bedrooms=${minBeds}` +
    `&postal=${zipcode}&search_distance=${radius}` +
    `${parking ? "&parking=1" : ""}&sort=date`;

  const bb = new Browserbase({ apiKey: requireEnv("BROWSERBASE_API_KEY") });

  console.log("Creating Browserbase session...");
  const session = await bb.sessions.create({
    projectId: requireEnv("BROWSERBASE_PROJECT_ID"),
  });

  const connectUrl = `wss://connect.browserbase.com?apiKey=${process.env["BROWSERBASE_API_KEY"]}&sessionId=${session.id}`;

  console.log("Connecting to session:", session.id);
  const browser = await chromium.connectOverCDP(connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  console.log("Navigating to:", searchUrl);
  await page.goto(searchUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("div[data-pid]", { timeout: 30_000 });

  const listings = await page.evaluate((): Listing[] => {
    const results: Listing[] = [];

    document.querySelectorAll("div[data-pid]").forEach((item) => {
      const anchor = item.querySelector<HTMLAnchorElement>("a.cl-app-anchor");
      const title = item.querySelector(".label")?.textContent?.trim() ?? "";
      const price = item.querySelector(".priceinfo")?.textContent?.trim() ?? "";
      const url = anchor?.href ?? "";

      const meta = item.querySelector(".meta")?.textContent?.trim() ?? "";
      const parts = meta.match(/^(.*?)(\d+br)((?:\d+ft2)?)(.*)$/i);
      const posted = parts?.[1]?.trim() ?? "";
      const neighborhood = parts?.[4]?.trim() ?? meta;

      const lat = parseFloat(item.getAttribute("data-latitude") ?? "");
      const lon = parseFloat(item.getAttribute("data-longitude") ?? "");

      if (title && url) {
        const entry: Listing = { title, price, neighborhood, posted, url };
        if (!isNaN(lat)) entry.lat = lat;
        if (!isNaN(lon)) entry.lon = lon;
        results.push(entry);
      }
    });

    return results;
  });

  await browser.close();

  const center = ZIP_COORDS[zipcode];
  const filtered = center
    ? listings.filter((l) => {
        if (l.lat === undefined || l.lon === undefined) return true;
        return haversinemiles(center[0], center[1], l.lat, l.lon) <= radius;
      })
    : listings;

  console.log(`Found ${listings.length} listings, ${filtered.length} within ${radius} mile(s) of ${zipcode}`);

  if (filtered.length > 0 && recipient) {
    const resend = new Resend(requireEnv("RESEND_API_KEY"));

    const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

    await resend.emails.send({
      from: "Apartment Hunter <onboarding@resend.dev>",
      to: recipient,
      subject: `🏠 ${filtered.length} apartments near NOPA / Lower Haight — ${dateLabel}`,
      html: buildEmail(filtered, maxPrice, minBeds),
    });

    console.log(`Email sent to ${recipient}`);
  }

  console.log(JSON.stringify({ timestamp: new Date().toISOString(), url: searchUrl, listingsFound: filtered.length }, null, 2));
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
