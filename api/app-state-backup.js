const { createHash } = require("node:crypto");
const {
  getCurrentActor,
  readConfig,
  buildSupabaseKeyHeaders,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");
const {
  isAppStateDatabaseEnabled,
  listAppStateRecords,
  readAppStateRecord,
  writeAppStateRecord,
} = require("./_lib/app-state-records-database.js");
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");

const STATE_BUCKET = "footballscience-app-state";
const BACKUP_PREFIX = "backups/app-state";
const BACKUP_ORGANIZATION_ENV = "APP_STATE_BACKUP_ORGANIZATION_ID";
const CENTRAL_STATE_KEYS = new Set(dataSafetyRegistry.keys());
const PLAYER_PROFILES_KEY = "football-player-profiles-v1";
const PLAYER_PROFILE_AUDIT_FIELDS = new Map([
  ["Availability status", "status"],
  ["Squad status", "squadStatus"],
]);
const PLAYER_PROFILE_AUDIT_VALUE_ALIASES = Object.freeze({
  status: {
    available: "available",
    "managed load": "managed",
    managed: "managed",
    injured: "injured",
    rehab: "rehab",
    unavailable: "unavailable",
    "international duty": "national-team",
    "national team": "national-team",
    "national-team": "national-team",
    vacation: "vacation",
    "personal leave": "personal",
    personal: "personal",
    suspended: "suspended",
    "loan / external": "loan",
    loan: "loan",
  },
  squadStatus: {
    important: "important",
    rotation: "rotation",
    "squad depth": "depth",
    depth: "depth",
    development: "development",
    "loan watch": "loan",
    loan: "loan",
  },
});
const PLAYER_PROFILE_REPAIR_FIELDS = Object.freeze(["status", "squadStatus"]);

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  return `${url}/storage/v1`;
}

function storageHeaders(contentType = "application/json") {
  const { serviceRoleKey } = readConfig();
  return buildSupabaseKeyHeaders(serviceRoleKey, { contentType });
}

async function parseResponseJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function storageRequest(path, options = {}) {
  const response = await fetch(`${getStorageBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = options.raw ? await response.text() : await parseResponseJson(response);
  if (!response.ok) {
    const reason = payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`;
    return { ok: false, status: response.status, payload, reason };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureStateBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STATE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return { ok: true };
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STATE_BUCKET,
      name: STATE_BUCKET,
      public: false,
    }),
  });

  if (created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already")) {
    return { ok: true };
  }

  return created;
}

function requireOrganizationId(value) {
  const organizationId = String(value || "").trim();
  if (!organizationId) {
    throw new Error("Canonical backup tenant scope is required.");
  }
  return organizationId;
}

function isActiveCanonicalStatus(value = "") {
  return String(value || "").trim().toLowerCase() === "active";
}

function findCanonicalTenantSummary(items = [], id = "") {
  const normalizedId = String(id || "").trim();
  if (!normalizedId || !Array.isArray(items)) {
    return null;
  }
  return items.find((item) => String(item?.id || "").trim() === normalizedId) || null;
}

function isActiveTenantSummary(summary = null) {
  return Boolean(summary && isActiveCanonicalStatus(summary.status));
}

function tenantBackupPrefix(organizationId) {
  return `${BACKUP_PREFIX}/organizations/${encodeURIComponent(requireOrganizationId(organizationId))}`;
}

function latestBackupPath(organizationId) {
  return `${tenantBackupPrefix(organizationId)}/latest.json`;
}

function objectPathForKey(key, organizationId) {
  return `organizations/${encodeURIComponent(requireOrganizationId(organizationId))}/${encodeURIComponent(key)}.json`;
}

async function readStateObject(key, organizationId) {
  if (!isAppStateDatabaseEnabled()) {
    throw new Error("Tenant-scoped app-state backup requires database mode.");
  }
  const result = await readAppStateRecord(key, requireOrganizationId(organizationId));
  if (!result.ok) {
    throw new Error(result.reason || `Central state could not be read for ${key}.`);
  }
  return result.entry?.key && !result.entry.removed ? result.entry : null;
}

async function writeStateObject(entry) {
  const organizationId = requireOrganizationId(entry?.organizationId);
  if (!isAppStateDatabaseEnabled()) {
    return { ok: false, status: 503, reason: "Tenant-scoped app-state repair requires database mode." };
  }
  const databaseResult = await writeAppStateRecord(
    { ...entry, organizationId },
    Math.max(0, Number(entry?.revision || 1) - 1)
  );
  if (!databaseResult.ok) {
    return databaseResult;
  }
  const persistedEntry = { ...entry, ...(databaseResult.entry || {}), organizationId };
  const path = objectPathForKey(entry.key, organizationId);
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(persistedEntry),
  });

  if (!result.ok && result.status === 404) {
    const fallback = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
      method: "POST",
      headers: {
        "x-upsert": "true",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(persistedEntry),
    });
    return { ok: true, entry: persistedEntry, backupOk: Boolean(fallback.ok) };
  }

  return { ok: true, entry: persistedEntry, backupOk: Boolean(result.ok) };
}

function hashText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

async function collectCentralStateBackupEntries(organizationId) {
  const tenantId = requireOrganizationId(organizationId);
  if (!isAppStateDatabaseEnabled()) {
    throw new Error("Tenant-scoped app-state backup requires database mode.");
  }
  const databaseResult = await listAppStateRecords(tenantId, Array.from(CENTRAL_STATE_KEYS));
  if (!databaseResult.ok) {
    throw new Error(databaseResult.reason || "Tenant app-state records could not be listed.");
  }
  const recordsByKey = new Map(
    (databaseResult.entries || []).filter((entry) => entry?.key).map((entry) => [entry.key, entry])
  );
  const entries = {};
  const manifest = {};
  Array.from(CENTRAL_STATE_KEYS).forEach((key) => {
      const entry = recordsByKey.get(key) || null;
      if (!entry?.key || entry.removed) {
        manifest[key] = { present: false };
        return;
      }

      const value = String(entry.value ?? "");
      entries[entry.key] = value;
      manifest[entry.key] = {
        present: true,
        moduleId: dataSafetyRegistry.getByKey(entry.key)?.moduleId || "",
        organizationId: tenantId,
        revision: Number.isInteger(Number(entry.revision)) ? Number(entry.revision) : 0,
        mergePolicy: entry.mergePolicy || dataSafetyRegistry.getByKey(entry.key)?.mergePolicy || "",
        updatedAt: entry.updatedAt || "",
        updatedBy: entry.updatedBy || "",
        bytes: Buffer.byteLength(value, "utf8"),
        sha256: hashText(value),
      };
    });

  return { entries, manifest };
}

function createBackupEnvelope({ actor, organizationId, entries, manifest }) {
  const tenantId = requireOrganizationId(organizationId);
  const createdAt = new Date().toISOString();
  const core = {
    schema: "footballscience-app-state-backup-v1",
    createdAt,
    source: "api/app-state-backup",
    organizationId: tenantId,
    actor: {
      id: actor?.id || "vercel-cron",
      role: actor?.role || "system",
      email: actor?.email || "",
    },
    entryCount: Object.keys(entries).length,
    manifest,
    entries,
  };

  return {
    ...core,
    contentSha256: hashText(JSON.stringify(core)),
  };
}

async function writeBackupObject(path, payload, upsert = false) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "PUT",
    headers: {
      ...(upsert ? { "x-upsert": "true" } : {}),
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  });

  if (!result.ok && result.status === 404) {
    return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
      method: "POST",
      headers: {
        ...(upsert ? { "x-upsert": "true" } : {}),
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(payload),
    });
  }

  return result;
}

