export const sessionPlannerBlockMergeFields = Object.freeze([
  "label",
  "title",
  "focus",
  "phase",
  "subPhase",
  "minutes",
  "time",
  "intensity",
  "pitchSize",
  "material",
  "objective",
  "why",
  "organization",
  "principles",
  "diagram",
  "tacticalPitchMode",
  "tacticalFrames",
  "tacticalActiveFrameId",
  "playerBoardLayoutMode",
  "visualImage",
  "playerBoardPositions",
  "playerBoardColors",
  "playerBoardCustomPeople",
  "tacticalElements",
  "libraryExerciseId",
  "postSessionNotes",
]);

export const sessionPlannerBlockMergeFieldSet = new Set(sessionPlannerBlockMergeFields);
export const playerProfilesStorageKey = "football-player-profiles-v1";
export const playerProfileAgeCacheStorageKey = "football-player-profile-age-cache-v1";
export const dashboardNotificationSeenStorageKey = "football-dashboard-notification-seen-v1";
export const platformAppearanceStorageKey = "football-platform-appearance-v1";
export const medicalTeamStorageKey = "football-medical-team-v1";
export const scoutingStorageKey = "football-scouting-v1";
export const gameplanStorageKey = "football-gameplan-v1";
export const setPiecesRoomStorageKey = "football-set-pieces-room-v1";
export const transferRoomStorageKey = "football-transfer-room-v1";
export const sequenceStorageKey = "football-simulator-sequence-v1";
export const sequenceLibraryStorageKey = "football-simulator-sequence-library-v2";
export const dataSafetyStorageKey = "football-data-safety-v1";
export const dataSafetyExportSchema = "football-science-backup-v1";
export const dataSafetyDatabaseName = "football-science-data-safety-v1";
export const maxProfileImageUrlLength = 1800;
export const maxProfileImageUploadDataUrlLength = 900000;

export const defaultWorkspaceAccess = {
  chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  schedule: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"],
  gameplan: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  periodization: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  "session-planner": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  idp: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  "player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
  scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "transfer-room": ["admin", "team-admin"],
  "analysis-room": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "medical-team": ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
  staff: ["admin"],
  admin: ["admin"],
  "set-pieces-room": ["admin", "club-admin", "team-admin", "coach", "analyst"],
  "game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance"],
};

export const defaultWorkspaceEditAccess = {
  chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  schedule: ["admin", "club-admin", "team-admin", "coach"],
  gameplan: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  periodization: ["admin", "club-admin", "team-admin", "coach", "performance"],
  "session-planner": ["admin", "club-admin", "team-admin", "coach"],
  idp: ["admin", "club-admin", "team-admin", "coach", "analyst", "performance"],
  "player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout"],
  scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "transfer-room": ["admin", "team-admin"],
  "analysis-room": ["admin", "club-admin", "team-admin", "coach", "analyst"],
  "medical-team": ["admin", "club-admin", "team-admin", "medical", "performance"],
  staff: ["admin"],
  admin: ["admin"],
  "set-pieces-room": ["admin", "club-admin", "team-admin", "coach", "analyst"],
  "game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
};

export const requiredWorkspaceAccess = {
  "session-planner": {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "coach"],
  },
  "player-profiles": {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "coach", "scout"],
  },
  idp: {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "coach", "analyst", "performance"],
  },
  "medical-team": {
    view: ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "medical", "performance"],
  },
  scouting: {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
    edit: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  },
  "transfer-room": {
    view: ["admin", "team-admin"],
    edit: ["admin", "team-admin"],
  },
  "set-pieces-room": {
    view: ["admin", "club-admin", "team-admin", "coach", "analyst"],
    edit: ["admin", "club-admin", "team-admin", "coach", "analyst"],
  },
};

export const playerProfilesDefaultRosterVersion = "player-profiles-ncc-2026-v1";
export const playerProfilesSchemaVersion = 3;
export const playerProfileChangeLogLimit = 250;
export const platformDefaultClubId = "club-north-carolina-courage";
export const platformDefaultTeamId = "team-north-carolina-courage";
export const platformDefaultClubName = "North Carolina Courage";
export const platformDefaultClubShortName = "NCC";
export const platformDefaultTeamName = "North Carolina Courage";
export const platformDefaultTeamLevel = "First Team";
export const legacyPlatformStructureValues = new Set([
  "football science live",
  "club football science live",
  "team football science live",
  "football-science-live",
  "club-football-science-live",
  "team-football-science-live",
  "fsl",
]);
export const canonicalPlatformClubValues = new Set([
  "north carolina courage",
  "club north carolina courage",
  "club-north-carolina-courage",
  "ncc",
]);
export const canonicalPlatformTeamValues = new Set([
  "north carolina courage",
  "team north carolina courage",
  "team-north-carolina-courage",
  "first team",
  "ncc",
]);
