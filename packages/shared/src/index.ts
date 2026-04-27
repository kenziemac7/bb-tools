import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

// Walk up from cwd to find the nearest .env file (supports monorepo root or per-package)
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
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