function parseBackupJson(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readBackupObject(path) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return result;
  }

  const payload = parseBackupJson(result.payload);
  if (!payload) {
    return { ok: false, status: 500, reason: "App-state backup object is not valid JSON." };
  }

  return { ok: true, status: result.status, payload };
}

function isSafeBackupPath(path, organizationId) {
  const normalized = String(path || "");
  const prefix = `${tenantBackupPrefix(organizationId)}/`;
  return (
    normalized.startsWith(prefix) &&
    normalized.endsWith(".json") &&
    normalized !== latestBackupPath(organizationId) &&
    !normalized.includes("..") &&
    !normalized.includes("?") &&
    !normalized.includes("#") &&
    !normalized.startsWith("/")
  );
}

function summarizeBackupStatus(pointer, backup, organizationId) {
  const tenantId = requireOrganizationId(organizationId);
  const { contentSha256, ...backupCore } = backup;
  const computedSha256 = hashText(JSON.stringify(backupCore));
  const createdAtMs = Date.parse(pointer.createdAt || backup.createdAt || "");
  const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, Date.now() - createdAtMs) : null;
  const manifestSummary = summarizeBackupManifest(backup.manifest || {});

  return {
    latest: {
      schema: pointer.schema || "",
      createdAt: pointer.createdAt || "",
      ageMs,
      path: pointer.path || "",
      entryCount: Number.isInteger(Number(pointer.entryCount)) ? Number(pointer.entryCount) : 0,
      contentSha256: pointer.contentSha256 || "",
    },
    backup: {
      schema: backup.schema || "",
      createdAt: backup.createdAt || "",
      entryCount: Number.isInteger(Number(backup.entryCount)) ? Number(backup.entryCount) : 0,
      contentSha256: contentSha256 || "",
      computedSha256,
    },
    manifest: manifestSummary.manifest,
    manifestCoverage: manifestSummary.coverage,
    backupMatchesPointer:
      pointer.schema === "footballscience-app-state-backup-pointer-v1" &&
      backup.schema === "footballscience-app-state-backup-v1" &&
      pointer.organizationId === tenantId &&
      backup.organizationId === tenantId &&
      pointer.createdAt === backup.createdAt &&
      Number(pointer.entryCount) === Number(backup.entryCount) &&
      pointer.contentSha256 === contentSha256 &&
      computedSha256 === contentSha256 &&
      manifestSummary.coverage.missingKeys.length === 0,
  };
}

function summarizeBackupManifest(rawManifest) {
  const source = rawManifest && typeof rawManifest === "object" && !Array.isArray(rawManifest) ? rawManifest : {};
  const manifest = {};
  const missingKeys = [];
  let presentEntryCount = 0;

  for (const key of CENTRAL_STATE_KEYS) {
    const contract = dataSafetyRegistry.getByKey(key);
    const entry = source[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      missingKeys.push(key);
      manifest[key] = {
        present: false,
        moduleId: contract?.moduleId || "",
      };
      continue;
    }

    const present = entry.present === true;
    if (present) {
      presentEntryCount += 1;
    }

    manifest[key] = {
      present,
      moduleId: String(entry.moduleId || contract?.moduleId || ""),
      organizationId: String(entry.organizationId || ""),
      revision: Number.isInteger(Number(entry.revision)) ? Number(entry.revision) : 0,
      mergePolicy: String(entry.mergePolicy || contract?.mergePolicy || ""),
      updatedAt: String(entry.updatedAt || ""),
      bytes: Number.isInteger(Number(entry.bytes)) ? Number(entry.bytes) : 0,
      sha256: String(entry.sha256 || ""),
    };
  }

  return {
    manifest,
    coverage: {
      keyCount: CENTRAL_STATE_KEYS.size,
      manifestKeyCount: Object.keys(source).length,
      presentEntryCount,
      missingKeys,
    },
  };
}

function createModuleRestoreSummary() {
  const modules = {};
  for (const key of CENTRAL_STATE_KEYS) {
    const moduleId = dataSafetyRegistry.getByKey(key)?.moduleId || "unknown";
    if (!modules[moduleId]) {
      modules[moduleId] = {
        protectedKeyCount: 0,
        presentEntryCount: 0,
        parsedEntryCount: 0,
      };
    }
    modules[moduleId].protectedKeyCount += 1;
  }
  return modules;
}

function createRestoreDrillSummary(backup, statusSummary) {
  const manifest = backup.manifest && typeof backup.manifest === "object" && !Array.isArray(backup.manifest) ? backup.manifest : {};
  const entries = backup.entries && typeof backup.entries === "object" && !Array.isArray(backup.entries) ? backup.entries : {};
  const modules = createModuleRestoreSummary();
  const unknownEntryKeys = [];
  const missingEntryKeys = [];
  const unexpectedEntryKeys = [];
  const invalidEntries = [];
  let parsedEntryCount = 0;

  for (const key of Object.keys(entries)) {
    if (!CENTRAL_STATE_KEYS.has(key)) {
      unknownEntryKeys.push(key);
    }
  }

  for (const key of CENTRAL_STATE_KEYS) {
    const contract = dataSafetyRegistry.getByKey(key);
    const moduleId = contract?.moduleId || "unknown";
    const manifestEntry = manifest[key] || {};
    const hasEntry = Object.prototype.hasOwnProperty.call(entries, key);
    const present = manifestEntry.present === true;

    if (!present && hasEntry) {
      unexpectedEntryKeys.push(key);
      continue;
    }

    if (!present) {
      continue;
    }

    modules[moduleId].presentEntryCount += 1;

    if (!hasEntry) {
      missingEntryKeys.push(key);
      continue;
    }

    const value = String(entries[key] ?? "");
    const bytes = Buffer.byteLength(value, "utf8");
    const sha256 = hashText(value);
    const entryFailures = [];

    if (Number(manifestEntry.bytes) !== bytes) {
      entryFailures.push("bytes");
    }

    if (String(manifestEntry.sha256 || "") !== sha256) {
      entryFailures.push("sha256");
    }

    try {
      JSON.parse(value);
    } catch {
      entryFailures.push("json");
    }

    if (entryFailures.length) {
      invalidEntries.push({
        key,
        moduleId,
        reasons: entryFailures,
      });
      continue;
    }

    parsedEntryCount += 1;
    modules[moduleId].parsedEntryCount += 1;
  }

  const entryCount = Object.keys(entries).length;
  const declaredEntryCount = Number(backup.entryCount || 0);
  const pointerEntryCount = Number(statusSummary.latest.entryCount || 0);
  const entryCountMatches = entryCount === declaredEntryCount && entryCount === pointerEntryCount;
  const restorable =
    statusSummary.backupMatchesPointer &&
    entryCountMatches &&
    unknownEntryKeys.length === 0 &&
    missingEntryKeys.length === 0 &&
    unexpectedEntryKeys.length === 0 &&
    invalidEntries.length === 0;

  return {
    dryRun: true,
    restored: false,
    restorable,
    keyCount: CENTRAL_STATE_KEYS.size,
    entryCount,
    declaredEntryCount,
    pointerEntryCount,
    parsedEntryCount,
    moduleCount: Object.keys(modules).length,
    modules,
    unknownEntryKeys,
    missingEntryKeys,
    unexpectedEntryKeys,
    invalidEntries,
  };
}

