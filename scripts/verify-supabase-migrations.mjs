import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "supabase", "migrations");

const destructivePatterns = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\b[\s\S]{0,240}\bdrop\s+column\b/i,
];

function relative(filePath) {
  return path.relative(rootDir, filePath);
}

function splitStatements(source) {
  return source
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function lineForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

const failures = [];

if (!fs.existsSync(migrationsDir)) {
  failures.push("Missing supabase/migrations directory.");
} else {
  const entries = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  if (!entries.length) {
    failures.push("No Supabase migration files found.");
  }

  const seenVersions = new Set();
  let previousVersion = "";

  for (const entry of entries) {
    const filePath = path.join(migrationsDir, entry);
    const fileRef = relative(filePath);
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(entry);

    if (!match) {
      failures.push(`${fileRef}: migration filename must match <YYYYMMDDHHMMSS>_<name>.sql.`);
      continue;
    }

    const version = match[1];
    if (seenVersions.has(version)) {
      failures.push(`${fileRef}: duplicate migration version ${version}.`);
    }
    seenVersions.add(version);

    if (previousVersion && version <= previousVersion) {
      failures.push(`${fileRef}: migration versions must be strictly increasing by filename order.`);
    }
    previousVersion = version;

    const source = fs.readFileSync(filePath, "utf8");
    if (!source.trim()) {
      failures.push(`${fileRef}: migration is empty.`);
      continue;
    }

    for (const pattern of destructivePatterns) {
      const destructiveMatch = pattern.exec(source);
      if (destructiveMatch && !source.includes("-- migration-safety: allow-destructive")) {
        failures.push(
          `${fileRef}:${lineForIndex(source, destructiveMatch.index)} uses a destructive statement; add an explicit safety review before allowing it.`
        );
      }
    }

    for (const statement of splitStatements(source)) {
      if (!/\bsecurity\s+definer\b/i.test(statement)) {
        continue;
      }

      const functionMatch = /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-zA-Z_][\w]*)\./i.exec(statement);
      const schemaName = functionMatch?.[1]?.toLowerCase();

      if (!functionMatch) {
        failures.push(`${fileRef}: security definer function could not be parsed for schema review.`);
      } else if (schemaName === "public") {
        failures.push(`${fileRef}: security definer functions must not live in the public schema.`);
      }

      if (!/\bset\s+search_path\s*=/i.test(statement)) {
        failures.push(`${fileRef}: security definer functions must pin search_path.`);
      }
    }

    const publicCreateTableMatches = [...source.matchAll(/\bcreate\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z_][\w]*)/gi)];
    for (const tableMatch of publicCreateTableMatches) {
      const tableName = tableMatch[1];
      const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`, "i");
      const revokePattern = new RegExp(`revoke\\s+all\\s+on\\s+public\\.${tableName}\\s+from\\s+anon\\s*,\\s*authenticated`, "i");

      if (!rlsPattern.test(source)) {
        failures.push(`${fileRef}: public.${tableName} must enable row level security in the same migration.`);
      }

      if (!revokePattern.test(source)) {
        failures.push(`${fileRef}: public.${tableName} must revoke default anon/authenticated access in the same migration.`);
      }
    }

    if (/\bgrant\b(?=[^;]*\bto\s+authenticated\b)(?=[^;]*\b(?:insert|update|delete)\b)/i.test(source)) {
      failures.push(`${fileRef}: direct authenticated writes need an explicit review before reaching migrations.`);
    }
  }

  console.log(`Supabase migration safety report: checked ${entries.length} migration file(s).`);
}

if (failures.length) {
  console.error("\nSupabase migration safety failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
