export const scoutingRoleCategoryProfiles = Object.freeze([
  { id: "role-goalkeeper", group: "GK", label: "Målvakt" },
  { id: "role-centre-back", group: "CB", label: "Mittback" },
  { id: "role-fullback", group: "FB", label: "Ytterback" },
  { id: "role-centre-midfielder", group: "MID", label: "Central mittfältare" },
  { id: "role-wing", group: "WING", label: "Winge (yttermittfältare)" },
  { id: "role-forward", group: "CF", label: "Anfallare" },
]);
export const scoutingRoleCategoryById = Object.freeze(
  scoutingRoleCategoryProfiles.reduce((acc, item) => {
    acc[item.id] = item.group;
    return acc;
  }, {})
);
export const scoutingRoleScoringProfiles = Object.freeze({
  GK: {
    label: "Goalkeeper",
    minMinutes: 420,
    axes: [
      { metricId: "exits-per-90", weight: 1.15, direction: "higher" },
      { metricId: "aerial-duels-per-90", weight: 1.12, direction: "higher" },
      { metricId: "aerial-duels-won", weight: 1.2, direction: "higher" },
      { metricId: "accurate-passes", weight: 0.96, direction: "higher" },
      { metricId: "average-pass-length-m", weight: 0.9, direction: "lower" },
    ],
  },
  CB: {
    label: "Centre-back",
    minMinutes: 540,
    axes: [
      { metricId: "aerial-duels-per-90", weight: 1.14, direction: "higher" },
      { metricId: "aerial-duels-won", weight: 1.2, direction: "higher" },
      { metricId: "defensive-duels-won", weight: 1.08, direction: "higher" },
      { metricId: "passes-per-90", weight: 0.9, direction: "higher" },
      { metricId: "accurate-passes", weight: 1.02, direction: "higher" },
      { metricId: "passes-to-final-third-per-90", weight: 1.06, direction: "higher" },
      { metricId: "interceptions-per-90", weight: 1.04, direction: "higher" },
      { metricId: "average-pass-length-m", weight: 0.78, direction: "lower" },
      { metricId: "padj-interceptions", weight: 1.06, direction: "higher" },
    ],
  },
  FB: {
    label: "Fullback",
    minMinutes: 450,
    axes: [
      { metricId: "progressive-runs-per-90", weight: 1.16, direction: "higher" },
      { metricId: "crosses-per-90", weight: 1.12, direction: "higher" },
      { metricId: "successful-defensive-actions-per-90", weight: 1.02, direction: "higher" },
      { metricId: "successful-attacking-actions-per-90", weight: 0.98, direction: "higher" },
      { metricId: "accelerations-per-90", weight: 1.05, direction: "higher" },
      { metricId: "received-passes-per-90", weight: 0.84, direction: "higher" },
    ],
  },
  MID: {
    label: "Central midfielder",
    minMinutes: 540,
    axes: [
      { metricId: "passes-per-90", weight: 1.06, direction: "higher" },
      { metricId: "progressive-passes-per-90", weight: 1.16, direction: "higher" },
      { metricId: "received-passes-per-90", weight: 1.02, direction: "higher" },
      { metricId: "accurate-passes", weight: 1.04, direction: "higher" },
      { metricId: "through-passes-per-90", weight: 1.12, direction: "higher" },
      { metricId: "xa-per-90", weight: 1.08, direction: "higher" },
      { metricId: "short-medium-passes-per-90", weight: 0.98, direction: "higher" },
      { metricId: "passes-to-final-third-per-90", weight: 1.06, direction: "higher" },
      { metricId: "smart-passes-per-90", weight: 1.01, direction: "higher" },
      { metricId: "average-pass-length-m", weight: 0.9, direction: "lower" },
    ],
  },
  WING: {
    label: "Winger",
    minMinutes: 450,
    axes: [
      { metricId: "progressive-runs-per-90", weight: 1.12, direction: "higher" },
      { metricId: "dribbles-per-90", weight: 1.18, direction: "higher" },
      { metricId: "successful-dribbles", weight: 1.12, direction: "higher" },
      { metricId: "accelerations-per-90", weight: 1.08, direction: "higher" },
      { metricId: "crosses-per-90", weight: 1.03, direction: "higher" },
      { metricId: "received-passes-per-90", weight: 1.02, direction: "higher" },
      { metricId: "xa-per-90", weight: 1.01, direction: "higher" },
    ],
  },
  CF: {
    label: "Forward",
    minMinutes: 540,
    axes: [
      { metricId: "received-long-passes-per-90", weight: 1.18, direction: "higher" },
      { metricId: "received-passes-per-90", weight: 1.02, direction: "higher" },
      { metricId: "head-goals-per-90", weight: 1.2, direction: "higher" },
      { metricId: "shots-per-90", weight: 1.08, direction: "higher" },
      { metricId: "xg-per-90", weight: 1.01, direction: "higher" },
      { metricId: "back-passes-per-90", weight: 0.82, direction: "higher" },
      { metricId: "touches-in-box-per-90", weight: 1.14, direction: "higher" },
      { metricId: "key-passes-per-90", weight: 1.06, direction: "higher" },
      { metricId: "xa-per-90", weight: 1.04, direction: "higher" },
      { metricId: "dribbles-per-90", weight: 1.02, direction: "higher" },
    ],
  },
  OTHER: {
    label: "General",
    minMinutes: 360,
    axes: [
      { metricId: "passes-per-90", weight: 1.0, direction: "higher" },
      { metricId: "accurate-passes", weight: 0.95, direction: "higher" },
      { metricId: "progressive-runs-per-90", weight: 1.0, direction: "higher" },
      { metricId: "xa-per-90", weight: 0.92, direction: "higher" },
    ],
  },
});
