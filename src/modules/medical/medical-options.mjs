export const medicalParticipationOptions = [0, 10, 25, 50, 75, 100];

export const medicalStatusOptions = [
  { key: "full", label: "Full Training", tone: "full", defaultParticipation: 100 },
  { key: "modified", label: "Modified Training", tone: "modified", defaultParticipation: 75 },
  { key: "controlled", label: "Controlled Load", tone: "controlled", defaultParticipation: 50 },
  { key: "rehab", label: "Rehab / Individual", tone: "rehab", defaultParticipation: 25 },
  { key: "unavailable", label: "Unavailable", tone: "unavailable", defaultParticipation: 0 },
  { key: "monitor", label: "Monitor", tone: "monitor", defaultParticipation: 100 },
];

export const medicalStatusActivityLabels = {
  training: {
    full: "Full Training",
    modified: "Modified Training",
    controlled: "Controlled Training",
    rehab: "Rehab / Individual",
    unavailable: "Unavailable",
    monitor: "Monitor",
  },
  match: {
    full: "Match Available",
    modified: "Modified Match",
    controlled: "Controlled Match",
    rehab: "Match Restricted",
    unavailable: "Unavailable",
    monitor: "Match Available",
  },
};

export const medicalStatusActivityTones = {
  match: {
    monitor: "full",
  },
};

export const medicalInjuryPlanStatusOptions = medicalStatusOptions;

export const medicalRtpPhaseOptions = [
  { key: "medical-restriction", label: "Medical restriction", status: "unavailable", participation: 0 },
  { key: "rehab", label: "Rehab", status: "rehab", participation: 25 },
  { key: "modified-team", label: "Modified team", status: "modified", participation: 75 },
  { key: "full-training", label: "Full training", status: "full", participation: 100 },
  { key: "match-available", label: "Match available", status: "monitor", participation: 100 },
];

export const medicalClearanceRoles = [
  { key: "doctor", label: "Doctor" },
  { key: "physio", label: "Physio" },
  { key: "performance", label: "Performance" },
];

export const medicalGateOptions = [
  { key: "pending", label: "Pending" },
  { key: "pass", label: "Pass" },
  { key: "monitor", label: "Monitor" },
  { key: "fail", label: "Fail" },
];

export const medicalLoadGateOptions = [
  { key: "strength", label: "Strength" },
  { key: "gpsLoad", label: "GPS / load" },
  { key: "painResponse", label: "Pain response" },
  { key: "wellness", label: "Wellness" },
  { key: "psychologicalReadiness", label: "Psychological readiness" },
];

export const medicalInjuryDurationPresets = [
  { label: "2w", duration: 2, unit: "weeks" },
  { label: "4w", duration: 4, unit: "weeks" },
  { label: "8w", duration: 8, unit: "weeks" },
  { label: "3m", duration: 3, unit: "months" },
  { label: "6m", duration: 6, unit: "months" },
  { label: "9m", duration: 9, unit: "months" },
];

export const medicalActualParticipationFallback = "not-logged";
export const medicalWindowLength = 7;
export const medicalDefaultRosterVersion = "ncc-2026-roster-v1";

export const medicalOperationsTabOptions = [
  { key: "overview", label: "Overview" },
  { key: "availability", label: "Availability" },
  { key: "signals", label: "Risk Signals" },
  { key: "cases", label: "Active Cases" },
  { key: "history", label: "History" },
  { key: "season", label: "Season" },
];

export const medicalPlayerModalTabOptions = [
  { key: "availability", label: "Availability" },
  { key: "profile", label: "Medical Profile" },
  { key: "plan", label: "Medical Plan" },
];

export const medicalDataSafetySyncStatusOptions = new Set(["idle", "pending", "stored", "legacy", "duplicate", "failed"]);

export const medicalPositionOrder = {
  Goalkeeper: 1,
  Defender: 2,
  Midfielder: 3,
  Forward: 4,
};

export const medicalPositionAliases = {
  Goalkeeper: ["goalkeeper", "goalie", "keeper", "gk", "goal", "malvakt", "mv"],
  Defender: [
    "defender",
    "defence",
    "defense",
    "def",
    "d",
    "df",
    "back",
    "fullback",
    "wingback",
    "centerback",
    "centreback",
    "cb",
    "lcb",
    "rcb",
    "lb",
    "rb",
    "lwb",
    "rwb",
  ],
  Midfielder: ["midfielder", "midfield", "mid", "m", "mf", "cm", "cdm", "dm", "am", "cam", "pivot", "6", "8", "10"],
  Forward: [
    "forward",
    "forwards",
    "for",
    "f",
    "fw",
    "fwd",
    "attacker",
    "attack",
    "striker",
    "st",
    "cf",
    "winger",
    "wing",
    "w",
    "lw",
    "rw",
    "9",
    "anfall",
    "anfallare",
  ],
};
