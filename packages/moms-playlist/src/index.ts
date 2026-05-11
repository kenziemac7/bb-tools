import "@bb-tools/shared";
import { requireEnv } from "@bb-tools/shared";
import Browserbase from "@browserbasehq/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright-core";
import chalk from "chalk";

// -- Types ------------------------------------------------------------

interface Track {
  title: string;
  artist: string;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifySearchResponse {
  tracks: {
    items: Array<{ uri: string; name: string; artists: Array<{ name: string }> }>;
  };
}

interface SpotifyPlaylistResponse {
  id: string;
  external_urls: { spotify: string };
}

// -- CLI args ---------------------------------------------------------

function parseArgs(): { year: number; hometown: string } {
  const args = process.argv.slice(2);
  let year: number | undefined;
  let hometown: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = parseInt(args[i + 1]!, 10);
      i++;
    } else if (args[i] === "--hometown" && args[i + 1]) {
      hometown = args[i + 1]!;
      i++;
    }
  }

  if (!year || isNaN(year)) {
    console.error(chalk.red("Error: --year <birth_year> is required (e.g. --year 1958)"));
    process.exit(1);
  }
  if (!hometown) {
    console.error(chalk.red("Error: --hometown \"<city>\" is required"));
    process.exit(1);
  }

  return { year, hometown };
}

// -- Wikipedia scraping via Browserbase remote browser ---------------

async function scrapeAllYears(
  startYear: number,
  endYear: number,
): Promise<{ year: number; tracks: Track[] }[]> {
  const bb = new Browserbase({ apiKey: requireEnv("BROWSERBASE_API_KEY") });

  console.log(chalk.dim("  Starting Browserbase session..."));
  const session = await bb.sessions.create({
    projectId: requireEnv("BROWSERBASE_PROJECT_ID"),
  });

  const connectUrl =
    "wss://connect.browserbase.com?apiKey=" +
    process.env["BROWSERBASE_API_KEY"] +
    "&sessionId=" +
    session.id;

  const browser = await chromium.connectOverCDP(connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  const allYears: { year: number; tracks: Track[] }[] = [];

  try {
    for (let year = startYear; year <= endYear; year++) {
      process.stdout.write(chalk.dim("  Fetching " + year + "... "));
      const url =
        "https://en.wikipedia.org/wiki/List_of_Billboard_Hot_100_number_ones_of_" + year;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForSelector("table.wikitable", { timeout: 10_000 });


                const tracks = await page.evaluate((): { title: string; artist: string }[] => {
          const seen = new Set<string>();
          const results: { title: string; artist: string }[] = [];

          // Find the chart table (has a "Song" column header), not the key/legend box
          const tables = Array.from(document.querySelectorAll("table.wikitable"));
          const table = tables.find(t =>
            Array.from(t.querySelectorAll("th")).some(th => th.textContent?.trim() === "Song")
          );
          if (!table) return results;

          table.querySelectorAll("tr").forEach((row) => {
            // Skip pure header rows (no td at all)
            if (!row.querySelector("td")) return;

            // Use td+th so row-header <th scope="row"> cells (the No. column)
            // are counted — keeps Song at index 2 and Artist at index 3.
            const cells = row.querySelectorAll("td, th");
            if (cells.length < 4) return;

            // Columns: No. | Date | Song | Artist(s) | Ref
            const title = (cells[2]?.textContent ?? "")
              .replace(/[\u201c\u201d"]/g, "")
              .replace(/\[.*?\]/g, "")
              .trim();
            const artist = (cells[3]?.textContent ?? "")
              .replace(/\[.*?\]/g, "")
              .trim();

            if (!title || !artist || title.length > 120 || artist.length > 120) return;

            const key = title.toLowerCase() + "|||" + artist.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              results.push({ title, artist });
            }
          });

          return results;
        });

        allYears.push({ year, tracks });
        console.log(chalk.green(tracks.length + " #1 songs"));
      } catch {
        console.log(chalk.yellow("failed (skipping)"));
        allYears.push({ year, tracks: [] });
      }
    }
  } finally {
    await browser.close();
  }

  return allYears;
}

// -- Claude curation --------------------------------------------------

async function curateWithClaude(
  yearData: { year: number; tracks: Track[] }[],
  hometown: string,
): Promise<Track[]> {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

  const years = yearData[0]!.year + "-" + yearData[yearData.length - 1]!.year;

  const songList = yearData
    .map(({ year, tracks }) => {
      const lines = tracks
        .map((t, i) => "  " + (i + 1) + ". \"" + t.title + "\" by " + t.artist)
        .join("\n");
      return "### " + year + "\n" + lines;
    })
    .join("\n\n");

  const prompt =
    "Here are Billboard Hot 100 number-one songs from " +
    years +
    ".\n\n" +
    songList +
    "\n\nPick the 30 most iconic, era-defining songs that would resonate emotionally " +
    "with someone who grew up in " +
    hometown +
    " during this era. Prioritize songs that feel nostalgic and timeless over novelty hits. " +
    "Return ONLY a JSON array: [{title, artist}]";

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Claude did not return a JSON array");

  return JSON.parse(match[0]) as Track[];
}

// -- Spotify ----------------------------------------------------------

async function getSpotifyAccessToken(): Promise<string> {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(clientId + ":" + clientSecret).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + credentials,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Spotify token refresh failed: " + err);
  }

  const data = (await res.json()) as SpotifyTokenResponse & { scope?: string };
  console.log(chalk.dim("  Token scopes: " + (data.scope ?? "(none returned)")));
  return data.access_token.trim();
}

