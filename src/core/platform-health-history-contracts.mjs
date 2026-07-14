export const PLATFORM_HEALTH_HISTORY_SCHEMA = "footballscience-platform-health-history-v1";
export const platformHealthHistoryRetentionDays = 90;

export const platformHealthHistoryStatuses = Object.freeze({
  pass: "pass",
  warning: "warning",
  missing: "missing",
});

const releaseSignalIds = new Set([
  "production-runtime",
  "last-production-deploy",
  "production-monitor",
  "backup-restore",
  "auth-health",
  "traffic-firewall",
  "open-incidents",
  "live-qa",
  "staging-mirror",
]);

function normalizeStatus(status) {
  return Object.values(platformHealthHistoryStatuses).includes(status)
    ? status
    : platformHealthHistoryStatuses.warning;
}

function normalizeId(value, fallback = "unknown") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function clampText(value, maxLength = 500) {
  return String(value || "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:gho|ghp|github_pat|vercel|sbp)_[A-Za-z0-9_=-]{12,}\b/g, "[redacted-token]")
    .replace(/\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@/g, "[redacted-credentials]@")
    .trim()
    .slice(0, maxLength);
}

function normalizeEvidence(evidence = []) {
  const list = Array.isArray(evidence) ? evidence : [evidence];
  return Object.freeze(
    list
      .map((entry) => clampText(entry, 220))
      .filter(Boolean)
      .slice(0, 8)
  );
}

function severityForStatus(status) {
  const normalized = normalizeStatus(status);
  if (normalized === platformHealthHistoryStatuses.missing) {
    return "error";
  }
  if (normalized === platformHealthHistoryStatuses.warning) {
    return "warning";
  }
  return "info";
}

function normalizeSignal(item = {}, options = {}) {
  const status = normalizeStatus(item.status);
  return Object.freeze({
    id: normalizeId(item.id || item.signalId),
    label: clampText(item.label || item.signalLabel || item.id || "Health signal", 140),
    group: normalizeId(item.group || item.signalGroup || "platform"),
    owner: clampText(item.owner || options.owner || "System / Security / Release", 140),
    status,
    severity: severityForStatus(status),
    source: clampText(item.source || options.source || "production-monitor", 120),
    details: clampText(item.details || "", 1000),
    nextStep: clampText(item.nextStep || item.next_step || "", 700),
    checkedAt: clampText(item.checkedAt || item.checked_at || options.observedAt || "", 40),
    evidence: normalizeEvidence(item.evidence),
  });
}

function summarizeSignals(signals = []) {
  const list = Array.isArray(signals) ? signals : [];
  return Object.freeze({
    total: list.length,
    ready: list.filter((item) => normalizeStatus(item.status) === platformHealthHistoryStatuses.pass).length,
    warning: list.filter((item) => normalizeStatus(item.status) === platformHealthHistoryStatuses.warning).length,
    missing: list.filter((item) => normalizeStatus(item.status) === platformHealthHistoryStatuses.missing).length,
  });
}

export function createPlatformHealthSnapshot(report = {}, options = {}) {
  const observedAt = clampText(options.observedAt || new Date().toISOString(), 40);
  const snapshotId = clampText(options.snapshotId || "", 80);
  const source = clampText(options.source || "production-monitor", 120);
  const environment = normalizeId(options.environment || "unknown");
  const releaseSha = clampText(options.releaseSha || options.commitSha || "", 40).toLowerCase();
  const rawSignals = Array.isArray(report.healthCockpit) ? report.healthCockpit : [];
  const signals = Object.freeze(rawSignals.map((item) => normalizeSignal(item, { observedAt, source })).slice(0, 40));
  const summary = report.healthCockpitSummary || summarizeSignals(signals);

  return Object.freeze({
    schema: PLATFORM_HEALTH_HISTORY_SCHEMA,
    snapshotId,
    source,
    environment,
    releaseSha,
    observedAt,
    retentionDays: platformHealthHistoryRetentionDays,
    summary: Object.freeze({
      total: Number(summary.total || signals.length),
      ready: Number(summary.ready || 0),
      warning: Number(summary.warning || 0),
      missing: Number(summary.missing || 0),
    }),
    signals,
  });
}

export function summarizePlatformHealthHistory(snapshots = []) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const latest = list[0] || null;
  const previous = list[1] || null;
  const latestMissing = Number(latest?.summary?.missing || 0);
  const previousMissing = Number(previous?.summary?.missing || 0);
  const latestWarning = Number(latest?.summary?.warning || 0);
  const previousWarning = Number(previous?.summary?.warning || 0);

  return Object.freeze({
    snapshots: list.length,
    latestObservedAt: latest?.observedAt || latest?.observed_at || null,
    latestMissing,
    latestWarning,
    missingDelta: latestMissing - previousMissing,
    warningDelta: latestWarning - previousWarning,
    trend:
      !previous
        ? "baseline"
        : latestMissing > previousMissing || latestWarning > previousWarning
        ? "worse"
        : latestMissing < previousMissing || latestWarning < previousWarning
        ? "better"
        : "stable",
  });
}

export function createPlatformHealthHistoryFromRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const groups = new Map();
  for (const row of list) {
    const snapshotId = String(row?.snapshot_id || row?.snapshotId || "").trim();
    if (!snapshotId) {
      continue;
    }
    if (!groups.has(snapshotId)) {
      groups.set(snapshotId, {
        schema: PLATFORM_HEALTH_HISTORY_SCHEMA,
        snapshotId,
        source: clampText(row?.source || "production-monitor", 120),
        environment: clampText(row?.metadata?.environment || "unknown", 40),
        releaseSha: clampText(row?.metadata?.releaseSha || "", 40),
        observedAt: row?.observed_at || row?.observedAt || "",
        signals: [],
      });
    }
    const snapshot = groups.get(snapshotId);
    snapshot.signals.push(
      normalizeSignal({
        id: row?.signal_id,
        label: row?.signal_label,
        group: row?.signal_group,
        owner: row?.owner,
        status: row?.status,
        source: row?.source,
        details: row?.details,
        nextStep: row?.next_step,
        checkedAt: row?.observed_at,
        evidence: row?.evidence,
      })
    );
    if (!snapshot.observedAt || String(row?.observed_at || "") > String(snapshot.observedAt || "")) {
      snapshot.observedAt = row?.observed_at || snapshot.observedAt;
    }
  }

  return Object.freeze(
    [...groups.values()]
      .map((snapshot) =>
        Object.freeze({
          ...snapshot,
          summary: summarizeSignals(snapshot.signals),
          signals: Object.freeze(snapshot.signals),
        })
      )
      .sort((left, right) => String(right.observedAt || "").localeCompare(String(left.observedAt || "")))
  );
}

export function createPlatformHealthHistoryRows(snapshot = {}) {
  const observedAt = snapshot.observedAt || new Date().toISOString();
  const snapshotId = snapshot.snapshotId || "";
  const baseMetadata = {
    schema: snapshot.schema || PLATFORM_HEALTH_HISTORY_SCHEMA,
    summary: snapshot.summary || {},
    retentionDays: snapshot.retentionDays || platformHealthHistoryRetentionDays,
  };
  const signals = Array.isArray(snapshot.signals) ? snapshot.signals : [];
  const observabilitySignals = signals.map((signal) => ({
    snapshot_id: snapshotId,
    signal_id: normalizeId(signal.id),
    signal_group: normalizeId(signal.group || "platform"),
    signal_label: clampText(signal.label, 140),
    owner: clampText(signal.owner || "System / Security / Release", 140),
    status: normalizeStatus(signal.status),
    severity: signal.severity || severityForStatus(signal.status),
    source: clampText(signal.source || snapshot.source || "production-monitor", 120),
    details: clampText(signal.details, 1000),
    next_step: clampText(signal.nextStep || "", 700),
    evidence: [...normalizeEvidence(signal.evidence)],
    metadata: {
      ...baseMetadata,
      environment: snapshot.environment || "unknown",
      releaseSha: snapshot.releaseSha || null,
      checkedAt: signal.checkedAt || null,
    },
    observed_at: signal.checkedAt || observedAt,
  }));

  const releaseChecks = signals
    .filter((signal) => releaseSignalIds.has(normalizeId(signal.id)))
    .map((signal) => ({
      snapshot_id: snapshotId,
      release_sha: snapshot.releaseSha || null,
      environment: ["production", "preview", "development", "local"].includes(snapshot.environment)
        ? snapshot.environment
        : "unknown",
      check_id: normalizeId(signal.id),
      check_label: clampText(signal.label, 140),
      status: normalizeStatus(signal.status),
      source: clampText(signal.source || snapshot.source || "production-monitor", 120),
      details: clampText(signal.details, 1000),
      evidence: [...normalizeEvidence(signal.evidence)],
      metadata: baseMetadata,
      observed_at: signal.checkedAt || observedAt,
    }));

  return Object.freeze({
    observabilitySignals: Object.freeze(observabilitySignals),
    releaseChecks: Object.freeze(releaseChecks),
  });
}

export function assertPlatformHealthSnapshotContract(snapshot = {}) {
  const failures = [];
  if (snapshot.schema !== PLATFORM_HEALTH_HISTORY_SCHEMA) {
    failures.push("Snapshot schema is missing or invalid.");
  }
  if (!Array.isArray(snapshot.signals) || !snapshot.signals.length) {
    failures.push("Snapshot must include at least one health signal.");
  }
  for (const signal of snapshot.signals || []) {
    if (!signal.id || !signal.label || !signal.owner) {
      failures.push(`Signal ${signal.id || "unknown"} is missing identity.`);
    }
    if (!Object.values(platformHealthHistoryStatuses).includes(signal.status)) {
      failures.push(`Signal ${signal.id || "unknown"} has invalid status.`);
    }
    if (JSON.stringify(signal).match(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:gho|ghp|github_pat|vercel|sbp)_[A-Za-z0-9_=-]{12,}/)) {
      failures.push(`Signal ${signal.id || "unknown"} may expose a secret.`);
    }
  }
  if (failures.length) {
    throw new Error(`Platform health history contract failed: ${failures.join("; ")}`);
  }
  return true;
}
