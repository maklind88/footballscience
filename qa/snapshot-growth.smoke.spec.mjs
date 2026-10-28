import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// Characterization, not a disk/quota benchmark: real IndexedDB, synthetic data,
// production envelope/dedup/pruning code, and explicitly captured snapshot calls.
for (const libraryKiB of [128, 1024]) {
  test(`snapshot growth with an unchanged ${libraryKiB} KiB library and tiny edits`, async ({ page }, testInfo) => {
    await page.goto("/medical-merge.js");
    const result = await page.evaluate(async libraryKiB => {
      const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
      const libraryKey = "football-session-exercise-library-v1", scheduleKey = "football-schedule-v1";
      const library = JSON.stringify({ exercises: [{ id: "synthetic", diagram: "x".repeat(libraryKiB * 1024) }] });
      const schedule = n => JSON.stringify({ syntheticRevision: String(n).padStart(2, "0") });
      localStorage.setItem(libraryKey, library);
      localStorage.setItem(scheduleKey, schedule(0));
      const databaseName = `qa-snapshot-growth-${crypto.randomUUID()}`;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onupgradeneeded = () => {
          for (const store of ["snapshots", "latest", "offline-operations-v1"]) request.result.createObjectStore(store, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const protectedRows = {
        snapshots: [{ id: "football-session-planner-v3-quota-fallback-synthetic", value: "retained recovery", principalScope: "other-owner" }],
        latest: [{ id: "session-save:synthetic-review", status: "review", value: "retained conflict" }],
        "offline-operations-v1": [{ id: "synthetic-operation", status: "pending", value: "retained offline edit" }],
      };
      await new Promise((resolve, reject) => {
        const tx = database.transaction(Object.keys(protectedRows), "readwrite");
        for (const [name, rows] of Object.entries(protectedRows)) for (const row of rows) tx.objectStore(name).put(row);
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      let queuedWrites = 0, timer = 0;
      // Control only scheduling so automatic startup timers cannot contaminate phases.
      const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid" },
        setTimeout: () => ++timer, clearTimeout() {}, addEventListener() {} };
      const service = createDataSafetyRuntimeService({ win, documentRef: document, navigatorRef: {}, storageConstructor: Storage,
        snapshotDatabaseName: databaseName, protectedStorageKeys: [libraryKey, scheduleKey],
        getCentralStateBridge: () => ({ getReadScope: () => "synthetic-owner", getStatus: () => ({}) }),
        queueCentralStateWrite: () => { queuedWrites++; return true; },
      });
      service.install();
      const bytes = row => new Blob([JSON.stringify(row)]).size;
      const dump = name => new Promise((resolve, reject) => {
        const request = database.transaction(name, "readonly").objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const measure = async phase => {
        const history = (await dump("snapshots")).filter(row => row.schema);
        const latest = (await dump("latest")).find(row => row.id === "latest");
        return { phase, historyRows: history.length, historyJsonUtf8Bytes: history.reduce((sum, row) => sum + bytes(row), 0),
          latestJsonUtf8Bytes: latest ? bytes(latest) : 0,
          libraryPayloadCopies: history.filter(row => row.storage?.[libraryKey] === library).length + Number(latest?.storage?.[libraryKey] === library) };
      };
      const measurements = [], successes = [];
      successes.push(await service.saveSnapshot("baseline"));
      measurements.push(await measure("baseline"));
      for (let n = 0; n < 12; n++) successes.push(await service.saveSnapshot("unchanged"));
      measurements.push(await measure("unchanged-12"));
      // Same payload but new recovery context is deliberately not an identical backup.
      service.recordWrite(scheduleKey, schedule(0), { requirePersisted: true });
      successes.push(await service.saveSnapshot("new-pending-generation"));
      measurements.push(await measure("same-payload-new-generation"));
      let lastCommittedEdit = 0;
      for (let n = 1; n <= 36; n++) {
        localStorage.setItem(scheduleKey, schedule(n));
        const committed = await service.saveSnapshot("tiny-edit");
        successes.push(committed);
        if (committed) lastCommittedEdit = n;
        if ([1, 10, 30, 36].includes(n)) measurements.push(await measure(`edit-${n}`));
      }
      const retained = {};
      for (const [name, rows] of Object.entries(protectedRows)) {
        const current = await dump(name);
        retained[name] = rows.every(row => JSON.stringify(current.find(candidate => candidate.id === row.id)) === JSON.stringify(row));
      }
      const latest = (await dump("latest")).find(row => row.id === "latest");
      const output = { libraryKiB, libraryJsonUtf8Bytes: new Blob([library]).size, changedPayloadUtf8Bytes: new Blob([schedule(36)]).size,
        measurements, allSnapshotsCommitted: successes.every(Boolean), retained, queuedWrites,
        originalLibraryUnchanged: localStorage.getItem(libraryKey) === library,
        latestSnapshotMatchesLastCommitted: latest.storage[scheduleKey] === schedule(lastCommittedEdit),
        latestPrimaryEditPresent: localStorage.getItem(scheduleKey) === schedule(36),
        primaryPending: service.readManifest().entries[scheduleKey]?.pendingCentralSync === true,
        snapshotWarning: service.readSnapshotDiagnostics().lastSnapshotError,
        pendingGenerationRetained: latest.saveContext.entries[scheduleKey]?.pendingCentralSync === true,
        metric: "Serialized JSON UTF-8 bytes; not browser physical usage or localStorage quota." };
      (await service.openSnapshotDatabase()).close(); database.close();
      return output;
    }, libraryKiB);
    const reportPath = testInfo.outputPath("snapshot-growth.json");
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    await testInfo.attach("snapshot-growth.json", { path: reportPath, contentType: "application/json" });
    // The baseline evidence file records the old unbounded-by-bytes behavior.
    // Current containment refuses copies once protected generations fill the budget.
    expect(result.allSnapshotsCommitted).toBe(false);
    expect(result.snapshotWarning).toContain("this snapshot was not saved");
    expect(result.latestPrimaryEditPresent).toBe(true);
    expect(result.primaryPending).toBe(true);
    expect(result.originalLibraryUnchanged).toBe(true);
    expect(result.latestSnapshotMatchesLastCommitted).toBe(true);
    expect(result.pendingGenerationRetained).toBe(true);
    expect(Object.values(result.retained)).toEqual([true, true, true]);
    expect(result.queuedWrites).toBe(37);
    const [baseline, unchanged, newGeneration] = result.measurements;
    expect(unchanged.historyRows).toBe(baseline.historyRows);
    expect(unchanged.historyJsonUtf8Bytes).toBe(baseline.historyJsonUtf8Bytes);
    expect(unchanged.latestJsonUtf8Bytes).toBe(baseline.latestJsonUtf8Bytes);
    expect(newGeneration.historyRows).toBeGreaterThan(baseline.historyRows);
    expect(result.measurements.at(-1).historyRows).toBeLessThanOrEqual(30);
  });
}