function parseStateValue(entry) {
  if (!entry?.value) {
    return null;
  }

  try {
    return JSON.parse(String(entry.value || "{}"));
  } catch {
    return null;
  }
}

function parseBackupEntryValue(backup, key) {
  const entries = backup?.entries && typeof backup.entries === "object" && !Array.isArray(backup.entries) ? backup.entries : {};
  if (!Object.prototype.hasOwnProperty.call(entries, key)) {
    return null;
  }

  try {
    return JSON.parse(String(entries[key] || "{}"));
  } catch {
    return null;
  }
}

function getPlayerProfileAuditMergeKey(player = {}) {
  const id = String(player?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  const name = String(player?.name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function normalizePlayerProfileAuditValue(path = "", value) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue || cleanValue === "-") {
    return "";
  }

  const aliases = PLAYER_PROFILE_AUDIT_VALUE_ALIASES[path];
  const aliasKey = cleanValue.toLowerCase();
  return aliases && Object.prototype.hasOwnProperty.call(aliases, aliasKey) ? aliases[aliasKey] : undefined;
}

function getChangeLogTimestamp(entry = {}) {
  const timestamp = Date.parse(String(entry?.createdAt || entry?.updatedAt || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function createPlayerProfileAuditChangeIndex(state = {}) {
  const index = new Map();
  const changeLog = Array.isArray(state?.changeLog) ? state.changeLog : [];

  changeLog.forEach((entry) => {
    const mergeKey = entry?.playerId
      ? `id:${entry.playerId}`
      : entry?.playerName
        ? `name:${String(entry.playerName).trim().toLowerCase()}`
        : "";
    if (!mergeKey) {
      return;
    }

    const timestamp = getChangeLogTimestamp(entry);
    (Array.isArray(entry?.changes) ? entry.changes : []).forEach((change) => {
      const path = PLAYER_PROFILE_AUDIT_FIELDS.get(String(change?.field || "").trim());
      if (!path) {
        return;
      }

      const value = normalizePlayerProfileAuditValue(path, change?.to);
      if (typeof value === "undefined") {
        return;
      }

      const key = `${mergeKey}:${path}`;
      const current = index.get(key);
      if (!current || timestamp >= current.timestamp) {
        index.set(key, { timestamp, value });
      }
    });
  });

  return index;
}

function summarizePlayerProfileAuditState(state = {}) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const changeLog = Array.isArray(state?.changeLog) ? state.changeLog : [];
  const changeIndex = createPlayerProfileAuditChangeIndex(state);
  const driftPlayers = new Set();
  const summary = {
    present: Boolean(state && typeof state === "object" && !Array.isArray(state)),
    playerCount: players.length,
    changeLogCount: changeLog.length,
    explicitStatusChangeCount: 0,
    explicitSquadStatusChangeCount: 0,
    statusSelfHealCandidateCount: 0,
    squadStatusSelfHealCandidateCount: 0,
    playersWithSelfHealCandidates: 0,
  };

  players.forEach((player) => {
    const mergeKey = getPlayerProfileAuditMergeKey(player);
    if (!mergeKey) {
      return;
    }

    ["status", "squadStatus"].forEach((path) => {
      const entry = changeIndex.get(`${mergeKey}:${path}`);
      if (!entry) {
        return;
      }

      if (path === "status") {
        summary.explicitStatusChangeCount += 1;
      } else {
        summary.explicitSquadStatusChangeCount += 1;
      }

      if (String(player?.[path] ?? "") !== String(entry.value)) {
        driftPlayers.add(mergeKey);
        if (path === "status") {
          summary.statusSelfHealCandidateCount += 1;
        } else {
          summary.squadStatusSelfHealCandidateCount += 1;
        }
      }
    });
  });

  summary.playersWithSelfHealCandidates = driftPlayers.size;
  return summary;
}

function comparePlayerProfileAuditStates(currentState = {}, backupState = {}) {
  const currentPlayers = new Map(
    (Array.isArray(currentState?.players) ? currentState.players : [])
      .map((player) => [getPlayerProfileAuditMergeKey(player), player])
      .filter(([key]) => Boolean(key))
  );
  const comparison = {
    comparablePlayers: 0,
    statusDifferenceCount: 0,
    squadStatusDifferenceCount: 0,
  };

  (Array.isArray(backupState?.players) ? backupState.players : []).forEach((backupPlayer) => {
    const currentPlayer = currentPlayers.get(getPlayerProfileAuditMergeKey(backupPlayer));
    if (!currentPlayer) {
      return;
    }

    comparison.comparablePlayers += 1;
    if (String(currentPlayer.status ?? "") !== String(backupPlayer.status ?? "")) {
      comparison.statusDifferenceCount += 1;
    }
    if (String(currentPlayer.squadStatus ?? "") !== String(backupPlayer.squadStatus ?? "")) {
      comparison.squadStatusDifferenceCount += 1;
    }
  });

  return comparison;
}

function getBackupPlayerProfileMap(backupState = {}) {
  return new Map(
    (Array.isArray(backupState?.players) ? backupState.players : [])
      .map((player) => [getPlayerProfileAuditMergeKey(player), player])
      .filter(([key]) => Boolean(key))
  );
}

function createSquadStatusRepairCandidates(currentState = {}, backupState = {}) {
  const players = Array.isArray(currentState?.players) ? currentState.players : [];
  const changeIndex = createPlayerProfileAuditChangeIndex(currentState);
  const backupPlayers = getBackupPlayerProfileMap(backupState);
  const candidates = [];
  const fieldCounts = {
    status: 0,
    squadStatus: 0,
  };
  let candidatesWithBothFields = 0;
  let candidateFieldsWithBackupSupport = 0;

  players.forEach((player) => {
    const mergeKey = getPlayerProfileAuditMergeKey(player);
    if (!mergeKey) {
      return;
    }

    const backupPlayer = backupPlayers.get(mergeKey);
    const fields = PLAYER_PROFILE_REPAIR_FIELDS.map((field) => {
      const change = changeIndex.get(`${mergeKey}:${field}`);
      if (!change) {
        return null;
      }

      if (String(player?.[field] ?? "") === String(change.value)) {
        return null;
      }

      const backupSupportsTarget = backupPlayer
        ? String(backupPlayer?.[field] ?? "") === String(change.value)
        : false;
      if (backupSupportsTarget) {
        candidateFieldsWithBackupSupport += 1;
      }
      fieldCounts[field] += 1;

      return {
        field,
        trustedSource: "latest-explicit-changeLog-entry",
        restorable: true,
        backupHasComparablePlayer: Boolean(backupPlayer),
        backupSupportsTarget,
      };
    }).filter(Boolean);

    if (!fields.length) {
      return;
    }

    if (fields.length === PLAYER_PROFILE_REPAIR_FIELDS.length) {
      candidatesWithBothFields += 1;
    }

    const candidateSeed = JSON.stringify({
      mergeKey,
      fields: fields.map((field) => {
        const change = changeIndex.get(`${mergeKey}:${field.field}`);
        return {
          field: field.field,
          targetValue: change?.value || "",
          source: field.trustedSource,
        };
      }),
    });
    candidates.push({
      candidateSha256: hashText(candidateSeed),
      fieldCount: fields.length,
      fields,
      allFieldsAllowed: fields.every((field) => PLAYER_PROFILE_REPAIR_FIELDS.includes(field.field)),
      restorableFromTrustedSource: fields.every((field) => field.restorable === true),
    });
  });

  const totalFieldCount = fieldCounts.status + fieldCounts.squadStatus;

  return {
    candidateCount: candidates.length,
    fieldCounts,
    totalFieldCount,
    candidatesWithBothFields,
    candidateFieldsWithBackupSupport,
    allowedFields: [...PLAYER_PROFILE_REPAIR_FIELDS],
    allCandidatesRestorableFromTrustedSource: candidates.every(
      (candidate) => candidate.restorableFromTrustedSource === true
    ),
    allCandidateFieldsAllowed: candidates.every((candidate) => candidate.allFieldsAllowed === true),
    candidates,
    planSha256: hashText(
      JSON.stringify({
        fieldCounts,
        totalFieldCount,
        candidates: candidates.map((candidate) => ({
          candidateSha256: candidate.candidateSha256,
          fields: candidate.fields.map((field) => ({
            field: field.field,
            trustedSource: field.trustedSource,
            backupSupportsTarget: field.backupSupportsTarget,
          })),
        })),
      })
    ),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function createSquadStatusRepairApplication(currentState = {}, backupState = {}) {
  const nextState = cloneJson(currentState);
  const players = Array.isArray(nextState.players) ? nextState.players : [];
  const currentPlayers = Array.isArray(currentState?.players) ? currentState.players : [];
  const changeIndex = createPlayerProfileAuditChangeIndex(currentState);
  const backupPlayers = getBackupPlayerProfileMap(backupState);
  const fieldCounts = {
    status: 0,
    squadStatus: 0,
  };
  const candidates = [];

  players.forEach((player, index) => {
    const sourcePlayer = currentPlayers[index] || player;
    const mergeKey = getPlayerProfileAuditMergeKey(sourcePlayer);
    if (!mergeKey) {
      return;
    }

    const backupPlayer = backupPlayers.get(mergeKey);
    const fields = [];

    PLAYER_PROFILE_REPAIR_FIELDS.forEach((field) => {
      const change = changeIndex.get(`${mergeKey}:${field}`);
      if (!change || String(sourcePlayer?.[field] ?? "") === String(change.value)) {
        return;
      }

      player[field] = change.value;
      fieldCounts[field] += 1;
      fields.push({
        field,
        trustedSource: "latest-explicit-changeLog-entry",
        restorable: true,
        backupHasComparablePlayer: Boolean(backupPlayer),
        backupSupportsTarget: backupPlayer ? String(backupPlayer?.[field] ?? "") === String(change.value) : false,
      });
    });

    if (!fields.length) {
      return;
    }

    const candidateSeed = JSON.stringify({
      mergeKey,
      fields: fields.map((field) => {
        const change = changeIndex.get(`${mergeKey}:${field.field}`);
        return {
          field: field.field,
          targetValue: change?.value || "",
          source: field.trustedSource,
        };
      }),
    });

    candidates.push({
      candidateSha256: hashText(candidateSeed),
      fieldCount: fields.length,
      fields,
      allFieldsAllowed: fields.every((field) => PLAYER_PROFILE_REPAIR_FIELDS.includes(field.field)),
      restorableFromTrustedSource: fields.every((field) => field.restorable === true),
    });
  });

  const totalFieldCount = fieldCounts.status + fieldCounts.squadStatus;
  return {
    repairedState: nextState,
    candidateCount: candidates.length,
    fieldCounts,
    totalFieldCount,
    allCandidateFieldsAllowed: candidates.every((candidate) => candidate.allFieldsAllowed === true),
    allCandidatesRestorableFromTrustedSource: candidates.every(
      (candidate) => candidate.restorableFromTrustedSource === true
    ),
    candidates,
    planSha256: hashText(
      JSON.stringify({
        fieldCounts,
        totalFieldCount,
        candidates: candidates.map((candidate) => ({
          candidateSha256: candidate.candidateSha256,
          fields: candidate.fields.map((field) => ({
            field: field.field,
            trustedSource: field.trustedSource,
            backupSupportsTarget: field.backupSupportsTarget,
          })),
        })),
      })
    ),
  };
}

function createRepairedStateEntry(currentEntry = {}, repairedState = {}, actor = {}) {
  const value = JSON.stringify(repairedState);
  const contract = dataSafetyRegistry.getByKey(PLAYER_PROFILES_KEY);
  return {
    ...currentEntry,
    schema: "footballscience-app-state-v1",
    key: PLAYER_PROFILES_KEY,
    moduleId: currentEntry.moduleId || contract?.moduleId || "squad",
    organizationId: currentEntry.organizationId || actor?.organizationId || "",
    mergePolicy: currentEntry.mergePolicy || contract?.mergePolicy || "server-merge",
    value,
    removed: false,
    revision: Number(currentEntry.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "system-squad-status-repair",
    hash: hashText(value),
  };
}

async function createSquadStatusAuditSummary(organizationId) {
  const currentEntry = await readStateObject(PLAYER_PROFILES_KEY, organizationId);
  const currentState = parseStateValue(currentEntry);
  const currentSummary = {
    key: PLAYER_PROFILES_KEY,
    present: Boolean(currentEntry?.key && currentState),
    revision: Number.isInteger(Number(currentEntry?.revision)) ? Number(currentEntry.revision) : 0,
    updatedAt: String(currentEntry?.updatedAt || ""),
    moduleId: String(currentEntry?.moduleId || dataSafetyRegistry.getByKey(PLAYER_PROFILES_KEY)?.moduleId || ""),
    valueSha256: currentEntry?.value ? hashText(currentEntry.value) : "",
    ...summarizePlayerProfileAuditState(currentState || {}),
  };

  const pointerResult = await readBackupObject(latestBackupPath(organizationId));
  if (!pointerResult.ok) {
    return {
      current: currentSummary,
      latestBackup: {
        present: false,
        hasPlayerProfilesEntry: false,
      },
      backupComparison: {
        comparablePlayers: 0,
        statusDifferenceCount: 0,
        squadStatusDifferenceCount: 0,
      },
      codeReleaseLikelyEnough:
        currentSummary.present &&
        currentSummary.playersWithSelfHealCandidates === 0 &&
        currentSummary.explicitStatusChangeCount + currentSummary.explicitSquadStatusChangeCount > 0,
      dataRepairLikelyRequired: currentSummary.playersWithSelfHealCandidates > 0,
      reason: pointerResult.reason || "Latest app-state backup pointer is not available.",
    };
  }

  const pointer = pointerResult.payload || {};
  let backupSummary = {
    present: false,
    hasPlayerProfilesEntry: false,
    path: "",
    createdAt: String(pointer.createdAt || ""),
    entryCount: Number.isInteger(Number(pointer.entryCount)) ? Number(pointer.entryCount) : 0,
  };
  let backupComparison = {
    comparablePlayers: 0,
    statusDifferenceCount: 0,
    squadStatusDifferenceCount: 0,
  };

  if (isSafeBackupPath(pointer.path, organizationId)) {
    const backupResult = await readBackupObject(pointer.path);
    if (backupResult.ok) {
      const backup = backupResult.payload || {};
      const backupState = parseBackupEntryValue(backup, PLAYER_PROFILES_KEY);
      backupSummary = {
        ...backupSummary,
        present: true,
        hasPlayerProfilesEntry: Boolean(backupState),
        path: String(pointer.path || ""),
        backupMatchesPointer: summarizeBackupStatus(pointer, backup, organizationId).backupMatchesPointer,
        ...summarizePlayerProfileAuditState(backupState || {}),
      };
      backupComparison = comparePlayerProfileAuditStates(currentState || {}, backupState || {});
    }
  }

  const explicitChangeCount = currentSummary.explicitStatusChangeCount + currentSummary.explicitSquadStatusChangeCount;
  const driftCount = currentSummary.statusSelfHealCandidateCount + currentSummary.squadStatusSelfHealCandidateCount;

  return {
    current: currentSummary,
    latestBackup: backupSummary,
    backupComparison,
    codeReleaseLikelyEnough: currentSummary.present && explicitChangeCount > 0 && driftCount === 0,
    dataRepairLikelyRequired: currentSummary.present && driftCount > 0,
  };
}

async function createSquadStatusRepairDryRunSummary(organizationId) {
  const currentEntry = await readStateObject(PLAYER_PROFILES_KEY, organizationId);
  const currentState = parseStateValue(currentEntry);
  const currentValue = String(currentEntry?.value || "");
  const currentGuard = {
    key: PLAYER_PROFILES_KEY,
    present: Boolean(currentEntry?.key && currentState),
    revision: Number.isInteger(Number(currentEntry?.revision)) ? Number(currentEntry.revision) : 0,
    updatedAt: String(currentEntry?.updatedAt || ""),
    moduleId: String(currentEntry?.moduleId || dataSafetyRegistry.getByKey(PLAYER_PROFILES_KEY)?.moduleId || ""),
    valueSha256: currentValue ? hashText(currentValue) : "",
    valueBytes: currentValue ? Buffer.byteLength(currentValue, "utf8") : 0,
  };

  const pointerResult = await readBackupObject(latestBackupPath(organizationId));
  let backupGuard = {
    present: false,
    hasPlayerProfilesEntry: false,
    backupMatchesPointer: false,
    pointerCreatedAt: "",
    pointerEntryCount: 0,
    pointerContentSha256: "",
    playerProfilesRevision: 0,
    playerProfilesUpdatedAt: "",
    playerProfilesValueSha256: "",
    playerProfilesValueBytes: 0,
  };
  let backupState = null;

  if (pointerResult.ok) {
    const pointer = pointerResult.payload || {};
    backupGuard = {
      ...backupGuard,
      pointerCreatedAt: String(pointer.createdAt || ""),
      pointerEntryCount: Number.isInteger(Number(pointer.entryCount)) ? Number(pointer.entryCount) : 0,
      pointerContentSha256: String(pointer.contentSha256 || ""),
    };

    if (isSafeBackupPath(pointer.path, organizationId)) {
      const backupResult = await readBackupObject(pointer.path);
      if (backupResult.ok) {
        const backup = backupResult.payload || {};
        const statusSummary = summarizeBackupStatus(pointer, backup, organizationId);
        backupState = parseBackupEntryValue(backup, PLAYER_PROFILES_KEY);
        const manifestEntry = backup?.manifest?.[PLAYER_PROFILES_KEY] || {};
        backupGuard = {
          ...backupGuard,
          present: true,
          hasPlayerProfilesEntry: Boolean(backupState),
          backupMatchesPointer: statusSummary.backupMatchesPointer === true,
          playerProfilesRevision: Number.isInteger(Number(manifestEntry.revision)) ? Number(manifestEntry.revision) : 0,
          playerProfilesUpdatedAt: String(manifestEntry.updatedAt || ""),
          playerProfilesValueSha256: String(manifestEntry.sha256 || ""),
          playerProfilesValueBytes: Number.isInteger(Number(manifestEntry.bytes)) ? Number(manifestEntry.bytes) : 0,
        };
      }
    }
  }

  const candidates = createSquadStatusRepairCandidates(currentState || {}, backupState || {});
  const summary = {
    current: {
      ...currentGuard,
      ...summarizePlayerProfileAuditState(currentState || {}),
    },
    latestBackup: backupGuard,
    repairDryRun: {
      ...candidates,
      snapshotGuardReady: currentGuard.present === true && Boolean(currentGuard.valueSha256),
      backupGuardReady: backupGuard.present === true && backupGuard.hasPlayerProfilesEntry === true && backupGuard.backupMatchesPointer === true,
      writePlan: {
        writes: false,
        targetKey: PLAYER_PROFILES_KEY,
        fieldsOnly: [...PLAYER_PROFILE_REPAIR_FIELDS],
        preWriteSnapshotRequired: true,
        revisionGuardRequired: true,
        maxCandidateCount: candidates.candidateCount,
        maxFieldWriteCount: candidates.totalFieldCount,
      },
      safeToExecuteAsSeparateRepair:
        currentGuard.present === true &&
        backupGuard.present === true &&
        backupGuard.hasPlayerProfilesEntry === true &&
        backupGuard.backupMatchesPointer === true &&
        candidates.candidateCount > 0 &&
        candidates.allCandidateFieldsAllowed === true &&
        candidates.allCandidatesRestorableFromTrustedSource === true,
    },
    rollbackPlan: {
      available: backupGuard.present === true && backupGuard.hasPlayerProfilesEntry === true && backupGuard.backupMatchesPointer === true,
      source: "latest-verified-app-state-backup-plus-required-pre-write-snapshot",
      restoreKey: PLAYER_PROFILES_KEY,
      restoreRequiresSeparateApproval: true,
      rawBackupExposed: false,
    },
  };

  return {
    ...summary,
    dryRunSha256: hashText(
      JSON.stringify({
        current: currentGuard,
        latestBackup: backupGuard,
        repairDryRun: {
          candidateCount: summary.repairDryRun.candidateCount,
          fieldCounts: summary.repairDryRun.fieldCounts,
          planSha256: summary.repairDryRun.planSha256,
        },
      })
    ),
  };
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
      return source[key];
    }
  }
  return undefined;
}

function parseGuardInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function parseGuardSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function normalizeSquadStatusRepairExecuteGuards(body = {}) {
  return {
    expectedCurrentRevision: parseGuardInteger(
      firstPresent(body, ["expectedCurrentRevision", "currentRevision", "expected_current_revision"])
    ),
    expectedCurrentSha256: parseGuardSha256(
      firstPresent(body, ["expectedCurrentSha256", "currentSha256", "expected_current_sha256"])
    ),
    expectedBackupSha256: parseGuardSha256(
      firstPresent(body, ["expectedBackupSha256", "backupSha256", "expected_backup_sha256"])
    ),
    expectedPlanSha256: parseGuardSha256(firstPresent(body, ["expectedPlanSha256", "planSha256", "expected_plan_sha256"])),
    expectedDryRunSha256: parseGuardSha256(
      firstPresent(body, ["expectedDryRunSha256", "dryRunSha256", "expected_dry_run_sha256"])
    ),
    expectedCandidateCount: parseGuardInteger(
      firstPresent(body, ["expectedCandidateCount", "candidateCount", "expected_candidate_count"])
    ),
    expectedFieldWriteCount: parseGuardInteger(
      firstPresent(body, ["expectedFieldWriteCount", "fieldWriteCount", "expected_field_write_count"])
    ),
    expectedStatusFieldCount: parseGuardInteger(
      firstPresent(body, ["expectedStatusFieldCount", "statusFieldCount", "expected_status_field_count"])
    ),
    expectedSquadStatusFieldCount: parseGuardInteger(
      firstPresent(body, ["expectedSquadStatusFieldCount", "squadStatusFieldCount", "expected_squad_status_field_count"])
    ),
    allowedFields: Array.isArray(body?.allowedFields) ? body.allowedFields.map((field) => String(field)) : [],
  };
}

function validateSquadStatusRepairExecuteGuards(summary, guards) {
  const failures = [];
  const repairDryRun = summary?.repairDryRun || {};
  const fieldCounts = repairDryRun.fieldCounts || {};
  const allowedFields =
    guards.allowedFields.length > 0 ? guards.allowedFields : [...PLAYER_PROFILE_REPAIR_FIELDS];

  if (guards.expectedCurrentRevision === null) {
    failures.push("expected-current-revision-missing");
  } else if (Number(summary?.current?.revision || 0) !== guards.expectedCurrentRevision) {
    failures.push("current-revision-mismatch");
  }

  if (!guards.expectedCurrentSha256) {
    failures.push("expected-current-sha256-missing");
  } else if (String(summary?.current?.valueSha256 || "") !== guards.expectedCurrentSha256) {
    failures.push("current-sha256-mismatch");
  }

  if (!guards.expectedBackupSha256) {
    failures.push("expected-backup-sha256-missing");
  } else if (String(summary?.latestBackup?.pointerContentSha256 || "") !== guards.expectedBackupSha256) {
    failures.push("backup-sha256-mismatch");
  }

  if (!guards.expectedPlanSha256) {
    failures.push("expected-plan-sha256-missing");
  } else if (String(repairDryRun.planSha256 || "") !== guards.expectedPlanSha256) {
    failures.push("plan-sha256-mismatch");
  }

  if (!guards.expectedDryRunSha256) {
    failures.push("expected-dry-run-sha256-missing");
  } else if (String(summary?.dryRunSha256 || "") !== guards.expectedDryRunSha256) {
    failures.push("dry-run-sha256-mismatch");
  }

  if (guards.expectedCandidateCount === null) {
    failures.push("expected-candidate-count-missing");
  } else if (Number(repairDryRun.candidateCount || 0) !== guards.expectedCandidateCount) {
    failures.push("candidate-count-mismatch");
  }

  if (guards.expectedFieldWriteCount === null) {
    failures.push("expected-field-write-count-missing");
  } else if (Number(repairDryRun.totalFieldCount || 0) !== guards.expectedFieldWriteCount) {
    failures.push("field-write-count-mismatch");
  }

  if (guards.expectedStatusFieldCount === null) {
    failures.push("expected-status-field-count-missing");
  } else if (Number(fieldCounts.status || 0) !== guards.expectedStatusFieldCount) {
    failures.push("status-field-count-mismatch");
  }

  if (guards.expectedSquadStatusFieldCount === null) {
    failures.push("expected-squad-status-field-count-missing");
  } else if (Number(fieldCounts.squadStatus || 0) !== guards.expectedSquadStatusFieldCount) {
    failures.push("squad-status-field-count-mismatch");
  }

  if (guards.expectedCandidateCount !== null && Number(repairDryRun.candidateCount || 0) > guards.expectedCandidateCount) {
    failures.push("candidate-count-over-limit");
  }
  if (guards.expectedFieldWriteCount !== null && Number(repairDryRun.totalFieldCount || 0) > guards.expectedFieldWriteCount) {
    failures.push("field-write-count-over-limit");
  }
  if (
    allowedFields.length !== PLAYER_PROFILE_REPAIR_FIELDS.length ||
    !PLAYER_PROFILE_REPAIR_FIELDS.every((field) => allowedFields.includes(field))
  ) {
    failures.push("allowed-fields-mismatch");
  }
  if (repairDryRun.allCandidateFieldsAllowed !== true) {
    failures.push("candidate-fields-not-allowed");
  }
  if (repairDryRun.allCandidatesRestorableFromTrustedSource !== true) {
    failures.push("candidates-not-restorable-from-trusted-source");
  }
  if (repairDryRun.safeToExecuteAsSeparateRepair !== true) {
    failures.push("separate-repair-not-safe");
  }

  return failures;
}

function createSquadStatusRepairGuardSnapshot(summary = {}) {
  return {
    current: {
      revision: Number(summary?.current?.revision || 0),
      valueSha256: String(summary?.current?.valueSha256 || ""),
    },
    latestBackup: {
      pointerContentSha256: String(summary?.latestBackup?.pointerContentSha256 || ""),
      backupMatchesPointer: summary?.latestBackup?.backupMatchesPointer === true,
    },
    repairDryRun: {
      candidateCount: Number(summary?.repairDryRun?.candidateCount || 0),
      fieldCounts: {
        status: Number(summary?.repairDryRun?.fieldCounts?.status || 0),
        squadStatus: Number(summary?.repairDryRun?.fieldCounts?.squadStatus || 0),
      },
      totalFieldCount: Number(summary?.repairDryRun?.totalFieldCount || 0),
      planSha256: String(summary?.repairDryRun?.planSha256 || ""),
    },
    dryRunSha256: String(summary?.dryRunSha256 || ""),
  };
}

async function createSquadStatusRepairPreWriteSnapshot(actor, organizationId) {
  const backupSource = await collectCentralStateBackupEntries(organizationId);
  const envelope = createBackupEnvelope({ actor, organizationId, ...backupSource });
  const timestamp = envelope.createdAt.replace(/[:.]/g, "-");
  const snapshotPath = `${tenantBackupPrefix(organizationId)}/repair-snapshots/squad-status/${timestamp}-${envelope.contentSha256.slice(0, 12)}.json`;
  const result = await writeBackupObject(snapshotPath, envelope, false);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason || "Squad status repair pre-write snapshot could not be written.",
    };
  }

  return {
    ok: true,
    createdAt: envelope.createdAt,
    path: snapshotPath,
    pathSha256: hashText(snapshotPath),
    entryCount: envelope.entryCount,
    contentSha256: envelope.contentSha256,
  };
}

async function loadSquadStatusRepairExecutionContext(organizationId) {
  const currentEntry = await readStateObject(PLAYER_PROFILES_KEY, organizationId);
  const currentState = parseStateValue(currentEntry);
  const pointerResult = await readBackupObject(latestBackupPath(organizationId));
  let backupState = null;

  if (pointerResult.ok && isSafeBackupPath(pointerResult.payload?.path, organizationId)) {
    const backupResult = await readBackupObject(pointerResult.payload.path);
    if (backupResult.ok) {
      backupState = parseBackupEntryValue(backupResult.payload || {}, PLAYER_PROFILES_KEY);
    }
  }

  return {
    currentEntry,
    currentState,
    backupState,
  };
}

async function sendSquadStatusRepairExecute(req, res, actor, organizationId) {
  const body = await readRequestJson(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, reason: "Request body must be valid JSON." });
  }

  const guards = normalizeSquadStatusRepairExecuteGuards(body);
  const initialSummary = await createSquadStatusRepairDryRunSummary(organizationId);
  const initialGuardFailures = validateSquadStatusRepairExecuteGuards(initialSummary, guards);
  if (initialGuardFailures.length) {
    return sendJson(res, 409, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: "Squad status repair execution guards did not match current live state.",
      writes: false,
      executed: false,
      guardFailures: initialGuardFailures,
      guardSnapshot: createSquadStatusRepairGuardSnapshot(initialSummary),
    });
  }

  const snapshot = await createSquadStatusRepairPreWriteSnapshot(actor, organizationId);
  if (!snapshot.ok) {
    return sendJson(res, 500, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: snapshot.reason,
      writes: false,
      executed: false,
    });
  }

  const preWriteSummary = await createSquadStatusRepairDryRunSummary(organizationId);
  const preWriteGuardFailures = validateSquadStatusRepairExecuteGuards(preWriteSummary, guards);
  if (preWriteGuardFailures.length) {
    return sendJson(res, 409, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: "Squad status repair execution guards changed after pre-write snapshot.",
      writes: false,
      executed: false,
      preWriteSnapshot: snapshot,
      guardFailures: preWriteGuardFailures,
      guardSnapshot: createSquadStatusRepairGuardSnapshot(preWriteSummary),
    });
  }

  const context = await loadSquadStatusRepairExecutionContext(organizationId);
  if (!context.currentEntry?.key || !context.currentState || !context.backupState) {
    return sendJson(res, 409, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: "Squad status repair execution context is not restorable.",
      writes: false,
      executed: false,
      preWriteSnapshot: snapshot,
    });
  }

  const application = createSquadStatusRepairApplication(context.currentState, context.backupState);
  const expectedFields = preWriteSummary.repairDryRun?.fieldCounts || {};
  if (
    application.planSha256 !== preWriteSummary.repairDryRun.planSha256 ||
    application.candidateCount !== preWriteSummary.repairDryRun.candidateCount ||
    application.totalFieldCount !== preWriteSummary.repairDryRun.totalFieldCount ||
    application.fieldCounts.status !== Number(expectedFields.status || 0) ||
    application.fieldCounts.squadStatus !== Number(expectedFields.squadStatus || 0) ||
    application.allCandidateFieldsAllowed !== true ||
    application.allCandidatesRestorableFromTrustedSource !== true
  ) {
    return sendJson(res, 409, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: "Squad status repair execution application does not match the dry-run plan.",
      writes: false,
      executed: false,
      preWriteSnapshot: snapshot,
      guardSnapshot: createSquadStatusRepairGuardSnapshot(preWriteSummary),
    });
  }

  const repairedEntry = createRepairedStateEntry(context.currentEntry, application.repairedState, actor);
  const writeResult = await writeStateObject(repairedEntry);
  if (!writeResult.ok) {
    return sendJson(res, 500, {
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      reason: writeResult.reason || "Squad status repair state write failed.",
      writes: false,
      executed: false,
      preWriteSnapshot: snapshot,
      rollbackPlan: {
        available: true,
        snapshotPath: snapshot.path,
        snapshotContentSha256: snapshot.contentSha256,
        restoreKey: PLAYER_PROFILES_KEY,
        restoreRequiresSeparateApproval: true,
      },
    });
  }

  const afterEntry = await readStateObject(PLAYER_PROFILES_KEY, organizationId);
  const afterValue = String(afterEntry?.value || "");
  const afterSummary = await createSquadStatusRepairDryRunSummary(organizationId);
  const afterFieldCounts = afterSummary.repairDryRun?.fieldCounts || {};
  const postWriteCandidateCount = Number(afterSummary.repairDryRun?.candidateCount || 0);
  const postWriteFieldCount = Number(afterSummary.repairDryRun?.totalFieldCount || 0);

  return sendJson(res, 200, {
    ok: true,
    schema: "footballscience-squad-status-repair-execution-v1",
    generatedAt: new Date().toISOString(),
    dryRun: false,
    writes: true,
    executed: true,
    targetKey: PLAYER_PROFILES_KEY,
    fieldsOnly: [...PLAYER_PROFILE_REPAIR_FIELDS],
    repairedCandidateCount: application.candidateCount,
    repairedFieldCounts: application.fieldCounts,
    repairedTotalFieldCount: application.totalFieldCount,
    before: {
      revision: preWriteSummary.current.revision,
      valueSha256: preWriteSummary.current.valueSha256,
      planSha256: preWriteSummary.repairDryRun.planSha256,
      dryRunSha256: preWriteSummary.dryRunSha256,
      backupSha256: preWriteSummary.latestBackup.pointerContentSha256,
    },
    after: {
      revision: Number.isInteger(Number(afterEntry?.revision)) ? Number(afterEntry.revision) : 0,
      valueSha256: afterValue ? hashText(afterValue) : "",
    },
    preWriteSnapshot: snapshot,
    postWriteAudit: {
      candidateCount: postWriteCandidateCount,
      fieldCounts: {
        status: Number(afterFieldCounts.status || 0),
        squadStatus: Number(afterFieldCounts.squadStatus || 0),
      },
      totalFieldCount: postWriteFieldCount,
      cleared: postWriteCandidateCount === 0 && postWriteFieldCount === 0,
      dryRunSha256: afterSummary.dryRunSha256,
    },
    rollbackPlan: {
      available: true,
      snapshotPath: snapshot.path,
      snapshotPathSha256: snapshot.pathSha256,
      snapshotContentSha256: snapshot.contentSha256,
      restoreKey: PLAYER_PROFILES_KEY,
      restoreRequiresSeparateApproval: true,
      rawBackupExposed: false,
    },
  });
}

