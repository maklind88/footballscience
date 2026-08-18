export const SET_PIECES_STORAGE_KEY = "football-set-pieces-room-v1";
export const SET_PIECES_ONBOARDING_KEY = "football-set-pieces-room-onboarding-v1";
export const SET_PIECES_SCHEMA_VERSION = 4;
export const SET_PIECES_MAX_PLAYS = 120;
export const SET_PIECES_MAX_VARIANTS = 16;
export const SET_PIECES_MAX_PHASES = 24;
export const SET_PIECES_HISTORY_LIMIT = 80;

export const setPieceRestartOptions = Object.freeze([
  { value: "corner", label: "Corner" },
  { value: "wide-free-kick", label: "Wide free kick" },
  { value: "central-free-kick", label: "Central free kick" },
  { value: "throw-in", label: "Throw-in" },
  { value: "kick-off", label: "Kick-off" },
  { value: "goal-kick", label: "Goal kick" },
  { value: "penalty", label: "Penalty" },
  { value: "restart", label: "Other restart" },
]);

export const setPieceMomentOptions = Object.freeze([
  { value: "attack", label: "Attacking" },
  { value: "defend", label: "Defending" },
  { value: "transition", label: "Second ball / transition" },
]);

export const setPieceSubPhaseOptions = Object.freeze([
  { value: "setup", label: "Set-up" },
  { value: "first-action", label: "Delivery / first action" },
  { value: "first-contact", label: "First contact" },
  { value: "second-ball", label: "Second ball" },
  { value: "transition", label: "Transition / rest defence" },
]);

export const setPieceContextOptions = Object.freeze([
  { value: "match", label: "Match" },
  { value: "training", label: "Training" },
  { value: "library", label: "Library" },
]);

export const setPiecePitchViewOptions = Object.freeze([
  { value: "full", label: "Full pitch" },
  { value: "attacking-half", label: "Attacking third" },
  { value: "defensive-half", label: "Defensive third" },
]);

export const setPieceToolOptions = Object.freeze([
  { value: "select", label: "Select", shortcut: "V", hint: "Click or drag to select, then move objects on the pitch" },
  { value: "home-player", label: "Squad players", shortcut: "P", hint: "Open the squad list to add or remove your players" },
  { value: "opponent", label: "Opponent", shortcut: "O", hint: "Click to place, then select to edit the number" },
  { value: "ball", label: "Ball", shortcut: "B", hint: "Click to place or reposition the match ball" },
  { value: "run", label: "Run", shortcut: "R", hint: "Drag from the runner toward the target position" },
  { value: "pass", label: "Pass", shortcut: "A", hint: "Drag from the ball or passer toward the receiver" },
  { value: "dribble", label: "Dribble", shortcut: "D", hint: "Drag from the carrier toward the end position" },
  { value: "block", label: "Block", shortcut: "K", hint: "Drag across the lane to show a screen or block" },
  { value: "press", label: "Press", shortcut: "E", hint: "Drag from the presser toward the pressure target" },
  { value: "mark", label: "Track", shortcut: "M", hint: "Drag from the marker toward the tracked movement" },
  { value: "zone", label: "Zone", shortcut: "Z", hint: "Drag a rectangle over the area to protect" },
]);

export const setPieceDrawingTypes = new Set([
  "run",
  "pass",
  "dribble",
  "block",
  "press",
  "mark",
  "zone",
]);

export const DEFAULT_SET_PIECE_ZONE_COLOR = "yellow";

export const setPieceZoneColorOptions = Object.freeze([
  { value: "yellow", label: "Yellow" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
  { value: "white", label: "White" },
]);

export const setPieceZoneColors = new Set(setPieceZoneColorOptions.map((option) => option.value));

export const setPieceLayerOptions = Object.freeze([
  { value: "home", label: "Own team" },
  { value: "opponent", label: "Opponent" },
  { value: "ball", label: "Ball" },
  { value: "drawings", label: "Movements" },
  { value: "labels", label: "Labels" },
]);

export const setPiecePlaybackSpeedOptions = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2]);

export const DEFAULT_PHASE_DURATION_MS = 1400;
export const DEFAULT_PHASE_HOLD_MS = 0;
export const DEFAULT_ACTION_DURATION_MS = DEFAULT_PHASE_DURATION_MS;
