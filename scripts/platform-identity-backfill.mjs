#!/usr/bin/env node
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createPlatformIdentityBackfillPlan,
  createPlatformIdentityBackfillSummary,
  createSafeBackfillResult,
  normalizeExpectedPlanSha256,
  normalizeExpectedUserCount,
  resolveBackfillMembershipScope,
} from "./lib/platform-identity-backfill-plan.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const { executeTenantBootstrap } = require("../api/_lib/platform-tenant-bootstrap.js");

export const PLATFORM_IDENTITY_BACKFILL_SCHEMA = "footballscience-platform-identity-backfill-v1";
export const APPLY_CONFIRMATION = "BACKFILL_PLATFORM_IDENTITY";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"]);

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value) {
  return UUID_PATTERN.test(normalizeText(value, 120));
}

function normalizeSlug(value, fallback = "football-science") {
  const slug = normalizeText(value || fallback, 120)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function normalizeRole(value, fallback = "") {
  const role = normalizeText(value, 40).toLowerCase();
  return PLATFORM_ROLES.has(role) ? role : fallback;
}

function appMetadataFromUser(user = {}) {
  return isPlainObject(user.app_metadata) ? user.app_metadata : {};
}

function userMetadataFromUser(user = {}) {
  return isPlainObject(user.user_metadata) ? user.user_metadata : {};
}

function roleFromServerOwnedMetadata(user = {}) {
  const appMetadata = appMetadataFromUser(user);
  return normalizeRole(appMetadata.role || appMetadata.platformRole || appMetadata.platform_role, "");
}

function statusFromServerOwnedMetadata(user = {}) {
  const appMetadata = appMetadataFromUser(user);
  const status = normalizeText(appMetadata.status, 40).toLowerCase();
  if (!status) return "active";
  return ["active", "paused", "removed", "archived"].includes(status) ? status : "";
}

function displayNameFromUser(user = {}) {
  const metadata = userMetadataFromUser(user);
  return (
    normalizeText(metadata.displayName || metadata.display_name || metadata.name, 180) ||
    normalizeText([metadata.firstName || metadata.first_name, metadata.lastName || metadata.last_name].filter(Boolean).join(" "), 180) ||
    normalizeText(user.email, 254).split("@", 1)[0] ||
    "User"
  );
}

function userProfileFromAuthUser(user = {}) {
  const metadata = userMetadataFromUser(user);
  return {
    id: normalizeText(user.id, 120),
    email: normalizeText(user.email, 254).toLowerCase(),
    displayName: displayNameFromUser(user),
    firstName: normalizeText(metadata.firstName || metadata.first_name, 120),
    lastName: normalizeText(metadata.lastName || metadata.last_name, 120),
    title: normalizeText(metadata.title, 160),
    department: normalizeText(metadata.department, 120),
    status: statusFromServerOwnedMetadata(user),
    metadata: {
      backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      source: "supabase-auth-admin",
    },
  };
}

function parseFlagValue(args, index) {
  const current = args[index];
  const equalsIndex = current.indexOf("=");
  if (equalsIndex !== -1) {
    return { value: current.slice(equalsIndex + 1), consumed: 0 };
  }
  return { value: args[index + 1], consumed: 1 };
}

export function parseBackfillArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    confirm: "",
    expectedPlanSha256: normalizeExpectedPlanSha256(process.env.PLATFORM_BACKFILL_EXPECTED_PLAN_SHA256),
    expectedUserCount: normalizeExpectedUserCount(process.env.PLATFORM_BACKFILL_EXPECTED_USER_COUNT),
    json: false,
    limit: 200,
    maxPages: 20,
    userIds: [],
    roles: [],
    links: [],
    actorId: normalizeText(process.env.PLATFORM_BACKFILL_ACTOR_ID, 120),
    actorEmail: normalizeText(process.env.PLATFORM_BACKFILL_ACTOR_EMAIL, 254).toLowerCase(),
    organization: {
      id: normalizeText(process.env.PLATFORM_BACKFILL_ORGANIZATION_ID, 120),
      name: normalizeText(process.env.PLATFORM_BACKFILL_ORGANIZATION_NAME || "Football Science", 160),
      slug: normalizeSlug(process.env.PLATFORM_BACKFILL_ORGANIZATION_SLUG || "football-science"),
    },
    club: null,
    team: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const flag = arg.split("=", 1)[0];
    const { value, consumed } = parseFlagValue(argv, index);
    index += consumed;

    if (flag === "--confirm") options.confirm = normalizeText(value, 80);
    if (flag === "--expected-plan-sha256") options.expectedPlanSha256 = normalizeExpectedPlanSha256(value);
    if (flag === "--expected-user-count") options.expectedUserCount = normalizeExpectedUserCount(value);
    if (flag === "--actor-id") options.actorId = normalizeText(value, 120);
    if (flag === "--actor-email") options.actorEmail = normalizeText(value, 254).toLowerCase();
    if (flag === "--user-id") options.userIds.push(normalizeText(value, 120));
    if (flag === "--role") options.roles.push(normalizeText(value, 40).toLowerCase());
    if (flag === "--limit") options.limit = Math.max(1, Math.min(500, Number(value) || 200));
    if (flag === "--max-pages") options.maxPages = Math.max(1, Math.min(100, Number(value) || 20));
    if (flag === "--organization-id") options.organization.id = normalizeText(value, 120);
    if (flag === "--organization-name") options.organization.name = normalizeText(value, 160);
    if (flag === "--organization-slug") options.organization.slug = normalizeSlug(value);
    if (flag === "--club-name") options.club = { ...(options.club || {}), name: normalizeText(value, 160), slug: normalizeSlug(value, "club") };
    if (flag === "--club-slug") options.club = { ...(options.club || {}), slug: normalizeSlug(value, "club") };
    if (flag === "--club-id") options.club = { ...(options.club || {}), id: normalizeText(value, 120) };
    if (flag === "--club-country") options.club = { ...(options.club || {}), countryCode: normalizeText(value, 2).toUpperCase() };
    if (flag === "--team-name") options.team = { ...(options.team || {}), name: normalizeText(value, 160), slug: normalizeSlug(value, "team") };
    if (flag === "--team-slug") options.team = { ...(options.team || {}), slug: normalizeSlug(value, "team") };
    if (flag === "--team-id") options.team = { ...(options.team || {}), id: normalizeText(value, 120) };
    if (flag === "--team-gender") options.team = { ...(options.team || {}), gender: normalizeText(value, 40).toLowerCase() };
    if (flag === "--team-age-group") options.team = { ...(options.team || {}), ageGroup: normalizeText(value, 80) };
    if (flag === "--team-sport") options.team = { ...(options.team || {}), sport: normalizeText(value, 80) };
    if (flag === "--link") options.links.push(normalizeText(value, 400));
  }

  options.userIds = options.userIds.filter(isUuid);
  options.roles = Array.from(new Set(options.roles.filter(Boolean)));
  options.organization.slug = normalizeSlug(options.organization.slug || options.organization.name || "football-science");
  if (options.club?.name && !options.club.slug) {
    options.club.slug = normalizeSlug(options.club.name, "club");
  }
  if (options.team?.name && !options.team.slug) {
    options.team.slug = normalizeSlug(options.team.name, "team");
  }
  return options;
}

