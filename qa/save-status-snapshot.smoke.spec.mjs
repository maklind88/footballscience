import { test, expect } from "@playwright/test";

for (const timing of ["before", "during"]) {
  test(`a completed cache snapshot cannot acknowledge a Medical save failure reported ${timing} the snapshot`, async ({ page }) => {
    await page.goto("/medical-merge.js");
    const result = await page.evaluate(async timing => {
      const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
      const key = "football-medical-team-v1", retained = JSON.stringify({ records: [{ id: "synthetic", comment: "Earlier saved version" }] });
      localStorage.setItem(key, retained);
      const element = document.createElement("div"); document.body.append(element);
      let writes = 0;
      const service = createDataSafetyRuntimeService({ win: window, documentRef: document, navigatorRef: {},
        storageConstructor: Storage, protectedStorageKeys: [key], ui: { dataSafetyStatus: element },
        getCentralStateBridge: () => ({ getStatus: () => ({ lastSyncedAt: "2026-10-08T12:00:00Z" }) }),
        queueCentralStateWrite: () => { writes++; return true; },
      });
      service.install();
      const message = "Medical saving is not confirmed. Keep this page open.";
      const report = () => window.footballScienceDataSafety.reportSaveIssue(key, message);
      if (timing === "before") report();
      const snapshot = service.saveSnapshot("qa-cache-only");
      if (timing === "during") report();
      const saved = await snapshot;
      service.refreshStatus();
      return { saved, memoryError: service.status.lastError, persistedError: service.readManifest().lastError,
        text: element.textContent, title: element.title, claimsBackedUp: element.classList.contains("is-backed-up"),
        rawUnchanged: localStorage.getItem(key) === retained, writes, message };
    }, timing);
    expect(result.saved).toBe(true);
    expect(result.memoryError).toBe(result.message);
    expect(result.persistedError).toBe(result.message);
    expect(result.text).toBe("Autosave needs attention");
    expect(result.title).toBe(result.message);
    expect(result.claimsBackedUp).toBe(false);
    expect(result.rawUnchanged).toBe(true);
    expect(result.writes).toBe(0);
  });
}

test("a successful snapshot clears only its own snapshot warning", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const key = "football-medical-team-v1", element = document.createElement("div");
    const service = createDataSafetyRuntimeService({ win: window, documentRef: document, navigatorRef: {}, storageConstructor: Storage,
      protectedStorageKeys: [key], ui: { dataSafetyStatus: element } });
    service.install();
    service.status.lastSnapshotError = "Earlier snapshot failure";
    service.mutateManifest(manifest => { manifest.lastSnapshotError = "Earlier snapshot failure"; });
    const saved = await service.saveSnapshot("qa-cache-retry"); service.refreshStatus();
    return { saved, snapshotError: service.status.lastSnapshotError, persistedSnapshotError: service.readManifest().lastSnapshotError,
      saveError: service.status.lastError, title: element.title };
  });
  expect(result).toMatchObject({ saved: true, snapshotError: "", persistedSnapshotError: "", saveError: "" });
  expect(result.title).not.toContain("Earlier snapshot failure");
});
