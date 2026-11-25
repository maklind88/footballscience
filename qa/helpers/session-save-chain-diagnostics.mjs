// Record timings on one monotonic clock. The operation id is an in-memory
// correlation key only and is never returned in evidence.
export function createSessionSaveChainTiming(now = () => performance.now()) {
  const records = new Map();
  function mark(operation, stage) {
    if (!operation) throw new Error("Missing Sessions QA timing correlation");
    const record = records.get(operation) || {};
    record[stage] ??= now();
    records.set(operation, record);
  }
  function duration(record, start) {
    const from = record[start], to = record.visible;
    return Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.round(to - from) : null;
  }
  return {
    markCommit: (operation) => mark(operation, "commit"),
    markAcknowledged: (operation) => mark(operation, "acknowledged"),
    markVisible: (operation) => mark(operation, "visible"),
    summary() {
      return Array.from(records.values(), (record) => ({
        commitToIndependentViewMs: duration(record, "commit"),
        acknowledgementToIndependentViewMs: duration(record, "acknowledged"),
        committed: record.commit !== undefined,
        acknowledged: record.acknowledged !== undefined,
        independentlyVisible: record.visible !== undefined,
      }));
    },
  };
}

// Like Schedule QA diagnostics, release only bounded operational values from
// the browser. Never send journal rows, paths, work values or owner identifiers.
export async function readSessionSaveChainDiagnostics(page) {
  return page.evaluate(async () => {
    const bridge = window.footballScienceCentralState;
    const actor = window.platformAuthStore?.getCurrentUser?.();
    const key = "football-session-planner-v3";
    const unknown = (journal = "unavailable") => ({
      journal, pendingCount: null, oldestPendingAgeMs: null, unmeasurablePendingCount: null, reviewCounts: null,
    });
    if (!actor?.id || !bridge?.getReadScope?.() || !bridge?.canAutoSyncKey?.(key)) return unknown("not-authorized");
    const scope = JSON.stringify(["sessions-actor-team-v1", actor.id, actor.clubId || "", actor.teamId || ""]);
    const readScope = bridge.getReadScope();
    const result = {
      journal: "read", pendingCount: 0, oldestPendingAgeMs: null, unmeasurablePendingCount: 0,
      reviewCounts: { centralConflict: 0, earlierVersion: 0, unknown: 0 },
    };
    function count(row, now) {
      if (row?.scope !== scope) return;
      if (row.status === "pending") {
        result.pendingCount++;
        // Journal order is Date.now() * 1000 + sequence. Old test/legacy rows
        // may already be epoch milliseconds. Clock skew is reported as unknown.
        const timestamp = row.createdAt;
        const created = timestamp > 100_000_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
        if (!Number.isSafeInteger(timestamp) || created <= 0 || created > now) result.unmeasurablePendingCount++;
        else result.oldestPendingAgeMs = Math.max(result.oldestPendingAgeMs ?? 0, now - created);
      } else if (row.status === "review") {
        const conflicts = Array.isArray(row.conflicts) ? row.conflicts : [];
        if (conflicts.includes("An earlier local version needs review.")) result.reviewCounts.earlierVersion++;
        else if (conflicts.some((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}\./.test(item))) result.reviewCounts.centralConflict++;
        else result.reviewCounts.unknown++;
      }
    }
    let opening;
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        opening = indexedDB.open("football-science-data-safety-v1");
        opening.onupgradeneeded = () => opening.transaction.abort();
        opening.onerror = () => reject(new Error("Journal unavailable"));
        opening.onsuccess = () => resolve(opening.result);
      });
      const now = Date.now();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("latest", "readonly");
        const cursor = tx.objectStore("latest").openCursor(IDBKeyRange.bound("session-save:", "session-save:\uffff"));
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(new Error("Journal unavailable"));
        cursor.onsuccess = () => {
          const next = cursor.result;
          if (next) { count(next.value, now); next.continue(); }
        };
      });
      return bridge.getReadScope() === readScope ? result : unknown("scope-changed");
    } catch { return unknown(); }
    finally { db?.close(); }
  });
}

export async function attachSessionSaveChainEvidence(testInfo, { timing, page }) {
  const evidence = {
    ...(timing ? { timings: timing.summary() } : {}),
    ...(page ? { journal: await readSessionSaveChainDiagnostics(page) } : {}),
  };
  await testInfo.attach("Sessions save chain metrics", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
  });
  return evidence;
}
