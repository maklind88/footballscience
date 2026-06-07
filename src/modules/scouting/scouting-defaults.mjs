export const scoutingTabs = [
  { id: "my-team", label: "My Team" },
  { id: "shadow-xi", label: "Shadow XI" },
  { id: "database", label: "Database" },
  { id: "lists", label: "Lists" },
  { id: "comparison", label: "Compare" },
  { id: "reports", label: "Reports" },
];

export const scoutingShadowSlots = [
  { id: "gk", label: "GK", position: "GK", x: 50, y: 88 },
  { id: "rb", label: "RB", position: "RB", x: 84, y: 68 },
  { id: "rcb", label: "RCB", position: "CB", x: 62, y: 72 },
  { id: "lcb", label: "LCB", position: "CB", x: 38, y: 72 },
  { id: "lb", label: "LB", position: "LB", x: 16, y: 68 },
  { id: "dmf", label: "DMF", position: "DMF", x: 50, y: 54 },
  { id: "rcmf", label: "RCMF", position: "CMF", x: 67, y: 42 },
  { id: "lcmf", label: "LCMF", position: "CMF", x: 33, y: 42 },
  { id: "rw", label: "RW", position: "W", x: 82, y: 22 },
  { id: "cf", label: "CF", position: "CF", x: 50, y: 15 },
  { id: "lw", label: "LW", position: "W", x: 18, y: 22 },
];

export const scoutingCoreMetricOptions = [
  { id: "minutes", key: "minutes", label: "Minutes", group: "Availability", direction: "higher" },
  { id: "matches", key: "matches", label: "Matches", group: "Availability", direction: "higher" },
  { id: "age", key: "age", label: "Age", group: "Profile", direction: "lower" },
];

export const scoutingStatusOptions = [
  { value: "new", label: "New" },
  { value: "monitoring", label: "Monitoring" },
  { value: "shortlist", label: "Shortlist" },
  { value: "archived", label: "Archived" },
];

export const scoutingPriorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const defaultScoutingState = {
  contactLog: [],
  savedViews: [],
  activeTab: "shadow-xi",
  databaseFilters: {
    query: "",
    league: "all",
    team: "all",
    season: "all",
    position: "all",
    minMinutes: 0,
    minMinutesIntentional: false,
    maxMinutes: "",
    minAge: "",
    maxAge: "",
    metricId: "all",
    metricIds: [],
    metricMin: "",
    roleProfileId: "all",
    benchmarkMode: "position",
    roleFitMin: "",
    roleFloorMin: "",
    signalMode: "all",
    marketStatus: "all",
    sortMetricId: "minutes",
  },
  targets: [],
  roleModels: [],
  favoriteRecordIds: [],
  compareRecordIds: [],
  playerSnapshots: {},
  lists: [{ id: "main-shortlist", name: "Main Shortlist", recordIds: [] }],
  shadowXi: {
    formation: "4-3-3",
    slots: {},
    selectedSlotId: "",
    positions: {},
    meta: {},
    activeBoardId: "default-shadow-xi",
    boards: [],
  },
  myTeam: {
    formation: "4-3-3",
    slots: {},
    positions: {},
  },
  selectedRecordId: "",
  reports: [],
  comparisonLab: {
    slotId: "",
    playerIds: ["", ""],
    metricId: "minutes",
  },
};
