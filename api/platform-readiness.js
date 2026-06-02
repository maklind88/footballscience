const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const packageJson = require("../package.json");

const healthTimeoutMs = Number(process.env.PLATFORM_HEALTH_TIMEOUT_MS || 2500);

function readinessStatus(status) {
  return ["pass", "warning", "missing"].includes(status) ? status : "warning";
}

function requestOrigin(req) {
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "footballscience.xyz";
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), healthTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function collectVercelLiveSignal() {
  const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  const envName = String(process.env.VERCEL_ENV || "local");
  return {
    status: envName === "production" ? "pass" : "warning",
    details: `${envName} runtime${commit ? ` at ${commit}` : ""}.`,
    checkedAt: new Date().toISOString(),
  };
}

async function collectBackupLiveSignal(req) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!cronSecret) {
    return null;
  }
  try {
    const statusUrl = new URL("/api/app-state-backup-status", requestOrigin(req));
    const result = await fetchJsonWithTimeout(statusUrl, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const latest = result.payload?.latest || {};
    const backupOk = result.ok && result.payload?.ok === true && result.payload?.backupMatchesPointer === true;
    const ageMinutes = Number.isFinite(Number(latest.ageMs)) ? Math.round(Number(latest.ageMs) / 60000) : null;
    return {
      status: backupOk ? "pass" : readinessStatus(result.ok ? "warning" : "missing"),
      details: backupOk ? `Latest backup is ${ageMinutes} minutes old.` : result.payload?.reason || `Backup status failed (${result.status}).`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "warning",
      details: error?.name === "AbortError" ? "Backup status timed out." : "Backup status could not be read.",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function collectGithubLiveSignal() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || "").trim();
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || "").trim();
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (!token || !owner || !repo || !sha) {
    return null;
  }
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}/check-runs?per_page=50`;
    const result = await fetchJsonWithTimeout(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "footballscience-platform-health",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const runs = Array.isArray(result.payload?.check_runs) ? result.payload.check_runs : [];
    const failed = runs.filter((run) => ["failure", "timed_out", "cancelled", "action_required"].includes(run.conclusion));
    const pending = runs.filter((run) => run.status !== "completed");
    return {
      status: !result.ok ? "warning" : failed.length ? "missing" : pending.length || !runs.length ? "warning" : "pass",
      details: !result.ok ? `GitHub checks failed (${result.status}).` : `${runs.length} check(s), ${failed.length} failed, ${pending.length} pending.`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "warning",
      details: error?.name === "AbortError" ? "GitHub checks timed out." : "GitHub checks could not be read.",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function collectPlatformLiveSignals(req) {
  const signals = {
    "vercel-production": collectVercelLiveSignal(),
  };
  const [backup, github] = await Promise.all([collectBackupLiveSignal(req), collectGithubLiveSignal()]);
  if (backup) {
    signals["backup-freshness"] = backup;
  }
  if (github) {
    signals["github-checks"] = github;
  }
  return signals;
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/platform-readiness",
    moduleId: "platform-readiness",
    action: "observe",
    actor,
  });
  if (!security.ok) {
    return;
  }

  if (actor.role !== "admin") {
    return sendJson(res, 403, { ok: false, reason: "Platform admin access required." });
  }

  try {
    const { createPlatformReadinessReport } = await import("../src/core/platform-readiness-contracts.mjs");
    const liveSignals = await collectPlatformLiveSignals(req);
    const report = createPlatformReadinessReport({
      env: process.env,
      scripts: packageJson.scripts || {},
      liveSignals,
    });

    return sendJson(res, 200, {
      ok: true,
      report,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      reason: error?.message || "Platform readiness could not be loaded.",
    });
  }
};
