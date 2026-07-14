const crypto = require("node:crypto");
const { getCurrentActor, parseBearer, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { collectPlatformLiveSignals } = require("./_lib/platform-readiness-live-signals.js");
const {
  readPlatformHealthHistory,
  writePlatformHealthSnapshotRows,
} = require("./_lib/platform-health-history-store.js");
const packageJson = require("../package.json");

function safeEquals(left, right) {
  const leftValue = Buffer.from(String(left || ""), "utf8");
  const rightValue = Buffer.from(String(right || ""), "utf8");
  return leftValue.length === rightValue.length && crypto.timingSafeEqual(leftValue, rightValue);
}

function hasSnapshotWriteToken(req) {
  const token = parseBearer(req.headers?.authorization || req.headers?.Authorization);
  const candidates = [
    process.env.PLATFORM_HEALTH_SNAPSHOT_TOKEN,
    process.env.CRON_SECRET,
    process.env.APP_STATE_BACKUP_STATUS_TOKEN,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Boolean(token && candidates.some((candidate) => safeEquals(token, candidate)));
}

function systemActor() {
  return {
    id: "platform-health-monitor",
    role: "admin",
    email: "platform-health-monitor@footballscience.internal",
  };
}

function getRequestLimit(req) {
  try {
    const url = new URL(req.url || "/api/platform-health-history", "https://footballscience.local");
    return url.searchParams.get("limit") || "";
  } catch {
    return "";
  }
}

async function createCurrentSnapshot(req) {
  const { createPlatformReadinessReport } = await import("../src/core/platform-readiness-contracts.mjs");
  const {
    assertPlatformHealthSnapshotContract,
    createPlatformHealthSnapshot,
    createPlatformHealthHistoryRows,
  } = await import("../src/core/platform-health-history-contracts.mjs");
  const liveSignals = await collectPlatformLiveSignals(req);
  const report = createPlatformReadinessReport({
    env: process.env,
    scripts: packageJson.scripts || {},
    liveSignals,
  });
  const snapshot = createPlatformHealthSnapshot(report, {
    snapshotId: crypto.randomUUID(),
    source: "production-monitor",
    environment: process.env.VERCEL_ENV || "local",
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA || "",
  });
  assertPlatformHealthSnapshotContract(snapshot);
  return {
    report,
    snapshot,
    rows: createPlatformHealthHistoryRows(snapshot),
  };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method === "GET") {
    const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
    if (!actor) {
      return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
    }
    const security = guardApiRequest(req, res, {
      route: "/api/platform-health-history",
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

    const {
      createPlatformHealthHistoryFromRows,
      summarizePlatformHealthHistory,
    } = await import("../src/core/platform-health-history-contracts.mjs");
    const result = await readPlatformHealthHistory({ limit: getRequestLimit(req) });
    if (!result.ok) {
      return sendJson(res, result.status || 503, {
        ok: false,
        reason: result.reason || "Platform health history could not be read.",
      });
    }
    const snapshots = createPlatformHealthHistoryFromRows(result.signals);
    return sendJson(res, 200, {
      ok: true,
      history: {
        snapshots,
        releaseChecks: result.releaseChecks,
        summary: summarizePlatformHealthHistory(snapshots),
      },
    });
  }

  if (req.method === "POST") {
    if (!hasSnapshotWriteToken(req)) {
      return sendJson(res, 401, { ok: false, reason: "Platform health snapshot token required." });
    }
    const security = guardApiRequest(req, res, {
      route: "/api/platform-health-history",
      moduleId: "platform-readiness",
      action: "write",
      actor: systemActor(),
    });
    if (!security.ok) {
      return;
    }

    try {
      const { snapshot, rows } = await createCurrentSnapshot(req);
      const result = await writePlatformHealthSnapshotRows(rows);
      if (!result.ok) {
        return sendJson(res, result.status || 503, {
          ok: false,
          reason: result.reason || "Platform health snapshot could not be stored.",
        });
      }
      return sendJson(res, 201, {
        ok: true,
        snapshot: {
          schema: snapshot.schema,
          snapshotId: snapshot.snapshotId,
          observedAt: snapshot.observedAt,
          summary: snapshot.summary,
          insertedSignals: result.insertedSignals,
          insertedReleaseChecks: result.insertedReleaseChecks,
        },
      });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        reason: error?.message || "Platform health snapshot could not be created.",
      });
    }
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
};
