import {
  createPlatformIdentityRollbackPlan,
  createPlatformIdentityRollbackSummary,
  verifyPlatformIdentityRollbackState,
} from "./platform-identity-snapshot.mjs";
import { collectPlatformIdentitySnapshotRows } from "./platform-identity-snapshot-io.mjs";
import {
  createPlatformIdentityMigrationSummary,
  createPlatformIdentityRollbackBundle,
} from "./platform-identity-migration-bundle.mjs";
import {
  createPlatformIdentityBackfillCommands,
  createPlatformIdentityBackfillMigrationBundle,
} from "./platform-identity-migration-plan.mjs";

export const PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA =
  "footballscience-platform-identity-staging-drill-v1";
export const PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION =
  "DRILL_PLATFORM_IDENTITY_STAGING";
export const PLATFORM_IDENTITY_BACKFILL_CONFIRMATION =
  "APPLY_PLATFORM_IDENTITY_BACKFILL";
export const PLATFORM_IDENTITY_ROLLBACK_CONFIRMATION =
  "APPLY_PLATFORM_IDENTITY_ROLLBACK";

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function serviceHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse(response) {
  const text = response?.status === 204 ? "" : await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function requestJson(url, request, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, request);
  } catch {
    return {
      ok: false,
      status: 503,
      reason: "Platform Identity staging request could not be completed.",
    };
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason:
        payload?.message ||
        payload?.error_description ||
        "Platform Identity staging request failed.",
    };
  }
  return {
    ok: true,
    status: response.status,
    payload,
    contentRange: response.headers?.get?.("content-range") || "",
  };
}

export async function executePlatformIdentityMigrationRpc(
  bundle,
  confirmation,
  { config, fetchImpl = fetch } = {}
) {
  const result = await requestJson(
    `${config.url}/rest/v1/rpc/execute_platform_identity_migration_bundle`,
    {
      method: "POST",
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        p_bundle: bundle,
        p_expected_bundle_sha256: bundle.integrity.contentSha256,
        p_expected_project_ref: bundle.projectRef,
        p_confirmation: confirmation,
      }),
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const payload = Array.isArray(result.payload)
    ? result.payload[0]
    : result.payload;
  if (
    payload?.ok !== true ||
    payload?.schema !==
      "footballscience-platform-identity-migration-execution-v1" ||
    payload?.bundleSha256 !== bundle.integrity.contentSha256 ||
    payload?.appliedCount !== bundle.commandCount ||
    payload?.piiExposed !== false
  ) {
    return {
      ok: false,
      status: 502,
      reason: "Platform Identity migration RPC receipt is invalid.",
    };
  }
  return { ok: true, receipt: payload };
}

export async function readPlatformIdentityMigrationAudit(
  runId,
  organizationId,
  { config, fetchImpl = fetch } = {}
) {
  const url = new URL(
    `${config.url}/rest/v1/platform_identity_migration_events`
  );
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  url.searchParams.set("run_id", `eq.${normalizeText(runId, 120)}`);
  url.searchParams.set(
    "organization_id",
    `eq.${normalizeText(organizationId, 120)}`
  );
  const result = await requestJson(
    url.toString(),
    {
      method: "GET",
      headers: serviceHeaders(config.serviceRoleKey, {
        Prefer: "count=exact",
      }),
    },
    fetchImpl
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.payload)) {
    return {
      ok: false,
      status: 502,
      reason: "Platform Identity audit response is invalid.",
    };
  }
  const exactCount = Number.parseInt(result.contentRange.split("/").at(-1), 10);
  return {
    ok: true,
    eventCount: Number.isSafeInteger(exactCount)
      ? exactCount
      : result.payload.length,
  };
}

function collectionInput(snapshot, config, fetchImpl) {
  return {
    config,
    fetchImpl,
    organizationId: snapshot.scope.organizationId,
    clubId: snapshot.scope.clubId,
    teamId: snapshot.scope.teamId,
    userIds: snapshot.scope.userIds,
    links: snapshot.scope.links,
  };
}

function validateDrillOptions(options) {
  const failures = [];
  if (options.target !== "staging") failures.push("target must be staging");
  if (!normalizeText(options.projectRef, 80)) {
    failures.push("project ref is required");
  }
  if (
    !normalizeText(options.config?.url, 500) ||
    !normalizeText(options.config?.serviceRoleKey, 2_000)
  ) {
    failures.push("Supabase server configuration is required");
  }
  if (!options.snapshot?.ok || options.snapshot.target !== "staging") {
    failures.push("verified staging snapshot is required");
  }
  if (!Array.isArray(options.entries)) {
    failures.push("reviewed backfill entries are required");
  }
  if (options.apply && options.confirm !== PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION) {
    failures.push("staging drill confirmation is invalid");
  }
  if (
    options.apply &&
    !/^[a-f0-9]{64}$/.test(
      normalizeText(options.expectedBundleSha256, 64)
    )
  ) {
    failures.push("reviewed bundle SHA-256 is required");
  }
  return failures;
}