function getAuthorizationHeader(req) {
  return req.headers?.authorization || req.headers?.Authorization || "";
}

async function authorizeBackupRequest(req) {
  const authorization = getAuthorizationHeader(req);
  const cronSecret = String(process.env.CRON_SECRET || "").trim();

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    const organizationId = String(process.env[BACKUP_ORGANIZATION_ENV] || "").trim();
    if (!organizationId) {
      return {
        ok: false,
        status: 503,
        reason: `${BACKUP_ORGANIZATION_ENV} is required for tenant-scoped cron backups.`,
      };
    }
    return {
      ok: true,
      organizationId,
      actor: { id: "vercel-cron", role: "admin", email: "", organizationId },
    };
  }

  const actor = await getCurrentActor(authorization);
  if (!actor) {
    return { ok: false, status: 401, reason: "Admin sign-in or Vercel cron secret required." };
  }

  const identity = await resolvePlatformActorScope(actor);
  if (!identity.ok) {
    return identity;
  }
  const primaryMembership = identity.scope?.primary || null;
  const profile = identity.actor?.profile || null;
  const organizationId = String(
    primaryMembership?.organizationId || profile?.primaryOrganizationId || ""
  ).trim();
  const canonicalRole = String(identity.actor?.role || "guest").trim().toLowerCase();
  const actorStatus = String(identity.actor?.status || "").trim().toLowerCase();
  const profileStatus = String(profile?.status || "").trim().toLowerCase();
  const canonicalOrganization = primaryMembership?.organization ||
    findCanonicalTenantSummary(identity.scope?.organizations, organizationId);
  const canonicalClub = primaryMembership?.club ||
    findCanonicalTenantSummary(identity.scope?.clubs, primaryMembership?.clubId || profile?.primaryClubId);
  const canonicalTeam = primaryMembership?.team ||
    findCanonicalTenantSummary(identity.scope?.teams, primaryMembership?.teamId || profile?.primaryTeamId);
  if (!organizationId) {
    return { ok: false, status: 403, reason: "Canonical backup tenant scope is required." };
  }
  if (!isActiveCanonicalStatus(actorStatus) || !isActiveCanonicalStatus(profileStatus)) {
    return { ok: false, status: 403, reason: "This account is not active." };
  }
  if (!isActiveTenantSummary(canonicalOrganization)) {
    return { ok: false, status: 403, reason: "The canonical organization is not active." };
  }
  if (canonicalClub && !isActiveTenantSummary(canonicalClub)) {
    return { ok: false, status: 403, reason: "The canonical club is not active." };
  }
  if (canonicalTeam && !isActiveTenantSummary(canonicalTeam)) {
    return { ok: false, status: 403, reason: "The canonical team is not active." };
  }
  if (canonicalRole !== "admin") {
    return { ok: false, status: 403, reason: "Admin access required." };
  }

  return {
    ok: true,
    organizationId,
    actor: { ...actor, role: canonicalRole, organizationId },
  };
}

function isBackupStatusRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.pathname.endsWith("/app-state-backup-status") || url.searchParams.get("mode") === "status";
  } catch {
    return false;
  }
}

function isRestoreDrillRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.searchParams.get("mode") === "restore-drill";
  } catch {
    return false;
  }
}

function isSquadStatusAuditRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.searchParams.get("mode") === "squad-status-audit";
  } catch {
    return false;
  }
}

function isSquadStatusRepairDryRunRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.searchParams.get("mode") === "squad-status-repair-dry-run";
  } catch {
    return false;
  }
}

function isSquadStatusRepairExecuteRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.searchParams.get("mode") === "squad-status-repair-execute";
  } catch {
    return false;
  }
}

async function sendBackupStatus(res, organizationId) {
  const pointerResult = await readBackupObject(latestBackupPath(organizationId));
  if (!pointerResult.ok) {
    return sendJson(res, pointerResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: pointerResult.reason || "Latest app-state backup pointer is not available.",
    });
  }

  const pointer = pointerResult.payload || {};
  if (!isSafeBackupPath(pointer.path, organizationId)) {
    return sendJson(res, 409, { ok: false, reason: "Latest app-state backup pointer contains an invalid path." });
  }

  const backupResult = await readBackupObject(pointer.path);
  if (!backupResult.ok) {
    return sendJson(res, backupResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: backupResult.reason || "Latest app-state backup object is not available.",
    });
  }

  const summary = summarizeBackupStatus(pointer, backupResult.payload || {}, organizationId);
  if (!summary.backupMatchesPointer) {
    return sendJson(res, 409, {
      ok: false,
      reason: "Latest app-state backup pointer does not match the stored backup object.",
      ...summary,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    ...summary,
  });
}

