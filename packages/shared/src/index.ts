import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

// Walk up from cwd to find the nearest .env file, then fall back to OpenClaw's state dir.
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  const candidates: string[] = [];
  for (let i = 0; i < 5; i++) {
    candidates.push(resolve(dir, ".env"));
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  const openClawStateDir =
    process.env["OPENCLAW_STATE_DIR"] || resolve(process.env["HOME"] || "~", ".openclaw");

  candidates.push(resolve(openClawStateDir, ".env"));

  for (const candidate of unique(candidates)) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

const envPath = findEnvFile();
if (envPath) config({ path: envPath });

export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`Error: ${key} environment variable is required. Add it to your .env file.`);
    process.exit(1);
  }
  return val;
}

export function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}
