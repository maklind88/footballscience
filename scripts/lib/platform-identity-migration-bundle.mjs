import {
  canonicalJson,
  sha256,
  verifyPlatformIdentitySnapshot,
} from "./platform-identity-snapshot.mjs";

export const PLATFORM_IDENTITY_MIGRATION_BUNDLE_SCHEMA =
  "footballscience-platform-identity-migration-bundle-v1";
export const PLATFORM_IDENTITY_MIGRATION_EXECUTION_SCHEMA =
  "footballscience-platform-identity-migration-execution-v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BACKFILL_ACTIONS = new Set(["create", "update", "restore"]);
const ROLLBACK_ACTIONS = new Set(["restore-existing", "archive-created"]);
const MAX_COMMANDS = 5_000;

const TABLES = Object.freeze({
  platform_organizations: {
    keyColumn: "id",
    createFields: ["id", "slug", "name", "status", "metadata"],
    patchFields: [
      "slug",
      "name",
      "status",
      "metadata",
      "updated_by",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
  },
  platform_clubs: {
    keyColumn: "id",
    createFields: [
      "id",
      "organization_id",
      "slug",
      "name",
      "country_code",
      "status",
      "metadata",
    ],
    patchFields: [
      "slug",
      "name",
      "country_code",
      "status",
      "metadata",
      "updated_by",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
  },
  platform_teams: {
    keyColumn: "id",
    createFields: [
      "id",
      "organization_id",
      "club_id",
      "slug",
      "name",
      "sport",
      "age_group",
      "gender",
      "status",
      "metadata",
    ],
    patchFields: [
      "slug",
      "name",
      "sport",
      "age_group",
      "gender",
      "status",
      "metadata",
      "updated_by",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
  },
  platform_user_profiles: {
    keyColumn: "user_id",
    createFields: [
      "user_id",
      "primary_organization_id",
      "primary_club_id",
      "primary_team_id",
      "display_name",
      "first_name",
      "last_name",
      "email",
      "title",
      "department",
      "avatar_url",
      "status",
      "metadata",
    ],
    patchFields: [
      "primary_organization_id",
      "primary_club_id",
      "primary_team_id",
      "display_name",
      "first_name",
      "last_name",
      "email",
      "title",
      "department",
      "avatar_url",
      "status",
      "metadata",
      "updated_by",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
  },
  platform_memberships: {
    keyColumn: "id",
    createFields: [
      "id",
      "organization_id",
      "club_id",
      "team_id",
      "user_id",
      "role",
      "scope",
      "status",
      "relationship",
      "invited_by",
      "accepted_at",
      "metadata",
    ],
    patchFields: [
      "role",
      "scope",
      "status",
      "relationship",
      "invited_by",
      "accepted_at",
      "metadata",
      "updated_by",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
  },
  platform_tenant_links: {
    keyColumn: "id",
    createFields: [
      "id",
      "organization_id",
      "club_id",
      "team_id",
      "module_id",
      "module_table",
      "module_record_id",
      "scope",
      "status",
      "metadata",
    ],
    patchFields: ["status", "metadata"],
  },
});

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return UUID_PATTERN.test(normalizeText(value, 120));
}

function normalizeRecord(value, allowedFields) {
  if (!isPlainObject(value)) return null;
  const unknownFields = Object.keys(value).filter(
    (field) => !allowedFields.includes(field)
  );
  if (unknownFields.length) return null;
  return Object.fromEntries(
    allowedFields
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, value[field]])
  );
}

function commandFailure(index, reason) {
  return `Command ${index + 1}: ${reason}`;
}

function normalizeCommand(command, operation, index) {
  if (!isPlainObject(command)) {
    return { failure: commandFailure(index, "command must be an object.") };
  }
  const table = normalizeText(command.table, 100);
  const config = TABLES[table];
  if (!config) {
    return { failure: commandFailure(index, "table is not approved.") };
  }
  const action = normalizeText(command.action, 80);
  const approvedActions =
    operation === "backfill" ? BACKFILL_ACTIONS : ROLLBACK_ACTIONS;
  if (!approvedActions.has(action)) {
    return {
      failure: commandFailure(index, "action does not match the operation."),
    };
  }
  if (command.keyColumn !== config.keyColumn || !isUuid(command.key)) {
    return {
      failure: commandFailure(index, "record key contract is invalid."),
    };
  }

  const createAction = action === "create";
  const expectedRowVersion =
    command.expectedRowVersion === null ||
    command.expectedRowVersion === undefined
      ? null
      : Number(command.expectedRowVersion);
  if (
    (createAction && expectedRowVersion !== null) ||
    (!createAction &&
      (!Number.isSafeInteger(expectedRowVersion) || expectedRowVersion < 1))
  ) {
    return {
      failure: commandFailure(index, "expected row version is invalid."),
    };
  }

  const record = createAction
    ? normalizeRecord(command.record, config.createFields)
    : null;
  const patch = createAction
    ? null
    : normalizeRecord(command.patch, config.patchFields);
  if (createAction && (!record || record[config.keyColumn] !== command.key)) {
    return {
      failure: commandFailure(index, "create record is invalid."),
    };
  }
  if (!createAction && (!patch || Object.keys(patch).length === 0)) {
    return {
      failure: commandFailure(index, "patch is invalid."),
    };
  }

  return {
    command: {
      table,
      action,
      keyColumn: config.keyColumn,
      key: command.key,
      expectedRowVersion,
      ...(record ? { record } : {}),
      ...(patch ? { patch } : {}),
    },
  };
}

function validateBundleInput(input) {
  const failures = [];
  const snapshotCheck = verifyPlatformIdentitySnapshot(input.snapshot);
  if (input.target !== "staging") {
    failures.push("Platform Identity migration bundles are staging-only.");
  }
  if (!snapshotCheck.ok || input.snapshot?.target !== "staging") {
    failures.push("A verified staging snapshot is required.");
  }
  if (
    !normalizeText(input.projectRef, 80) ||
    input.projectRef !== input.snapshot?.projectRef
  ) {
    failures.push("Bundle and snapshot project refs must match.");
  }
  if (!isUuid(input.actorId)) {
    failures.push("A valid migration actor id is required.");
  }
  if (!isUuid(input.snapshot?.scope?.organizationId)) {
    failures.push("A verified snapshot organization id is required.");
  }
  if (
    !SHA256_PATTERN.test(normalizeText(input.planSha256, 64)) ||
    input.planSha256 !== input.snapshot?.plan?.planSha256
  ) {
    failures.push("Bundle and snapshot plan hashes must match.");
  }
  if (!["backfill", "rollback"].includes(input.operation)) {
    failures.push("Migration operation must be backfill or rollback.");
  }
  if (
    !normalizeText(input.createdAt, 80) ||
    Number.isNaN(Date.parse(input.createdAt))
  ) {
    failures.push("A valid bundle timestamp is required.");
  }
  if (!normalizeText(input.requestId, 180)) {
    failures.push("A request id is required.");
  }
  if (
    !Array.isArray(input.commands) ||
    input.commands.length > MAX_COMMANDS
  ) {
    failures.push(`Commands must be an array of at most ${MAX_COMMANDS}.`);
  }
  return { failures, snapshotCheck };
}

export function createPlatformIdentityMigrationBundle(input = {}) {
  const { failures, snapshotCheck } = validateBundleInput(input);
  const commands = [];
  if (Array.isArray(input.commands)) {
    input.commands.forEach((entry, index) => {
      const normalized = normalizeCommand(entry, input.operation, index);
      if (normalized.failure) failures.push(normalized.failure);
      if (normalized.command) commands.push(normalized.command);
    });
  }
  if (failures.length) return { ok: false, failures };

  const body = {
    ok: true,
    schema: PLATFORM_IDENTITY_MIGRATION_BUNDLE_SCHEMA,
    executionEnabled: false,
    transactionRequired: true,
    target: "staging",
    projectRef: input.projectRef,
    operation: input.operation,
    organizationId: input.snapshot.scope.organizationId,
    actorId: input.actorId,
    requestId: normalizeText(input.requestId, 180),
    createdAt: new Date(input.createdAt).toISOString(),
    planSha256: input.planSha256,
    snapshotSha256: snapshotCheck.contentSha256,
    expectedUserCount: input.snapshot.plan.userCount,
    commandCount: commands.length,
    commands,
  };
  return {
    ...body,
    integrity: {
      algorithm: "sha256",
      contentSha256: sha256(body),
    },
  };
}

export function verifyPlatformIdentityMigrationBundle(bundle = {}) {
  if (
    !isPlainObject(bundle) ||
    bundle.ok !== true ||
    bundle.schema !== PLATFORM_IDENTITY_MIGRATION_BUNDLE_SCHEMA ||
    bundle.target !== "staging" ||
    bundle.executionEnabled !== false ||
    bundle.transactionRequired !== true ||
    !Array.isArray(bundle.commands) ||
    bundle.commandCount !== bundle.commands.length
  ) {
    return { ok: false, reason: "Migration bundle schema is invalid." };
  }
  const { integrity, ...body } = bundle;
  const expected = normalizeText(integrity?.contentSha256, 64);
  if (integrity?.algorithm !== "sha256" || !SHA256_PATTERN.test(expected)) {
    return { ok: false, reason: "Migration bundle integrity is invalid." };
  }
  const actual = sha256(body);
  return actual === expected
    ? { ok: true, contentSha256: actual }
    : {
        ok: false,
        reason: "Migration bundle content hash does not match.",
        contentSha256: actual,
      };
}

export function createPlatformIdentityRollbackBundle({
  snapshot,
  rollbackPlan,
  projectRef,
  actorId,
  requestId,
  createdAt,
} = {}) {
  if (
    !rollbackPlan?.ok ||
    rollbackPlan?.snapshotSha256 !== snapshot?.integrity?.contentSha256
  ) {
    return {
      ok: false,
      failures: ["A blocker-free rollback plan for this snapshot is required."],
    };
  }
  return createPlatformIdentityMigrationBundle({
    target: "staging",
    projectRef,
    actorId,
    requestId,
    createdAt,
    operation: "rollback",
    planSha256: snapshot?.plan?.planSha256,
    snapshot,
    commands: rollbackPlan.actions,
  });
}

export function createPlatformIdentityMigrationSummary(bundle = {}) {
  const verification = verifyPlatformIdentityMigrationBundle(bundle);
  const actionCounts = {};
  for (const command of bundle.commands || []) {
    const key = `${command.table}:${command.action}`;
    actionCounts[key] = (actionCounts[key] || 0) + 1;
  }
  return {
    ok: verification.ok,
    schema: bundle.schema || null,
    target: bundle.target || null,
    operation: bundle.operation || null,
    planSha256: bundle.planSha256 || null,
    snapshotSha256: bundle.snapshotSha256 || null,
    contentSha256: verification.contentSha256 || null,
    commandCount: Number(bundle.commandCount) || 0,
    actionCounts,
    piiExposed: false,
  };
}

export const platformIdentityMigrationTables = TABLES;
export const platformIdentityMigrationCanonicalJson = canonicalJson;
