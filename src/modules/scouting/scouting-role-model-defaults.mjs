const excludedDefaultMetrics = new Set(["age", "minutes", "matches", "matches-played"]);

const metricPreferencesByRole = Object.freeze({
  GK: ["save-rate", "prevented-goals-per-90", "exits-per-90", "accurate-long-passes"],
  CB: ["defensive-duels-won", "aerial-duels-won", "interceptions-per-90", "progressive-passes-per-90"],
  FB: ["progressive-runs-per-90", "accurate-crosses", "defensive-duels-won", "progressive-passes-per-90"],
  CM: ["progressive-passes-per-90", "passes-to-final-third-per-90", "key-passes-per-90", "defensive-duels-won"],
  AM: ["xa-per-90", "key-passes-per-90", "progressive-passes-per-90", "touches-in-box-per-90"],
  W: ["successful-dribbles", "progressive-runs-per-90", "xa-per-90", "touches-in-box-per-90"],
  ST: ["xg-per-90", "goals-per-90", "shots-per-90", "touches-in-box-per-90"],
});

function normalizeRole(value = "") {
  const role = String(value ?? "").trim().toUpperCase();
  if (role === "GK") return "GK";
  if (["CB", "LCB", "RCB"].includes(role)) return "CB";
  if (["LB", "RB", "LWB", "RWB", "WB"].includes(role)) return "FB";
  if (["6", "8", "DM", "DMF", "CM", "CMF", "LCMF", "RCMF"].includes(role)) return "CM";
  if (["10", "AM", "AMF", "LAMF", "RAMF"].includes(role)) return "AM";
  if (["LW", "RW", "LWF", "RWF", "W"].includes(role)) return "W";
  if (["ST", "CF", "FW", "F"].includes(role)) return "ST";
  return "";
}

export function resolveScoutingRoleModelDefaults(metricOptions = [], role = "") {
  const metrics = Array.isArray(metricOptions) ? metricOptions : [];
  const metricsById = new Map(metrics.map((metric) => [String(metric?.id || ""), metric]));
  const preferredIds = metricPreferencesByRole[normalizeRole(role)] || [];

  return preferredIds
    .map((metricId) => metricsById.get(metricId))
    .filter((metric) => metric && !excludedDefaultMetrics.has(String(metric.id || "")))
    .slice(0, 4)
    .map((metric) => ({
      metricId: String(metric.id),
      direction: String(metric.direction || "").toLowerCase() === "lower" ? "lower" : "higher",
      minPercentile: 70,
      weight: 3,
    }));
}
