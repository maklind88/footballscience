#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { readConfig, buildSupabaseKeyHeaders } = require("../api/_lib/supabase-admin.js");
const {
  SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES,
  SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES,
  SESSION_PLANNER_SOURCE_STORAGE_KEY,
  compareSessionPlannerStates,
  composeSessionPlannerLegacyState,
  extractSessionPlannerDomainRecords,
} = require("../api/_lib/session-planner-domain-records.js");

export const SESSION_PLANNER_DRY_RUN_SCHEMA = "footballscience-session-planner-domain-dry-run-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 10000;

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return UUID_PATTERN.test(normalizeText(value, 120));
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  return { value: args[index + 1], consumed: 1 };
}

export function parseDryRunArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    json: false,
    help: false,
    organizationId: normalizeText(env.SESSION_PLANNER_DOMAIN_ORGANIZATION_ID, 120),
    teamId: normalizeText(env.SESSION_PLANNER_DOMAIN_TEAM_ID, 120),
    appStateOrganizationId: normalizeText(env.SESSION_PLANNER_APP_STATE_ORGANIZATION_ID || "global", 120),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const flag = arg.split("=", 1)[0];
    const { value, consumed } = parseFlagValue(argv, index);
    index += consumed;
    if (flag === "--organization-id") options.organizationId = normalizeText(value, 120);
    if (flag === "--team-id") options.teamId = normalizeText(value, 120);
    if (flag === "--app-state-organization-id") options.appStateOrganizationId = normalizeText(value, 120);
  }
  return options;
}

