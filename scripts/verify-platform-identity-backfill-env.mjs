#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TARGETS = new Set(["staging", "production"]);

function normalize(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return UUID_PATTERN.test(normalize(value, 120));
}

function validateLink(value) {
  const [moduleId, moduleTable, moduleRecordId, scope = "team"] = normalize(value, 400).split(":");
  return (
    /^[a-z0-9-]{1,80}$/.test(moduleId || "") &&
    /^[a-z0-9_]{1,120}$/.test(moduleTable || "") &&
    isUuid(moduleRecordId) &&
    ["organization", "club", "team"].includes(scope)
  );
}

export function verifyPlatformIdentityBackfillEnvironment(env = process.env) {
  const failures = [];
  const target = normalize(env.PLATFORM_BACKFILL_TARGET, 20).toLowerCase();
  const projectRef = normalize(env.SUPABASE_PROJECT_REF, 40).toLowerCase();
  const productionProjectRef = normalize(env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF, 40).toLowerCase();
  const supabaseUrl = normalize(env.SUPABASE_URL, 240);
  const requiredUuids = [
    ["PLATFORM_BACKFILL_ACTOR_ID", env.PLATFORM_BACKFILL_ACTOR_ID],
    ["PLATFORM_BACKFILL_ORGANIZATION_ID", env.PLATFORM_BACKFILL_ORGANIZATION_ID],
    ["PLATFORM_BACKFILL_TEAM_ID", env.PLATFORM_BACKFILL_TEAM_ID],
  ];

  if (!TARGETS.has(target)) failures.push("PLATFORM_BACKFILL_TARGET must be staging or production.");
  if (!PROJECT_REF_PATTERN.test(projectRef)) failures.push("SUPABASE_PROJECT_REF must be a valid project ref.");
  if (!PROJECT_REF_PATTERN.test(productionProjectRef)) failures.push("CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF is required.");
  if (target === "staging" && projectRef === productionProjectRef) failures.push("Staging must not use the production Supabase project.");
  if (target === "production" && projectRef !== productionProjectRef) failures.push("Production must use the canonical production Supabase project.");
  if (supabaseUrl !== `https://${projectRef}.supabase.co`) failures.push("SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  if (!normalize(env.SUPABASE_SECRET_KEY, 800)) failures.push("SUPABASE_SECRET_KEY is required in the selected GitHub Environment.");
  for (const [name, value] of requiredUuids) {
    if (!isUuid(value)) failures.push(`${name} must be a valid UUID.`);
  }
  if (!normalize(env.PLATFORM_BACKFILL_ORGANIZATION_NAME, 160)) failures.push("PLATFORM_BACKFILL_ORGANIZATION_NAME is required.");
  if (!SLUG_PATTERN.test(normalize(env.PLATFORM_BACKFILL_ORGANIZATION_SLUG, 80))) failures.push("PLATFORM_BACKFILL_ORGANIZATION_SLUG is invalid.");
  if (!normalize(env.PLATFORM_BACKFILL_TEAM_NAME, 160)) failures.push("PLATFORM_BACKFILL_TEAM_NAME is required.");
  if (!SLUG_PATTERN.test(normalize(env.PLATFORM_BACKFILL_TEAM_SLUG, 80))) failures.push("PLATFORM_BACKFILL_TEAM_SLUG is invalid.");
  const links = normalize(env.PLATFORM_BACKFILL_LINKS, 4000).split(",").map((value) => value.trim()).filter(Boolean);
  if (links.some((link) => !validateLink(link))) failures.push("PLATFORM_BACKFILL_LINKS contains an invalid tenant link.");

  return {
    ok: failures.length === 0,
    target,
    projectRef,
    linkCount: links.length,
    failures,
  };
}

function main() {
  const result = verifyPlatformIdentityBackfillEnvironment();
  if (!result.ok) {
    console.error("Platform Identity backfill environment is invalid:");
    result.failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Platform Identity backfill environment: ok target=${result.target} projectRef=${result.projectRef} links=${result.linkCount}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
