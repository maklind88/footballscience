import { createPerformanceSurface } from "../src/modules/performance/index.mjs";

const date = "2026-11-25";
const events = [
  { id: "first-match", date: "2026-11-23", type: "match", title: "Harbor FC", time: "19:00" },
  { id: "recovery", date: "2026-11-24", type: "recovery", title: "Recovery and top-up", time: "10:30" },
  { id: "training", date, type: "training", title: "Team training", time: "10:00" },
  { id: "prep", date: "2026-11-27", type: "training", title: "Match preparation", time: "10:00" },
  { id: "next-match", date: "2026-11-28", type: "match", title: "Capital FC", time: "16:00" },
];
const focus = { "2026-11-24": "Recovery / top-up", [date]: "Moderate", "2026-11-27": "Low" };
const sessions = {
  "2026-11-24": { blocks: [{ title: "Recovery and top-up groups", minutes: 40 }] },
  [date]: { blocks: [{ title: "Team block", minutes: 35 }, { title: "Transition work", minutes: 25 }] },
  "2026-11-27": { blocks: [{ title: "Match rehearsals", minutes: 45 }] },
};
const players = [
  { id: "maya", name: "Maya Torres", position: "Fullback", number: "2" },
  { id: "jules", name: "Jules Morgan", position: "Fullback", number: "3" },
  { id: "erin", name: "Erin Lee", position: "Midfielder", number: "6" },
  { id: "avery", name: "Avery Patel", position: "Midfielder", number: "8" },
  { id: "sam", name: "Sam Rivera", position: "Forward", number: "9" },
  { id: "alex", name: "Alex Kim", position: "Goalkeeper", number: "1" },
];

const load = (distance, hsr, sprint) => ({ distance, hsr, sprint });
const seed = {
  references: {
    team: load(9000, 500, 120),
    "role:Fullback": load(9800, 650, 150),
    "role:Goalkeeper": load(4500, 65, 0),
    "player:maya": { distance: 10300 },
  },
  plans: {
    maya: { recovery: load(2200, 0, 0), training: load(5000, 300, 55), prep: load(2900, 115, 20) },
    jules: { recovery: load(3900, 220, 30), training: load(5800, 410, 90), prep: load(3200, 140, 25) },
    erin: { recovery: load(2500, 0, 0), training: load(5700, 330, 65), prep: load(3100, 150, 25) },
    avery: { recovery: load(4000, 190, 25), training: load(6100, 350, 65), prep: load(3200, 125, 20) },
    sam: { training: load(4600, 280, 80), prep: load(2500, 110, 20) },
    alex: { training: { distance: 2500 } },
  },
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const surface = createPerformanceSurface({
  root: document.querySelector("#performanceWorkspace"),
  getScope: () => "sample-microcycle",
  isActive: () => true,
  canRead: (owner) => owner !== "medical-team",
  getToday: () => date,
  getTeam: () => ({}),
  getTeamName: () => "Example squad",
  getLogo: () => "",
  escapeHtml,
  getSchedule: () => ({ events }),
  getUniqueEvents: (items) => items,
  getPeriodizationDay: (day) => ({ physicalLoad: focus[day], sessionType: "Off" }),
  getSessions: () => ({ sessions }),
  getSquad: () => ({ players }),
  isTemporaryPlayer: () => false,
  getDrillLibrary: () => [],
  loadPlanningEnabled: true,
  openLoadPlan: true,
  isSampleLoadPlan: true,
  loadPlanSeed: seed,
});
surface.render();
