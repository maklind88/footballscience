import { expect } from "@playwright/test";

// Synthetic central-sync fixtures need an acknowledged, normalized baseline
// before injecting a lost receipt. A read no longer performs this write for them.
export async function saveMedicalFixtureBaseline(page, key) {
  await expect.poll(() => page.evaluate(key => {
    const bridge = window.footballScienceCentralState;
    const info = bridge.getCachedValueInfo(key);
    return !bridge.getStatus().hydrating && bridge.canAutoSyncKey(key) &&
      ((info.serverBacked && info.canEdit) || info.source === "local-write");
  }, key)).toBe(true);
  await page.evaluate(async () => {
    const medical = await import("/src/modules/medical/medical-runtime-accessors.mjs");
    medical.ensureMedicalState();
    medical.writeMedicalState();
  });
}
