export const descriptorGroups = Object.freeze([
  {
    id: "unit",
    label: "Unit",
    options: ["GK + Back Line", "Back Line", "Midfield", "Front Line", "Rest Defence", "Set Piece Unit"],
  },
  {
    id: "pitchZone",
    label: "Pitch Zone",
    options: ["Own Box", "Build Left", "Build Central", "Build Right", "Middle Third", "Final Third", "Opponent Box"],
  },
  {
    id: "pressure",
    label: "Pressure",
    options: ["No Pressure", "Arriving Pressure", "High Pressure", "Back Pressure", "Overload Pressure"],
  },
  {
    id: "decision",
    label: "Decision",
    options: ["Secure", "Progress", "Switch", "Break Line", "Delay", "Force"],
  },
  {
    id: "execution",
    label: "Execution",
    options: ["Clean", "Late", "Underhit", "Overhit", "Wrong Foot", "Body Shape"],
  },
]);

export const descriptorApiKeys = Object.freeze({
  pitchZone: "pitch_zone",
});