function createHeaders(serviceRoleKey) {
  return {
    ...buildSupabaseKeyHeaders(serviceRoleKey),
    Accept: "application/json",
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function readRows(pathname, options = {}) {
  const config = options.config || readConfig();
  const fetchImpl = options.fetchImpl || fetch;
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("Supabase service role configuration is required for Session Planner dry-run.");
  }
  let response;
  try {
    response = await fetchImpl(`${config.url}/rest/v1${pathname}`, {
      method: "GET",
      headers: createHeaders(config.serviceRoleKey),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          : undefined,
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "Session Planner dry-run read timed out."
      : "Session Planner dry-run could not reach Supabase.";
    throw new Error(reason);
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || payload?.details || `Dry-run read failed (${response.status}).`);
  }
  return Array.isArray(payload) ? payload : [];
}

export async function resolveSessionPlannerScope(options = {}, dependencies = {}) {
  if (options.organizationId && !isUuid(options.organizationId)) {
    throw new TypeError("organizationId must be a UUID.");
  }
  if (options.teamId && !isUuid(options.teamId)) {
    throw new TypeError("teamId must be a UUID.");
  }
  const query = new URLSearchParams({
    select: "id,organization_id,name,slug,status",
    status: "eq.active",
    deleted_at: "is.null",
    order: "created_at.asc,id.asc",
    limit: options.teamId ? "1" : "3",
  });
  if (options.teamId) query.set("id", `eq.${options.teamId}`);
  if (options.organizationId) query.set("organization_id", `eq.${options.organizationId}`);
  const teams = await readRows(`/platform_teams?${query}`, dependencies);
  if (teams.length !== 1) {
    throw new Error(
      teams.length
        ? "Session Planner dry-run requires an explicit team because multiple active teams exist."
        : "Session Planner dry-run could not resolve an active team."
    );
  }
  const team = teams[0];
  if (!isUuid(team.id) || !isUuid(team.organization_id)) {
    throw new Error("Resolved Session Planner tenant scope is invalid.");
  }
  if (options.organizationId && team.organization_id !== options.organizationId) {
    throw new Error("Resolved team does not belong to the requested organization.");
  }
  return {
    organizationId: team.organization_id,
    teamId: team.id,
    teamName: normalizeText(team.name, 160),
    teamSlug: normalizeText(team.slug, 120),
  };
}

export async function readSessionPlannerSourceRecord(options = {}, dependencies = {}) {
  const query = new URLSearchParams({
    select: "organization_id,state_key,module_id,revision,value,removed,updated_at,value_hash",
    organization_id: `eq.${normalizeText(options.appStateOrganizationId || "global", 120)}`,
    state_key: `eq.${SESSION_PLANNER_SOURCE_STORAGE_KEY}`,
    removed: "eq.false",
    limit: "1",
  });
  const rows = await readRows(`/platform_app_state_records?${query}`, dependencies);
  if (rows.length !== 1) {
    throw new Error("Session Planner source record was not found or was not unique.");
  }
  return rows[0];
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function countCompatibilityMetadata(state = {}) {
  const tombstones = state.blockDeletionTombstones && typeof state.blockDeletionTombstones === "object"
    ? state.blockDeletionTombstones
    : {};
  const tombstoneCounts = Object.values(tombstones).map((value) =>
    value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0
  );
  const reductionGuard = state.blockReductionGuard && typeof state.blockReductionGuard === "object"
    ? state.blockReductionGuard
    : {};
  return {
    tombstoneDates: tombstoneCounts.filter(Boolean).length,
    tombstones: tombstoneCounts.reduce((sum, count) => sum + count, 0),
    reductionGuardDates: Object.keys(reductionGuard).length,
  };
}

function countMissingSelectedBlocks(state = {}) {
  return Object.values(state.sessions || {}).filter((session) => {
    const selectedId = normalizeText(session?.selectedBlockId, 180);
    return selectedId && !(Array.isArray(session?.blocks) && session.blocks.some((block) => block?.id === selectedId));
  }).length;
}

export function buildSessionPlannerDryRunReport({ sourceRecord, sourceState, scope, generatedAt = new Date().toISOString() }) {
  const domain = extractSessionPlannerDomainRecords(sourceState, scope);
  const recomposed = composeSessionPlannerLegacyState(domain, {
    organizationId: scope.organizationId,
    teamId: scope.teamId,
    selectedDate: sourceState.selectedDate,
  });
  const comparison = compareSessionPlannerStates(sourceState, recomposed);
  const rawValue = String(sourceRecord.value || "");
  const calculatedSourceHash = crypto.createHash("sha256").update(rawValue, "utf8").digest("hex");
  const recordedSourceHash = normalizeText(sourceRecord.value_hash, 64).toLowerCase();
  const sourceHashMatches = !recordedSourceHash || recordedSourceHash === calculatedSourceHash;
  const sessionBytes = domain.sessions.map((session) => jsonBytes(session.content));
  const blockBytes = domain.blocks.map((block) => jsonBytes(block.payload));
  const missingSelectedBlocks = countMissingSelectedBlocks(sourceState);
  const compatibility = countCompatibilityMetadata(sourceState);
  const checks = {
    sourceRevisionPresent: Number(sourceRecord.revision) > 0,
    sourceHashMatches,
    roundTripEqual: comparison.equal,
    tenantScopeValid: domain.organizationId === scope.organizationId && domain.teamId === scope.teamId,
    sessionPayloadsBounded: sessionBytes.every((size) => size <= SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES),
    blockPayloadsBounded: blockBytes.every((size) => size <= SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES),
    selectedBlockReferencesValid: missingSelectedBlocks === 0,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    schema: SESSION_PLANNER_DRY_RUN_SCHEMA,
    mode: "dry-run",
    generatedAt,
    writeCapability: false,
    source: {
      organizationId: normalizeText(sourceRecord.organization_id, 120),
      key: normalizeText(sourceRecord.state_key, 180),
      revision: Number(sourceRecord.revision) || 0,
      bytes: Buffer.byteLength(rawValue, "utf8"),
      recordedHash: recordedSourceHash,
      calculatedHash: calculatedSourceHash,
      updatedAt: normalizeText(sourceRecord.updated_at, 80),
    },
    scope,
    counts: domain.counts,
    payloads: {
      maxSessionBytes: Math.max(0, ...sessionBytes),
      maxBlockBytes: Math.max(0, ...blockBytes),
      p95BlockBytes: percentile(blockBytes, 0.95),
      sessionLimitBytes: SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES,
      blockLimitBytes: SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES,
    },
    compatibility,
    missingSelectedBlocks,
    comparison,
    checks,
    failures,
    readyForBackfillReview: failures.length === 0,
  };
}

export async function runSessionPlannerDryRun(options = {}, dependencies = {}) {
  const scope = await resolveSessionPlannerScope(options, dependencies);
  const sourceRecord = await readSessionPlannerSourceRecord(options, dependencies);
  let sourceState;
  try {
    sourceState = JSON.parse(String(sourceRecord.value || ""));
  } catch {
    throw new Error("Session Planner source record contains invalid JSON.");
  }
  return buildSessionPlannerDryRunReport({ sourceRecord, sourceState, scope });
}

function printHelp() {
  console.log(`Session Planner domain dry-run (read-only)

Usage:
  npm run session-planner:domain:dry-run -- --json
  npm run session-planner:domain:dry-run -- --organization-id <uuid> --team-id <uuid>

The command only reads tenant identity and football-session-planner-v3. It has no apply mode.
`);
}

function printSummary(report) {
  console.log(`Session Planner domain dry-run: ${report.readyForBackfillReview ? "ready" : "blocked"}`);
  console.log(`- Source revision: ${report.source.revision}`);
  console.log(`- Sessions / blocks: ${report.counts.sessions} / ${report.counts.blocks}`);
  console.log(`- Source size: ${report.source.bytes} bytes`);
  console.log(`- Max / p95 block: ${report.payloads.maxBlockBytes} / ${report.payloads.p95BlockBytes} bytes`);
  console.log(`- Tombstones: ${report.compatibility.tombstones}`);
  console.log(`- Round trip: ${report.comparison.equal ? "equal" : "mismatch"}`);
  if (report.failures.length) console.log(`- Failures: ${report.failures.join(", ")}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseDryRunArgs();
  if (options.help) {
    printHelp();
  } else {
    runSessionPlannerDryRun(options)
      .then((report) => {
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else printSummary(report);
        if (!report.readyForBackfillReview) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(`Session Planner dry-run failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
