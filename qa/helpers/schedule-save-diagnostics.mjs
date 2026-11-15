export async function readScheduleSaveDiagnostics(page, key, expectedText) {
  return page.evaluate(({ key, expectedText }) => {
    const errorCategory = value => {
      const message = String(value || "");
      if (!message) return "none";
      if (/quota/i.test(message)) return "quota";
      if (/metadata could not be (saved|verified)/i.test(message)) return "metadata";
      if (/read.only/i.test(message)) return "read-only";
      if (/sign.in|session|authenticated/i.test(message)) return "authentication";
      if (/central sync is not ready/i.test(message)) return "not-ready";
      if (/newer|stale|conflict/i.test(message)) return "conflict";
      return "other";
    };
    const bridge = window.footballScienceCentralState;
    const status = bridge?.getStatus?.() || {};
    const view = bridge?.getCachedValueInfo?.(key) || {};
    let manifest = {}, localValue = "", storageError = "";
    try {
      localValue = window.localStorage.getItem(key) || "";
      manifest = JSON.parse(window.localStorage.getItem("football-data-safety-v1") || "{}");
    } catch (error) {
      storageError = errorCategory(error.name);
    }
    const entry = manifest.entries?.[key] || {};
    const readScope = bridge?.getReadScope?.() || "";
    // Only operational fields: never return state values, account scope, or tokens.
    return {
      localContains: localValue.includes(expectedText),
      localSize: localValue.length,
      storageError,
      hydrated: Boolean(status.hydrated),
      hydrating: Boolean(status.hydrating),
      hasReadScope: Boolean(readScope),
      hydrationGuard: Boolean(window.__footballScienceCentralHydrating),
      reloadGuard: Boolean(window.__footballScienceCentralReloading),
      viewSource: ["central-readonly-baseline", "central-acknowledgement", "central-pending-baseline", "local-write"].includes(view.source) ? view.source : "other",
      viewCanEdit: typeof view.canEdit === "boolean" ? view.canEdit : null,
      pending: Boolean(entry.pendingCentralSync),
      pendingOwnerMatches: entry.principalScope ? entry.principalScope === readScope : null,
      prepared: Boolean(entry.localWritePrepared),
      serverRevision: Number(entry.serverRevision) || 0,
      lastError: errorCategory(manifest.lastError),
      centralError: errorCategory(status.lastError),
      lastWriteError: errorCategory(status.lastWriteError),
      saveIssues: (Array.isArray(manifest.localSaveIssues) ? manifest.localSaveIssues : [])
        .filter(issue => issue?.key === key).slice(0, 5).map(issue => errorCategory(issue.message)),
      feedback: (() => {
        const text = document.querySelector("#schedulePlannerFeedbackPortal")?.textContent || "";
        return { rejected: text.includes("Not saved to team"), saved: text.includes("Saved to team"), saving: text.includes("Saving") };
      })(),
    };
  }, { key, expectedText });
}