async function sendBackupRestoreDrill(res, organizationId) {
  const pointerResult = await readBackupObject(latestBackupPath(organizationId));
  if (!pointerResult.ok) {
    return sendJson(res, pointerResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: pointerResult.reason || "Latest app-state backup pointer is not available.",
    });
  }

  const pointer = pointerResult.payload || {};
  if (!isSafeBackupPath(pointer.path, organizationId)) {
    return sendJson(res, 409, { ok: false, reason: "Latest app-state backup pointer contains an invalid path." });
  }

  const backupResult = await readBackupObject(pointer.path);
  if (!backupResult.ok) {
    return sendJson(res, backupResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: backupResult.reason || "Latest app-state backup object is not available.",
    });
  }

  const backup = backupResult.payload || {};
  const summary = summarizeBackupStatus(pointer, backup, organizationId);
  const restoreDrill = createRestoreDrillSummary(backup, summary);
  if (!restoreDrill.restorable) {
    return sendJson(res, 409, {
      ok: false,
      reason: "Latest app-state backup is not restore-ready.",
      latest: summary.latest,
      backup: summary.backup,
      manifestCoverage: summary.manifestCoverage,
      restoreDrill,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    latest: summary.latest,
    backup: summary.backup,
    manifestCoverage: summary.manifestCoverage,
    restoreDrill,
  });
}

