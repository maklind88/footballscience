import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  readSessionPlannerDomainSnapshot,
} = require("../../api/_lib/session-planner-database.js");
const {
  createSessionPlannerMigrationSnapshot,
} = require("../../api/_lib/session-planner-migration-plan.js");

function normalizeText(value, maxLength = 1000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

export function sessionPlannerOperatorRequestId(requestId, suffix) {
  const normalizedSuffix = normalizeText(suffix, 40);
  const maxBaseLength = Math.max(1, 180 - normalizedSuffix.length);
  return normalizeText(requestId, maxBaseLength) + normalizedSuffix;
}

export function sessionPlannerOperatorDatabaseConfig(config = {}) {
  const url = normalizeText(config.url, 500).replace(/\/+$/, "");
  return {
    url: url.endsWith("/rest/v1") ? url : url + "/rest/v1",
    serviceRoleKey: normalizeText(config.serviceRoleKey, 2000),
  };
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: "Bearer " + serviceRoleKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function createSafeSessionPlannerExecutionResult(result = {}) {
  return {
    ok: result.ok === true,
    schema: normalizeText(result.schema, 120) || null,
    operation: normalizeText(result.operation, 40) || null,
    runId: normalizeText(result.runId, 120) || null,
    planSha256: normalizeText(result.planSha256, 64) || null,
    bundleSha256: normalizeText(result.bundleSha256, 64) || null,
    projectRef: normalizeText(result.projectRef, 80) || null,
    appliedSessions: Number(result.appliedSessions) || 0,
    appliedBlocks: Number(result.appliedBlocks) || 0,
    containsCoachingContent: false,
  };
}

export async function executeSessionPlannerMigrationRpc(
  bundle,
  confirmation,
  options,
  dependencies,
  config
) {
  if (dependencies.executeRpc) {
    return dependencies.executeRpc(bundle, confirmation, options);
  }
  const response = await (dependencies.fetchImpl || fetch)(
    sessionPlannerOperatorDatabaseConfig(config).url +
      "/rpc/execute_session_planner_migration_bundle",
    {
      method: "POST",
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        p_bundle: bundle,
        p_expected_bundle_sha256: bundle.integrity.contentSha256,
        p_source_organization_id: options.appStateOrganizationId,
        p_confirmation: confirmation,
      }),
    }
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error("Session Planner atomic migration RPC failed.");
  }
  return payload;
}

export function sessionPlannerOperatorTimestamp(dependencies, label) {
  const value = dependencies.nextTimestamp
    ? dependencies.nextTimestamp(label)
    : new Date().toISOString();
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error("Session Planner operator timestamp is invalid.");
  }
  return new Date(value).toISOString();
}

export async function captureSessionPlannerOperatorSnapshot(
  options,
  source,
  dependencies,
  config,
  label
) {
  const readTarget = dependencies.readTargetSnapshot || readSessionPlannerDomainSnapshot;
  const rows = await readTarget(
    { organizationId: options.organizationId, teamId: options.teamId },
    {
      allowDisabled: true,
      includeArchived: true,
      config: sessionPlannerOperatorDatabaseConfig(config),
      fetchImpl: dependencies.fetchImpl,
      env: dependencies.env || process.env,
    }
  );
  if (!rows?.ok) throw new Error("Session Planner staging snapshot could not be read.");
  const snapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef: options.expectedProjectRef,
    createdAt: sessionPlannerOperatorTimestamp(dependencies, label),
    scope: { organizationId: options.organizationId, teamId: options.teamId },
    sourceRevision: source.revision,
    sourceHash: source.hash,
    rows,
  });
  if (!snapshot.ok) throw new Error("Session Planner staging snapshot is invalid.");
  return snapshot;
}
