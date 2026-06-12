export const playerProfileRoleOptions = ["GK", "LB", "CB", "RB", "LWB", "RWB", "6", "8", "10", "LW", "RW", "ST"];

export const squadFormationOptions = [
  {
    key: "4-3-3",
    label: "4-3-3",
    slots: ["GK", "LB", "CB", "CB", "RB", "6", "8", "8", "LW", "ST", "RW"],
  },
  {
    key: "4-2-3-1",
    label: "4-2-3-1",
    slots: ["GK", "LB", "CB", "CB", "RB", "6", "8", "LW", "10", "RW", "ST"],
  },
  {
    key: "3-4-3",
    label: "3-4-3",
    slots: ["GK", "CB", "CB", "CB", "LWB", "6", "8", "RWB", "LW", "ST", "RW"],
  },
  {
    key: "3-5-2",
    label: "3-5-2",
    slots: ["GK", "CB", "CB", "CB", "LWB", "6", "8", "10", "RWB", "ST", "ST"],
  },
  {
    key: "4-4-2",
    label: "4-4-2",
    slots: ["GK", "LB", "CB", "CB", "RB", "LW", "6", "8", "RW", "ST", "ST"],
  },
];

export const playerRoleDnaDefinitions = {
  GK: {
    label: "Distribution goalkeeper",
    profile: "Box command, secure build-up and decision quality under pressure.",
    traits: ["Box command", "Distribution", "Decision security"],
    weights: { technical: 0.28, tactical: 0.24, physical: 0.12, mental: 0.36 },
  },
  LB: {
    label: "Two-way fullback",
    profile: "Wide defending, overlap timing and secure progression on the left side.",
    traits: ["1v1 defending", "Overlap timing", "Wide progression"],
    weights: { technical: 0.26, tactical: 0.28, physical: 0.3, mental: 0.16 },
  },
  CB: {
    label: "Central defender",
    profile: "Defensive control, aerial presence and first-pass responsibility.",
    traits: ["Duel security", "Line control", "First pass"],
    weights: { technical: 0.2, tactical: 0.36, physical: 0.28, mental: 0.16 },
  },
  RB: {
    label: "Two-way fullback",
    profile: "Wide defending, overlap timing and secure progression on the right side.",
    traits: ["1v1 defending", "Overlap timing", "Wide progression"],
    weights: { technical: 0.26, tactical: 0.28, physical: 0.3, mental: 0.16 },
  },
  LWB: {
    label: "Attacking wingback",
    profile: "High wide running, crossing/cutback value and recovery capacity.",
    traits: ["Repeated runs", "Crossing value", "Recovery speed"],
    weights: { technical: 0.28, tactical: 0.22, physical: 0.36, mental: 0.14 },
  },
  RWB: {
    label: "Attacking wingback",
    profile: "High wide running, crossing/cutback value and recovery capacity.",
    traits: ["Repeated runs", "Crossing value", "Recovery speed"],
    weights: { technical: 0.28, tactical: 0.22, physical: 0.36, mental: 0.14 },
  },
  6: {
    label: "Controlling 6",
    profile: "Screening, scanning, tempo control and press resistance in central build-up.",
    traits: ["Scanning", "Tempo control", "Screening"],
    weights: { technical: 0.28, tactical: 0.38, physical: 0.12, mental: 0.22 },
  },
  8: {
    label: "Box-to-box 8",
    profile: "Connection play, pressing range and two-way involvement across midfield.",
    traits: ["Connection play", "Press range", "Third-player timing"],
    weights: { technical: 0.28, tactical: 0.3, physical: 0.24, mental: 0.18 },
  },
  10: {
    label: "Creative 10",
    profile: "Chance creation, final-third scanning and decision making between lines.",
    traits: ["Chance creation", "Between-line receiving", "Final pass"],
    weights: { technical: 0.36, tactical: 0.28, physical: 0.1, mental: 0.26 },
  },
  LW: {
    label: "Wide attacker",
    profile: "1v1 threat, final-third timing and left-side attacking output.",
    traits: ["1v1 threat", "Box entry", "Final action"],
    weights: { technical: 0.38, tactical: 0.18, physical: 0.28, mental: 0.16 },
  },
  RW: {
    label: "Wide attacker",
    profile: "1v1 threat, final-third timing and right-side attacking output.",
    traits: ["1v1 threat", "Box entry", "Final action"],
    weights: { technical: 0.38, tactical: 0.18, physical: 0.28, mental: 0.16 },
  },
  ST: {
    label: "Centre forward",
    profile: "Box presence, pressing trigger, finishing actions and central occupation.",
    traits: ["Box presence", "Press trigger", "Finishing actions"],
    weights: { technical: 0.3, tactical: 0.2, physical: 0.28, mental: 0.22 },
  },
};

export const playerProfilePreferredSideOptions = [
  { key: "left", label: "Left" },
  { key: "center", label: "Center" },
  { key: "right", label: "Right" },
];

export const playerProfileRoleGroupOptions = [
  { key: "goalkeeper", label: "Goalkeeper" },
  { key: "defender", label: "Defender" },
  { key: "midfielder", label: "Midfielder" },
  { key: "forward", label: "Forward" },
];