async function sendSquadStatusAudit(res, organizationId) {
  const summary = await createSquadStatusAuditSummary(organizationId);
  return sendJson(res, 200, {
    ok: true,
    schema: "footballscience-squad-status-audit-v1",
    generatedAt: new Date().toISOString(),
    dryRun: true,
    writes: false,
    ...summary,
  });
}

async function sendSquadStatusRepairDryRun(res, organizationId) {
  const summary = await createSquadStatusRepairDryRunSummary(organizationId);
  return sendJson(res, 200, {
    ok: true,
    schema: "footballscience-squad-status-repair-dry-run-v1",
    generatedAt: new Date().toISOString(),
    dryRun: true,
    writes: false,
    ...summary,
  });
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const backupStatusRequest = isBackupStatusRequest(req);
  const restoreDrillRequest = isRestoreDrillRequest(req);
  const squadStatusAuditRequest = isSquadStatusAuditRequest(req);
  const squadStatusRepairDryRunRequest = isSquadStatusRepairDryRunRequest(req);
  const squadStatusRepairExecuteRequest = isSquadStatusRepairExecuteRequest(req);
  const readonlyMetadataRequest =
    backupStatusRequest || restoreDrillRequest || squadStatusAuditRequest || squadStatusRepairDryRunRequest;
  if (
    (readonlyMetadataRequest && req.method !== "GET") ||
    (squadStatusRepairExecuteRequest && req.method !== "POST") ||
    (!readonlyMetadataRequest && !squadStatusRepairExecuteRequest && req.method !== "GET" && req.method !== "POST")
  ) {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const authorization = await authorizeBackupRequest(req);
  if (!authorization.ok) {
    return sendJson(res, authorization.status, { ok: false, reason: authorization.reason });
  }

  const security = guardApiRequest(req, res, {
    route: backupStatusRequest ? "/api/app-state-backup-status" : "/api/app-state-backup",
    moduleId: "app-state",
    actor: authorization.actor,
    action: readonlyMetadataRequest || squadStatusRepairExecuteRequest ? "restore" : "export",
  });
  if (!security.ok) {
    return;
  }
  const organizationId = authorization.organizationId;

  try {
    if (backupStatusRequest) {
      return sendBackupStatus(res, organizationId);
    }

    if (restoreDrillRequest) {
      return sendBackupRestoreDrill(res, organizationId);
    }

    if (squadStatusAuditRequest) {
      return sendSquadStatusAudit(res, organizationId);
    }

    if (squadStatusRepairDryRunRequest) {
      return sendSquadStatusRepairDryRun(res, organizationId);
    }

    if (squadStatusRepairExecuteRequest) {
      return sendSquadStatusRepairExecute(req, res, authorization.actor, organizationId);
    }

    const bucket = await ensureStateBucket();
    if (!bucket.ok) {
      return sendJson(res, 500, { ok: false, reason: bucket.reason || "Central app-state bucket is not available." });
    }

    const backupSource = await collectCentralStateBackupEntries(organizationId);
    const envelope = createBackupEnvelope({ actor: authorization.actor, organizationId, ...backupSource });
    const timestamp = envelope.createdAt.replace(/[:.]/g, "-");
    const day = envelope.createdAt.slice(0, 10);
    const backupPath = `${tenantBackupPrefix(organizationId)}/${day}/${timestamp}-${envelope.contentSha256.slice(0, 12)}.json`;
    const latestPath = latestBackupPath(organizationId);

    const backupResult = await writeBackupObject(backupPath, envelope, false);
    if (!backupResult.ok) {
      return sendJson(res, 500, { ok: false, reason: backupResult.reason || "App-state backup could not be written." });
    }

    const latest = {
      schema: "footballscience-app-state-backup-pointer-v1",
      organizationId,
      createdAt: envelope.createdAt,
      path: backupPath,
      entryCount: envelope.entryCount,
      contentSha256: envelope.contentSha256,
    };
    const latestResult = await writeBackupObject(latestPath, latest, true);
    if (!latestResult.ok) {
      return sendJson(res, 500, { ok: false, reason: latestResult.reason || "Latest backup pointer could not be written." });
    }

    return sendJson(res, 200, {
      ok: true,
      createdAt: envelope.createdAt,
      path: backupPath,
      latestPath,
      entryCount: envelope.entryCount,
      contentSha256: envelope.contentSha256,
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, reason: error?.message || "App-state backup failed." });
  }
};