async function searchSpotifyTrack(token: string, track: Track): Promise<string | null> {
  const q = encodeURIComponent("track:" + track.title + " artist:" + track.artist);
  const res = await fetch(
    "https://api.spotify.com/v1/search?q=" + q + "&type=track&limit=1",
    { headers: { Authorization: "Bearer " + token } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as SpotifySearchResponse;
  return data.tracks?.items?.[0]?.uri ?? null;
}

async function createSpotifyPlaylist(token: string, name: string): Promise<string> {
  const res = await fetch("https://api.spotify.com/v1/me/playlists", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, public: true, description: "Built with moms-playlist" }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 403) {
      throw new Error(
        "Spotify 403: token missing playlist-modify-public scope.\n" +
          "Re-run the OAuth flow from the README and update SPOTIFY_REFRESH_TOKEN.",
      );
    }
    throw new Error("Failed to create playlist: " + err);
  }

  const data = (await res.json()) as SpotifyPlaylistResponse;
  return data.id;
}

async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const res = await fetch(
      "https://api.spotify.com/v1/playlists/" + playlistId + "/items",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: chunk }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error("Failed to add tracks: " + err);
    }
  }
}

async function getPlaylistUrl(token: string, playlistId: string): Promise<string> {
  const res = await fetch("https://api.spotify.com/v1/playlists/" + playlistId, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) throw new Error("Failed to fetch playlist details");
  const data = (await res.json()) as SpotifyPlaylistResponse;
  return data.external_urls.spotify;
}

// -- Main -------------------------------------------------------------

const WIDTH = 60;
const DIVIDER = chalk.dim("-".repeat(WIDTH));
const HEADER = chalk.dim("=".repeat(WIDTH));

async function main(): Promise<void> {
  const { year: birthYear, hometown } = parseArgs();

  const startYear = birthYear + 16;
  const endYear = birthYear + 25;

  console.log("\n" + HEADER);
  console.log(chalk.bold.white("  Mom's Playlist Builder"));
  console.log(HEADER);
  console.log(chalk.dim("  Birth year : " + birthYear));
  console.log(chalk.dim("  Hometown   : " + hometown));
  console.log(chalk.dim("  Chart years: " + startYear + "-" + endYear));
  console.log(DIVIDER + "\n");

  // 1. Scrape Wikipedia via Browserbase
  console.log(chalk.cyan("Step 1/4") + " Fetching Billboard Hot 100 #1 songs via Browserbase...");
  const yearData = await scrapeAllYears(startYear, endYear);

  const totalTracks = yearData.reduce((n, y) => n + y.tracks.length, 0);
  if (totalTracks === 0) {
    console.error(chalk.red("No tracks found. Check BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID."));
    process.exit(1);
  }
  console.log(chalk.green("  Collected " + totalTracks + " #1 songs across " + yearData.length + " years\n"));

  // 2. Claude curation
  console.log(chalk.cyan("Step 2/4") + " Asking Claude to curate the best 30 songs...");
  const curated = await curateWithClaude(yearData, hometown);
  console.log(chalk.green("  Claude selected " + curated.length + " tracks\n"));

  curated.forEach((t, i) => {
    console.log(
      "  " +
        chalk.dim(String(i + 1).padStart(2) + ".") +
        " " +
        chalk.white(t.title) +
        " " +
        chalk.dim("-") +
        " " +
        chalk.gray(t.artist),
    );
  });
  console.log();

  // 3. Spotify search
  console.log(chalk.cyan("Step 3/4") + " Searching Spotify for each track...");
  const token = await getSpotifyAccessToken();

  const uris: string[] = [];
  const missed: Track[] = [];

  for (const track of curated) {
    process.stdout.write(chalk.dim("  Searching: \"" + track.title + "\" ... "));
    const uri = await searchSpotifyTrack(token, track);
    if (uri) {
      uris.push(uri);
      console.log(chalk.green("found"));
    } else {
      missed.push(track);
      console.log(chalk.yellow("not found"));
    }
  }

  if (missed.length) {
    console.log(chalk.yellow("\n  " + missed.length + " track(s) not found on Spotify:"));
    missed.forEach((t) => console.log(chalk.dim("    - " + t.title + " - " + t.artist)));
  }
  console.log();

  if (uris.length === 0) {
    console.error(chalk.red("No tracks matched on Spotify. Check your credentials."));
    process.exit(1);
  }

  // 4. Create playlist
  console.log(chalk.cyan("Step 4/4") + " Creating Spotify playlist...");
  const playlistName = "Happy Mother's Day";
  const playlistId = await createSpotifyPlaylist(token, playlistName);
  console.log(chalk.dim("  Playlist ID: " + playlistId));
  console.log(chalk.dim("  First URI  : " + (uris[0] ?? "none")));
  await new Promise(r => setTimeout(r, 2000)); // let Spotify provision the playlist
  await addTracksToPlaylist(token, playlistId, uris);
  const playlistUrl = await getPlaylistUrl(token, playlistId);

  console.log(chalk.green("  Created \"" + playlistName + "\" with " + uris.length + " tracks\n"));

  console.log(HEADER);
  console.log(chalk.bold.green("  Playlist ready!"));
  console.log(HEADER);
  console.log("\n  " + chalk.bold(playlistUrl) + "\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red("\nFatal:"), message);
  process.exit(1);
});
