const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");

const DEFAULT_HISTORY_LIMIT = 120;

function readServiceConfig(config = readConfig()) {
  if (!config?.url || !config?.serviceRoleKey) {
    return null;
  }
  return {
    restUrl: `${String(config.url).replace(/\/$/, "")}/rest/v1`,
    serviceRoleKey: config.serviceRoleKey,
  };
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    ...buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
    ...extra,
  };
}

async function parseSupabaseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function supabaseRestRequest(path, options = {}) {
  const config = readServiceConfig(options.config);
  if (!config) {
    return { ok: false, status: 503, reason: "Missing Supabase service configuration.", data: null };
  }
  const response = await fetch(`${config.restUrl}${path}`, {
    method: options.method || "GET",
    headers: serviceHeaders(config.serviceRoleKey, options.headers || {}),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await parseSupabaseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: data?.message || data?.hint || "Supabase request failed.",
      data,
    };
  }
  return { ok: true, status: response.status, data };
}

function limitNumber(value, fallback = DEFAULT_HISTORY_LIMIT) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(1, Math.min(500, Math.round(number)));
}

async function writePlatformHealthSnapshotRows(rows = {}, options = {}) {
  const observabilitySignals = Array.isArray(rows.observabilitySignals) ? rows.observabilitySignals : [];
  const releaseChecks = Array.isArray(rows.releaseChecks) ? rows.releaseChecks : [];
  if (!observabilitySignals.length) {
    return { ok: false, status: 400, reason: "Snapshot has no observability signals." };
  }

  const signalResult = await supabaseRestRequest("/platform_observability_signals", {
    ...options,
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: observabilitySignals,
  });
  if (!signalResult.ok) {
    return signalResult;
  }

  if (releaseChecks.length) {
    const releaseResult = await supabaseRestRequest("/platform_release_checks", {
      ...options,
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: releaseChecks,
    });
    if (!releaseResult.ok) {
      return releaseResult;
    }
  }

  return {
    ok: true,
    insertedSignals: observabilitySignals.length,
    insertedReleaseChecks: releaseChecks.length,
  };
}

async function readPlatformHealthHistory(options = {}) {
  const signalLimit = limitNumber(options.signalLimit || options.limit);
  const releaseLimit = limitNumber(options.releaseLimit || 60);
  const signalResult = await supabaseRestRequest(
    `/platform_observability_signals?select=snapshot_id,signal_id,signal_group,signal_label,owner,status,severity,source,details,next_step,evidence,metadata,observed_at,created_at&order=observed_at.desc&limit=${signalLimit}`,
    options
  );
  if (!signalResult.ok) {
    return signalResult;
  }

  const releaseResult = await supabaseRestRequest(
    `/platform_release_checks?select=snapshot_id,release_sha,environment,check_id,check_label,status,source,details,evidence,metadata,observed_at,created_at&order=observed_at.desc&limit=${releaseLimit}`,
    options
  );
  if (!releaseResult.ok) {
    return releaseResult;
  }

  return {
    ok: true,
    signals: Array.isArray(signalResult.data) ? signalResult.data : [],
    releaseChecks: Array.isArray(releaseResult.data) ? releaseResult.data : [],
  };
}

module.exports = {
  readPlatformHealthHistory,
  readServiceConfig,
  supabaseRestRequest,
  writePlatformHealthSnapshotRows,
};