function printHelp() {
  console.log(`Platform Identity backfill

Dry-run is the default. Writes require:
  --apply --confirm=${APPLY_CONFIRMATION} --expected-plan-sha256 <sha256> --expected-user-count <count>

Examples:
  npm run platform:identity:backfill -- --actor-id <admin-uuid> --organization-name "Football Science"
  npm run platform:identity:backfill -- --apply --confirm=${APPLY_CONFIRMATION} --expected-plan-sha256 <sha256> --expected-user-count <count> --actor-id <admin-uuid> --team-name "First Team"

Useful flags:
  --user-id <uuid>             Backfill one user. Repeatable. Defaults to listing auth users.
  --role <role>                Limit the plan to active users with this server-owned role. Repeatable.
  --organization-name <name>   Canonical organization name.
  --club-name <name>           Optional canonical club.
  --team-name <name>           Optional canonical team.
  --limit <1-500>              Auth users per page. Default 200.
  --max-pages <1-100>          Auth user page cap. Default 20.
  --expected-plan-sha256 <sha> Required in apply mode; must equal the reviewed dry-run plan.
  --expected-user-count <n>    Required in apply mode; must equal the reviewed user count.
  --json                       Print machine-readable summary.
`);
}

function createServiceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function parseJsonResponse(response) {
  const text = response?.status === 204 ? "" : await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function fetchAuthUsersById(userIds = [], options = {}) {
  const users = [];
  const { url, serviceRoleKey } = options.config || readConfig();
  if (!url || !serviceRoleKey) {
    return { ok: false, status: 500, reason: "Supabase service role configuration is required for platform identity backfill." };
  }
  const fetchImpl = options.fetchImpl || fetch;
  for (const userId of userIds.filter(isUuid)) {
    const response = await fetchImpl(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      return { ok: false, status: response.status, reason: payload?.message || "Auth user lookup failed.", payload };
    }
    const user = payload?.user || payload?.data?.user || payload;
    if (user?.id) {
      users.push(user);
    }
  }
  return { ok: true, users };
}

export async function listAuthUsersForBackfill(options = {}) {
  const { url, serviceRoleKey } = options.config || readConfig();
  if (!url || !serviceRoleKey) {
    return { ok: false, status: 500, reason: "Supabase service role configuration is required for platform identity backfill." };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages) || 20));
  const users = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const listUrl = new URL(`${url}/auth/v1/admin/users`);
    listUrl.searchParams.set("page", String(page));
    listUrl.searchParams.set("per_page", String(limit));
    const response = await fetchImpl(listUrl.toString(), {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      return { ok: false, status: response.status, reason: payload?.message || "Auth user listing failed.", payload };
    }
    const chunk = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    users.push(...chunk.filter((user) => user?.id));
    if (chunk.length < limit) {
      break;
    }
  }

  return { ok: true, users };
}

