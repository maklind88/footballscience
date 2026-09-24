// These are the server-owned inputs to the roster, availability and team header.
const squadReadKeys = [
  "football-player-profiles-v1",
  "football-medical-team-v1",
  "football-schedule-v1",
  "football-session-planner-v3",
  "football-periodization-v2",
  "football-platform-structure-v1",
  "football-workspace-hub-v3",
];

export function getSquadCentralReloadKey({ currentUser, metadata, now = new Date() } = {}) {
  if (!currentUser || !Number.isInteger(metadata?.[squadReadKeys[0]]?.revision)) return "";
  const versions = [];
  for (const key of squadReadKeys) {
    const entry = metadata[key];
    // Missing version evidence must never suppress a real update.
    if (entry && !Number.isInteger(entry.revision)) return "";
    versions.push(entry ? [entry.revision, entry.hash || "", entry.organizationId, entry.teamId] : null);
  }
  const day = [now.getFullYear(), now.getMonth(), now.getDate()];
  return JSON.stringify([currentUser, versions, day]);
}
