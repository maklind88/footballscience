export const key = "football-medical-team-v1";
export const draft = { players: [{ id: "synthetic", name: "Synthetic Player" }],
  records: [{ id: "r1", playerId: "synthetic", date: "2026-10-09", participation: 50, comment: "Rescue exact draft" }], injuryPlans: [] };
export async function install(page, options = {}) {
  await page.evaluate(async options => {
    const { createMedicalDraftStore } = await import("/src/modules/medical/medical-draft-store.mjs");
    const { createMedicalDraftRecovery } = await import("/src/modules/medical/medical-draft-recovery.mjs");
    window.__scope = options.scope ?? "owner-team-a"; window.__canEdit = true; window.__issues = [];
    window.footballScienceCentralState = { getReadScope: () => window.__scope, canAutoSyncKey: () => window.__canEdit,
      isKeyHydrated: () => true, getStatus: () => ({ metadata: { "football-medical-team-v1": { revision: 7 } } }) };
    window.footballScienceDataSafety = { reportSaveIssue: (_, message) => window.__issues.push(message) };
    window.__store = createMedicalDraftStore({ indexedDB, ...options });
    window.__recovery = createMedicalDraftRecovery({ win: window, canEdit: () => window.__canEdit, store: window.__store });
    const host = document.createElement("section"); host.id = "recovery"; document.body.append(host);
    window.__recovery.mount(host);
  }, options);
}
export const retain = (page, value = draft) => page.evaluate(value => window.__recovery.retain(JSON.stringify(value), '{"records":[]}'), value);
export const list = page => page.evaluate(async () => Promise.all((await window.__store.list(window.__scope)).map(row => window.__store.read(window.__scope, row.id))));