function normalizeLink(value) {
  const [moduleId, moduleTable, moduleRecordId, scope = "team"] = normalizeText(value, 400).split(":");
  if (!moduleId || !moduleTable || !isUuid(moduleRecordId)) {
    return null;
  }
  return { moduleId, moduleTable, moduleRecordId, scope };
}

export function buildTenantBootstrapBody(user, options = {}) {
  const profile = userProfileFromAuthUser(user);
  const role = roleFromServerOwnedMetadata(user);
  const status = statusFromServerOwnedMetadata(user);
  if (!role) {
    throw new Error("A valid server-owned app_metadata role is required for Platform Identity backfill.");
  }
  if (status !== "active") {
    throw new Error("Only active users can be included in Platform Identity backfill.");
  }
  const scope = resolveBackfillMembershipScope(role, options);
  return {
    dryRun: options.apply !== true,
    organization: {
      id: isUuid(options.organization?.id) ? options.organization.id : undefined,
      name: normalizeText(options.organization?.name || "Football Science", 160),
      slug: normalizeSlug(options.organization?.slug || options.organization?.name || "football-science"),
      metadata: {
        backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      },
    },
    club: options.club
      ? {
          id: isUuid(options.club.id) ? options.club.id : undefined,
          name: normalizeText(options.club.name || options.organization?.name || "Club", 160),
          slug: normalizeSlug(options.club.slug || options.club.name || "club"),
          countryCode: normalizeText(options.club.countryCode || options.club.country_code, 2).toUpperCase() || undefined,
          metadata: {
            backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
          },
        }
      : undefined,
    team: options.team
      ? {
          id: isUuid(options.team.id) ? options.team.id : undefined,
          name: normalizeText(options.team.name || "First Team", 160),
          slug: normalizeSlug(options.team.slug || options.team.name || "team"),
          sport: normalizeText(options.team.sport || "football", 80),
          ageGroup: normalizeText(options.team.ageGroup || options.team.age_group, 80) || undefined,
          gender: normalizeText(options.team.gender, 40).toLowerCase() || undefined,
          metadata: {
            backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
          },
        }
      : undefined,
    user: profile,
    membership: {
      role,
      scope,
      relationship: role === "guest" ? "guest" : "staff",
      metadata: {
        backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
        roleSource: "app_metadata",
      },
    },
    links: (options.links || [])
      .map(normalizeLink)
      .filter(Boolean)
      .map((link) => ({
        ...link,
        metadata: {
          backfillSchema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
        },
      })),
  };
}

