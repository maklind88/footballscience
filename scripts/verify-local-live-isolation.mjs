import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowLocalLiveBackend = process.env.ALLOW_LOCAL_LIVE_BACKEND === "1";
const failures = [];

const blockedProductionEnvFiles = [".vercel/.env.production.local", ".env.production", ".env.production.local"];
const localEnvFilesToInspect = [".env", ".env.local", ".env.development", ".env.development.local"];
const sensitiveLocalKeys = new Set([
  "POSTGRES_PASSWORD",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_TOKEN",
]);

function readEnvFile(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }
  return fs
    .readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      return { key, value };
    })
    .filter(Boolean);
}

for (const relativePath of blockedProductionEnvFiles) {
  if (fs.existsSync(path.join(rootDir, relativePath)) && !allowLocalLiveBackend) {
    failures.push(`${relativePath} must not exist in the local workspace. Pull production env only in CI/Vercel, never into local dev.`);
  }
}

for (const relativePath of localEnvFilesToInspect) {
  for (const entry of readEnvFile(relativePath)) {
    const isLiveSupabaseUrl =
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"].includes(entry.key) && /^https:\/\/[^.]+\.supabase\.co\/?$/.test(entry.value);
    if ((sensitiveLocalKeys.has(entry.key) || isLiveSupabaseUrl) && !allowLocalLiveBackend) {
      failures.push(`${relativePath} contains ${entry.key}. Local dev must not point at the live backend.`);
    }
  }
}

const liveEnvironmentKeys = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "POSTGRES_URL", "POSTGRES_PASSWORD"];
const hasLiveEnvironmentInShell = liveEnvironmentKeys.some((key) => Boolean(process.env[key]));
const hasLiveSupabaseUrlInShell = /^https:\/\/[^.]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
if ((hasLiveEnvironmentInShell || hasLiveSupabaseUrlInShell) && !process.env.CI && !allowLocalLiveBackend) {
  failures.push("Current shell has live backend environment variables. Clear them before running local dev or QA.");
}

if (failures.length) {
  console.error("Local/live isolation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error("\nUse the live site for production data. Localhost must stay isolated unless ALLOW_LOCAL_LIVE_BACKEND=1 is set for a deliberate one-off operation.");
  process.exit(1);
}

console.log("Local/live isolation: ok");