export const playerProfileStatusOptions = [
  { key: "available", label: "Available", tone: "available" },
  { key: "injured", label: "Injured", tone: "injured" },
  { key: "managed", label: "Managed load", tone: "managed" },
  { key: "rehab", label: "Rehab", tone: "rehab" },
  { key: "unavailable", label: "Unavailable", tone: "unavailable" },
  { key: "national-team", label: "International duty", tone: "national-team" },
  { key: "vacation", label: "Vacation", tone: "vacation" },
  { key: "personal", label: "Personal leave", tone: "personal" },
  { key: "suspended", label: "Suspended", tone: "suspended" },
  { key: "loan", label: "Loan / external", tone: "loan" },
];

export const playerProfileSquadStatusOptions = [
  { key: "important", label: "Important" },
  { key: "rotation", label: "Rotation" },
  { key: "depth", label: "Squad depth" },
  { key: "development", label: "Development" },
  { key: "loan", label: "Loan watch" },
];

export const playerProfileRosterTypeOptions = [
  { key: "squad", label: "Squad player", shortLabel: "Squad", countsInSquad: true },
  { key: "academy", label: "Academy training", shortLabel: "Academy", countsInSquad: false },
  { key: "trialist", label: "Trialist", shortLabel: "Trial", countsInSquad: false },
  { key: "guest", label: "Guest player", shortLabel: "Guest", countsInSquad: false },
  { key: "loan", label: "Loan / external", shortLabel: "Loan", countsInSquad: false },
];

export const playerProfileRosterTypeAliases = Object.freeze({
  trial: "trialist",
  "trial-player": "trialist",
  trialist: "trialist",
  academy: "academy",
  "academy-player": "academy",
  "academy-training": "academy",
  callup: "academy",
  "call-up": "academy",
  temporary: "guest",
  temp: "guest",
  "training-guest": "guest",
  trainingguest: "guest",
  guest: "guest",
  "guest-player": "guest",
  inactive: "guest",
  "inactive-guest": "guest",
  external: "loan",
  "external-player": "loan",
  loan: "loan",
  "loan-external": "loan",
  "loan-watch": "loan",
});

export const playerProfileRosterFilterOptions = [{ key: "all", label: "All roster" }, ...playerProfileRosterTypeOptions];

export const playerProfileCareerPhaseOptions = [
  { key: "developing", label: "Developing" },
  { key: "emerging", label: "Emerging" },
  { key: "peak", label: "Peak" },
  { key: "experienced", label: "Experienced" },
];

export const playerProfileIdpStatusOptions = [
  { key: "active", label: "Active IDP" },
  { key: "review", label: "Review due" },
  { key: "monitor", label: "Monitor" },
  { key: "none", label: "No IDP" },
];

export const playerProfileAttributeGroups = [
  { key: "technical", label: "Technical" },
  { key: "tactical", label: "Tactical" },
  { key: "physical", label: "Physical" },
  { key: "mental", label: "Mental" },
];

export const playerProfileTabOptions = [
  { key: "overview", label: "Overview" },
  { key: "roles", label: "Roles" },
  { key: "idp", label: "IDP" },
  { key: "medical", label: "Medical" },
  { key: "performance", label: "Performance" },
  { key: "notes", label: "Notes" },
  { key: "history", label: "History" },
];

export const playerProfileChangeFieldDefinitions = [
  { key: "name", label: "Name" },
  { key: "number", label: "Number" },
  { key: "birthDate", label: "Birth date" },
  { key: "position", label: "Position" },
  { key: "status", label: "Availability status", options: playerProfileStatusOptions },
  { key: "squadStatus", label: "Squad status", options: playerProfileSquadStatusOptions },
  { key: "careerPhase", label: "Career phase", options: playerProfileCareerPhaseOptions },
  { key: "rosterType", label: "Roster type", options: playerProfileRosterTypeOptions },
  { key: "temporaryGroup", label: "Temporary group" },
  { key: "temporaryFrom", label: "Temporary from" },
  { key: "temporaryTo", label: "Temporary to" },
  { key: "primaryRole", label: "Primary role" },
  { key: "secondaryRoles", label: "Secondary roles", type: "array" },
  { key: "preferredSide", label: "Preferred side", options: playerProfilePreferredSideOptions },
  { key: "roleGroup", label: "Role group", options: playerProfileRoleGroupOptions },
  { key: "idp.status", label: "IDP status", options: playerProfileIdpStatusOptions },
  { key: "idp.primaryFocus", label: "IDP focus" },
  { key: "idp.nextAction", label: "IDP next action" },
  { key: "idp.reviewDate", label: "IDP review date" },
  { key: "coachNotes", label: "Coach notes" },
  { key: "futureData.performanceNotes", label: "Performance notes" },
  { key: "futureData.scoutingNotes", label: "Scouting notes" },
  { key: "futureData.analysisNotes", label: "Analysis notes" },
  { key: "attributeRatings.technical", label: "Technical rating" },
  { key: "attributeRatings.tactical", label: "Tactical rating" },
  { key: "attributeRatings.physical", label: "Physical rating" },
  { key: "attributeRatings.mental", label: "Mental rating" },
];