function validateBackfillOptions(options = {}) {
  const failures = [];
  if (!isUuid(options.actorId)) {
    failures.push("A valid --actor-id is required so backfilled rows have a real server-owned audit actor.");
  }
  if (!normalizeText(options.organization?.name, 160)) {
    failures.push("--organization-name is required.");
  }
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    failures.push(`Apply mode requires --confirm=${APPLY_CONFIRMATION}.`);
  }
  if (options.apply && !normalizeExpectedPlanSha256(options.expectedPlanSha256)) {
    failures.push("Apply mode requires a valid --expected-plan-sha256 from the reviewed dry-run.");
  }
  if (options.apply && normalizeExpectedUserCount(options.expectedUserCount) === null) {
    failures.push("Apply mode requires --expected-user-count from the reviewed dry-run.");
  }
  const invalidRoles = (options.roles || []).filter((role) => !PLATFORM_ROLES.has(role));
  if (invalidRoles.length) {
    failures.push("Each --role must be a supported server-owned Platform role.");
  }
  return failures;
}

function selectBackfillUsers(users = [], options = {}) {
  const requestedRoles = new Set(options.roles || []);
  const selected = [];
  let invalidRoleCount = 0;
  let invalidStatusCount = 0;
  let skippedInactive = 0;
  let skippedRole = 0;

  for (const user of users) {
    const role = roleFromServerOwnedMetadata(user);
    const status = statusFromServerOwnedMetadata(user);
    if (!role) {
      invalidRoleCount += 1;
      continue;
    }
    if (!status) {
      invalidStatusCount += 1;
      continue;
    }
    if (status !== "active") {
      skippedInactive += 1;
      continue;
    }
    if (requestedRoles.size && !requestedRoles.has(role)) {
      skippedRole += 1;
      continue;
    }
    selected.push(user);
  }

  return { selected, invalidRoleCount, invalidStatusCount, skippedInactive, skippedRole };
}