export async function executePlatformIdentityStagingDrill(
  options = {},
  dependencies = {}
) {
  const failures = validateDrillOptions(options);
  if (failures.length) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures,
      applied: false,
      rolledBack: false,
    };
  }
  const executeRpc =
    dependencies.executeRpc ||
    ((bundle, confirmation) =>
      executePlatformIdentityMigrationRpc(bundle, confirmation, options));
  const collectRows =
    dependencies.collectRows ||
    (() =>
      collectPlatformIdentitySnapshotRows(
        collectionInput(options.snapshot, options.config, options.fetchImpl)
      ));
  const readAudit =
    dependencies.readAudit ||
    ((runId) =>
      readPlatformIdentityMigrationAudit(
        runId,
        options.snapshot.scope.organizationId,
        options
      ));
  const bundle = createPlatformIdentityBackfillMigrationBundle({
    snapshot: options.snapshot,
    entries: options.entries,
    actorId: options.actorId,
    projectRef: options.projectRef,
    requestId: options.requestId,
    createdAt: options.createdAt,
  });
  if (!bundle.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: bundle.blockers || bundle.failures || ["bundle planning failed"],
      applied: false,
      rolledBack: false,
    };
  }
  const bundleSummary = createPlatformIdentityMigrationSummary(bundle);
  if (!options.apply) {
    return {
      ok: true,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      dryRun: true,
      applied: false,
      rolledBack: false,
      bundle: bundleSummary,
      piiExposed: false,
    };
  }
  if (bundle.integrity.contentSha256 !== options.expectedBundleSha256) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: ["reviewed bundle SHA-256 changed"],
      applied: false,
      rolledBack: false,
      bundle: bundleSummary,
    };
  }

  const applied = await executeRpc(
    bundle,
    PLATFORM_IDENTITY_BACKFILL_CONFIRMATION
  );
  if (!applied.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: [applied.reason || "atomic backfill failed"],
      applied: false,
      rolledBack: false,
      bundle: bundleSummary,
    };
  }

  const current = await collectRows();
  if (!current.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: [current.reason || "post-apply snapshot failed"],
      applied: true,
      rolledBack: false,
      recoveryRequired: true,
      applyReceipt: applied.receipt,
    };
  }
  const postApplyPlan = createPlatformIdentityBackfillCommands({
    snapshot: options.snapshot,
    currentRowsByTable: current.rowsByTable,
    entries: options.entries,
    actorId: options.actorId,
    createdAt: options.createdAt,
  });
  const rollbackPlan = createPlatformIdentityRollbackPlan({
    snapshot: options.snapshot,
    currentRowsByTable: current.rowsByTable,
    actorId: options.actorId,
    createdAt: options.rollbackCreatedAt,
  });
  if (!rollbackPlan.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: rollbackPlan.blockers,
      applied: true,
      rolledBack: false,
      recoveryRequired: true,
      applyReceipt: applied.receipt,
    };
  }
  const rollbackBundle = createPlatformIdentityRollbackBundle({
    snapshot: options.snapshot,
    rollbackPlan,
    projectRef: options.projectRef,
    actorId: options.actorId,
    requestId: `${options.requestId}-rollback`,
    createdAt: options.rollbackCreatedAt,
  });
  const rolledBack = await executeRpc(
    rollbackBundle,
    PLATFORM_IDENTITY_ROLLBACK_CONFIRMATION
  );
  if (!rolledBack.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: [rolledBack.reason || "atomic rollback failed"],
      applied: true,
      rolledBack: false,
      recoveryRequired: true,
      applyReceipt: applied.receipt,
    };
  }

  const restored = await collectRows();
  if (!restored.ok) {
    return {
      ok: false,
      schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
      failures: [restored.reason || "post-rollback snapshot failed"],
      applied: true,
      rolledBack: true,
      recoveryRequired: true,
    };
  }
  const rollbackVerification = verifyPlatformIdentityRollbackState({
    snapshot: options.snapshot,
    currentRowsByTable: restored.rowsByTable,
  });
  const [applyAudit, rollbackAudit] = await Promise.all([
    readAudit(applied.receipt.runId),
    readAudit(rolledBack.receipt.runId),
  ]);
  const verificationFailures = [
    ...(postApplyPlan.ok && postApplyPlan.commands.length === 0
      ? []
      : postApplyPlan.blockers?.length
        ? postApplyPlan.blockers
        : ["post-apply state is not idempotent"]),
    ...(rollbackVerification.blockers || []),
    ...(!applyAudit.ok || applyAudit.eventCount !== bundle.commandCount
      ? ["backfill audit count mismatch"]
      : []),
    ...(!rollbackAudit.ok ||
    rollbackAudit.eventCount !== rollbackBundle.commandCount
      ? ["rollback audit count mismatch"]
      : []),
  ];
  return {
    ok: verificationFailures.length === 0,
    schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
    dryRun: false,
    applied: true,
    rolledBack: true,
    recoveryRequired: verificationFailures.length > 0,
    failures: verificationFailures,
    bundle: bundleSummary,
    rollback: createPlatformIdentityRollbackSummary(rollbackPlan),
    applyReceipt: applied.receipt,
    rollbackReceipt: rolledBack.receipt,
    audit: {
      backfillEvents: applyAudit.eventCount || 0,
      rollbackEvents: rollbackAudit.eventCount || 0,
    },
    rollbackVerification,
    piiExposed: false,
  };
}
