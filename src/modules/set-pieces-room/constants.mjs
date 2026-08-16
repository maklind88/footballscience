export const SET_PIECES_STORAGE_KEY = "football-set-pieces-room-v1";
export const SET_PIECES_SCHEMA_VERSION = 2;
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

export const setPieceContextOptions = Object.freeze([
  { value: "match", label: "Match" },
  { value: "training", label: "Training" },
  { value: "library", label: "Library" },
]);

export const setPiecePitchViewOptions = Object.freeze([
  { value: "full", label: "Full pitch" },
  { value: "attacking-half", label: "Attacking half" },
  { value: "defensive-half", label: "Defensive half" },
]);

export const setPieceToolOptions = Object.freeze([
  { value: "select", label: "Select", shortcut: "V", hint: "Move players, routes or a multi-selection" },
  { value: "home-player", label: "Own player", shortcut: "P", hint: "Choose a squad player, then place them" },
  { value: "opponent", label: "Opponent", shortcut: "O", hint: "Click the pitch to place a numbered opponent" },
  { value: "ball", label: "Ball", shortcut: "B", hint: "Click the pitch to place or move the ball" },
  { value: "run", label: "Run", shortcut: "R", hint: "Drag from a player to draw the run" },
  { value: "pass", label: "Pass", shortcut: "A", hint: "Drag from the ball or player to show the pass" },
  { value: "dribble", label: "Dribble", shortcut: "D", hint: "Drag to draw a controlled ball carry" },
  { value: "block", label: "Block", shortcut: "K", hint: "Drag to show the screen or blocking lane" },
  { value: "press", label: "Press", shortcut: "E", hint: "Drag to show the pressing action" },
  { value: "mark", label: "Track", shortcut: "M", hint: "Drag between opponents to show tracking" },
  { value: "zone", label: "Zone", shortcut: "Z", hint: "Drag a rectangle to mark the protected zone" },
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

export const setPieceLayerOptions = Object.freeze([
  { value: "home", label: "Own team" },
  { value: "opponent", label: "Opponent" },
  { value: "ball", label: "Ball" },
  { value: "drawings", label: "Movements" },
  { value: "labels", label: "Labels" },
]);

export const setPiecePlaybackSpeedOptions = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2]);

export const DEFAULT_PHASE_DURATION_MS = 1400;
export const DEFAULT_PHASE_HOLD_MS = 450;
export const DEFAULT_ACTION_DURATION_MS = 900;
