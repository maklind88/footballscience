// Browser-response-only prerequisite for the run-owned Medical player. Never
// persist a Squad change or alter unrelated rows. This is a synthetic fixture,
// not evidence of Squad persistence or a fully unmodified data-read pipeline.
export function addMedicalAcceptanceRoster(payload, { run, player }) {
  const key = "football-player-profiles-v1";
  if (!run || !player?.id?.startsWith(run + "-")) throw new Error("Synthetic Medical roster ownership required");
  if (!Object.hasOwn(payload.entries || {}, key) && !payload.absentKeys?.includes(key)) return payload;
  let state;
  try { state = payload.entries?.[key] ? JSON.parse(payload.entries[key]) : {}; }
  catch { throw new Error("Medical acceptance roster prerequisite is unreadable"); }
  if (!state || Array.isArray(state) || typeof state !== "object" || (state.players && !Array.isArray(state.players))) {
    throw new Error("Medical acceptance roster prerequisite is invalid");
  }
  if (state.players?.some(row => row.id === player.id)) throw new Error("Synthetic Medical roster identity collision");
  return { ...payload, entries: { ...payload.entries, [key]: JSON.stringify({ ...state,
    rosterVersion: state.rosterVersion || "synthetic-medical-acceptance", players: [...(state.players || []), player] }) },
    metadata: { ...payload.metadata, [key]: payload.metadata?.[key] || { revision: 0 } },
    absentKeys: (payload.absentKeys || []).filter(name => name !== key) };
}
