export const sessionPlannerHistoryActionLabels = {
  "session.created": "Created",
  "session.updated": "Updated",
  "session.blocks_added": "Blocks added",
  "session.blocks_reduced": "Blocks reduced",
  "session.removed": "Removed",
  "session.restored": "Restored",
};

export function formatSessionPlannerHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getSessionPlannerHistoryActorLabel(entry = {}) {
  return entry.actor?.name || entry.actor?.email || "Staff";
}

export function getSessionPlannerHistoryActionLabel(action = "") {
  return sessionPlannerHistoryActionLabels[action] || "Updated";
}
