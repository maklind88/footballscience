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

function githubRepoFromEnv() {
  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || "").trim();
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || "").trim();
  const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (owner && repo) {
    return { owner, repo, fullName: `${owner}/${repo}` };
  }
  if (repository.includes("/")) {
    const [repoOwner, repoName] = repository.split("/", 2);
    return { owner: repoOwner, repo: repoName, fullName: repository };
  }
  return null;
}

function githubHeaders() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "footballscience-platform-health",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function formatAge(timestamp) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) {
    return "unknown age";
  }
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function statusFromWorkflowRun(run, { staleAfterHours = 24 } = {}) {
  if (!run) {
    return "warning";
  }
  if (run.status !== "completed") {
    return "warning";
  }
  if (["failure", "timed_out", "cancelled", "action_required"].includes(run.conclusion)) {
    return "missing";
  }
  const completedAt = Date.parse(run.updated_at || run.run_started_at || "");
  if (Number.isFinite(completedAt) && Date.now() - completedAt > staleAfterHours * 60 * 60 * 1000) {
    return "warning";
  }
  return run.conclusion === "success" ? "pass" : "warning";
}

async function collectGithubWorkflowRunSignals() {
  const repo = githubRepoFromEnv();
  if (!repo) {
    return {};
  }
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/actions/runs?per_page=50&branch=main`;
    const result = await fetchJsonWithTimeout(url, { headers: githubHeaders() });
    if (!result.ok) {
      return {
        "production-deploy-run": {
          status: "warning",
          details: `GitHub workflow runs failed (${result.status}).`,
          checkedAt: new Date().toISOString(),
        },
        "production-monitor-run": {
          status: "warning",
          details: `GitHub workflow runs failed (${result.status}).`,
          checkedAt: new Date().toISOString(),
        },
      };
    }
    const runs = Array.isArray(result.payload?.workflow_runs) ? result.payload.workflow_runs : [];
    const findRun = (name) => runs.find((run) => run.name === name) || null;
    const deploy = findRun("Production Deploy");
    const monitor = findRun("Production Monitor");
    return {
      "production-deploy-run": {
        status: statusFromWorkflowRun(deploy, { staleAfterHours: 168 }),
        details: deploy
          ? `${deploy.conclusion || deploy.status} ${formatAge(deploy.updated_at || deploy.run_started_at)}.`
          : "No Production Deploy run found on main.",
        checkedAt: new Date().toISOString(),
      },
      "production-monitor-run": {
        status: statusFromWorkflowRun(monitor, { staleAfterHours: 8 }),
        details: monitor
          ? `${monitor.conclusion || monitor.status} ${formatAge(monitor.updated_at || monitor.run_started_at)}.`
          : "No Production Monitor run found on main.",
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      "production-deploy-run": {
        status: "warning",
        details: error?.name === "AbortError" ? "GitHub deploy run lookup timed out." : "GitHub deploy run could not be read.",
        checkedAt: new Date().toISOString(),
      },
      "production-monitor-run": {
        status: "warning",
        details: error?.name === "AbortError" ? "GitHub monitor run lookup timed out." : "GitHub monitor run could not be read.",
        checkedAt: new Date().toISOString(),
      },
    };
  }
}

async function collectGithubIncidentSignal() {
  const repo = githubRepoFromEnv();
  if (!repo) {
    return null;
  }
  try {
    const query = new URLSearchParams({
      q: `repo:${repo.fullName} is:issue is:open label:production-incident`,
      per_page: "1",
    });
    const result = await fetchJsonWithTimeout(`https://api.github.com/search/issues?${query}`, {
      headers: githubHeaders(),
    });
    if (!result.ok) {
      return {
        status: "warning",
        details: `Production incident lookup failed (${result.status}).`,
        checkedAt: new Date().toISOString(),
      };
    }
    const openCount = Number(result.payload?.total_count || 0);
    return {
      status: openCount > 0 ? "missing" : "pass",
      details: openCount > 0 ? `${openCount} open production incident issue(s).` : "No open production incident issues.",
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "warning",
      details: error?.name === "AbortError" ? "Production incident lookup timed out." : "Production incidents could not be read.",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function collectAuthHealthLiveSignal(req) {
  try {
    const result = await fetchJsonWithTimeout(new URL("/api/auth-health", requestOrigin(req)));
    const ms = result.payload?.ms;
    return {
      status: result.ok && result.payload?.ok === true ? "pass" : "missing",
      details:
        result.ok && result.payload?.ok === true
          ? `Supabase Auth reachable${Number.isFinite(Number(ms)) ? ` in ${Math.round(Number(ms))}ms` : ""}.`
          : result.payload?.reason || `Auth health failed (${result.status}).`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "warning",
      details: error?.name === "AbortError" ? "Auth health timed out." : "Auth health could not be read.",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function collectFirewallLiveSignal() {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return null;
  }
  try {
    const { readFirewallConfig, validateVercelFirewallConfig } = await import("../../scripts/verify-vercel-firewall-drift.mjs");
    const config = await readFirewallConfig();
    const failures = validateVercelFirewallConfig(config);
    return {
      status: failures.length ? "missing" : "pass",
      details: failures.length ? failures.slice(0, 2).join(" ") : "Vercel Firewall matches traffic-safety contract.",
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "warning",
      details: error?.message ? `Firewall drift could not be verified: ${error.message}` : "Firewall drift could not be verified.",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function collectPlatformLiveSignals(req) {
  const signals = {
    "vercel-production": collectVercelLiveSignal(),
  };
  const [backup, github, workflows, incidents, authHealth, firewall] = await Promise.all([
    collectBackupLiveSignal(req),
    collectGithubLiveSignal(),
    collectGithubWorkflowRunSignals(),
    collectGithubIncidentSignal(),
    collectAuthHealthLiveSignal(req),
    collectFirewallLiveSignal(),
  ]);
  if (backup) {
    signals["backup-freshness"] = backup;
  }
  if (github) {
    signals["github-checks"] = github;
  }
  Object.assign(signals, workflows);
  if (incidents) {
    signals["incident-alerts"] = incidents;
  }
  if (authHealth) {
    signals["auth-health"] = authHealth;
  }
  if (firewall) {
    signals["traffic-firewall"] = firewall;
  }
  return signals;
}

module.exports = {
  collectPlatformLiveSignals,
  fetchJsonWithTimeout,
  githubRepoFromEnv,
  requestOrigin,
};