export async function executePlatformIdentityBackfill(options = {}) {
  const failures = validateBackfillOptions(options);
  if (failures.length) {
    return { ok: false, status: 400, schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA, reason: failures.join(" "), failures };
  }

  const config = options.config || readConfig();
  const actor = {
    id: options.actorId,
    email: normalizeText(options.actorEmail, 254).toLowerCase(),
    role: "admin",
    adminSource: "platform-identity-backfill",
  };
  const userResult = options.userIds?.length
    ? await fetchAuthUsersById(options.userIds, { config, fetchImpl: options.fetchImpl })
    : await listAuthUsersForBackfill({ config, fetchImpl: options.fetchImpl, limit: options.limit, maxPages: options.maxPages });
  if (!userResult.ok) {
    return {
      ok: false,
      status: userResult.status || 500,
      schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      reason: normalizeText(userResult.reason, 500) || "Auth user loading failed.",
    };
  }

  const selection = selectBackfillUsers(userResult.users, options);
  const selectionSummary = {
    usersSelected: selection.selected.length,
    usersSkippedInactive: selection.skippedInactive,
    usersSkippedRole: selection.skippedRole,
  };
  if (selection.invalidRoleCount || selection.invalidStatusCount) {
    return {
      ok: false,
      status: 409,
      schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      dryRun: options.apply !== true,
      usersFound: userResult.users.length,
      usersProcessed: 0,
      failed: selection.invalidRoleCount + selection.invalidStatusCount,
      ...selectionSummary,
      reason: "Backfill stopped because Auth contains an unsupported server-owned role or status.",
    };
  }

  const plannedEntries = [];
  for (const user of selection.selected) {
    const body = buildTenantBootstrapBody(user, { ...options, apply: false });
    const result = await executeTenantBootstrap(body, actor, { config, fetchImpl: options.fetchImpl });
    plannedEntries.push({ body, result });
    if (!result.ok) {
      break;
    }
  }

  const plan = createPlatformIdentityBackfillPlan({ actorId: actor.id, entries: plannedEntries });
  const plannedResults = plannedEntries.map(createSafeBackfillResult);
  const plannedFailures = plannedResults.filter((result) => !result.ok);
  if (plannedFailures.length) {
    return {
      schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      ...createPlatformIdentityBackfillSummary({
        ok: false, status: 500, usersFound: userResult.users.length, results: plannedResults, plan, ...selectionSummary,
      }),
    };
  }

  if (!options.apply) {
    return {
      schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      ...createPlatformIdentityBackfillSummary({
        ok: true, status: 200, usersFound: userResult.users.length, results: plannedResults, plan, ...selectionSummary,
      }),
    };
  }

  if (
    plan.planSha256 !== normalizeExpectedPlanSha256(options.expectedPlanSha256) ||
    plan.usersPlanned !== normalizeExpectedUserCount(options.expectedUserCount)
  ) {
    return {
      schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
      ...createPlatformIdentityBackfillSummary({
        ok: false,
        status: 409,
        usersFound: userResult.users.length,
        results: plannedResults,
        plan,
        ...selectionSummary,
        reason: "Apply guard mismatch. Re-run and review the dry-run before applying.",
      }),
    };
  }

  const appliedEntries = [];
  for (const user of selection.selected) {
    const body = buildTenantBootstrapBody(user, { ...options, apply: true });
    const result = await executeTenantBootstrap(body, actor, { config, fetchImpl: options.fetchImpl });
    appliedEntries.push({ body, result });
    if (!result.ok) break;
  }

  const results = appliedEntries.map(createSafeBackfillResult);
  const failed = results.filter((result) => !result.ok);
  return {
    schema: PLATFORM_IDENTITY_BACKFILL_SCHEMA,
    ...createPlatformIdentityBackfillSummary({
      ok: failed.length === 0,
      status: failed.length ? 500 : 200,
      dryRun: false,
      usersFound: userResult.users.length,
      results,
      plan,
      ...selectionSummary,
    }),
  };
}

function printHumanSummary(summary) {
  console.log(`Platform Identity backfill ${summary.dryRun ? "dry-run" : "apply"}: ${summary.ok ? "ok" : "failed"}`);
  console.log(`- users found: ${summary.usersFound || 0}`);
  console.log(`- users selected: ${summary.usersSelected || 0}`);
  console.log(`- users skipped (inactive): ${summary.usersSkippedInactive || 0}`);
  console.log(`- users skipped (role filter): ${summary.usersSkippedRole || 0}`);
  console.log(`- users processed: ${summary.usersProcessed || 0}`);
  console.log(`- failed: ${summary.failed || 0}`);
  if (summary.plan?.planSha256) {
    console.log(`- plan sha256: ${summary.plan.planSha256}`);
    console.log(`- expected user count: ${summary.plan.usersPlanned}`);
  }
  for (const result of summary.results || []) {
    const actionList = result.operations.map((entry) => `${entry.type}:${entry.action}`).join(", ");
    console.log(`  - ${result.user}: ${result.ok ? "ok" : "failed"}${actionList ? ` (${actionList})` : ""}`);
    if (result.reason) {
      console.log(`    ${result.reason}`);
    }
  }
}

async function main() {
  const options = parseBackfillArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const summary = await executePlatformIdentityBackfill(options);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHumanSummary(summary);
  }
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
