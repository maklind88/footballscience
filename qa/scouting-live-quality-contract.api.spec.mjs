import { expect, test } from "@playwright/test";
import {
  readScoutingSquadPlayers,
  renderScoutingProfileTabNavigation,
  renderScoutingProfileTabPanel,
  resolveScoutingRoleModelDefaults,
  scoutingSquadStorageKey,
} from "../src/modules/scouting/index.mjs";

test("Scouting profile tabs expose one accessible active panel", () => {
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "performance", label: "Performance" },
  ];
  const navigation = renderScoutingProfileTabNavigation({ tabs, activeTab: "performance" });
  const panel = renderScoutingProfileTabPanel({ activeTab: "performance", content: "<strong>Ready</strong>" });

  expect(navigation).toContain('role="tablist"');
  expect(navigation).toContain('id="scouting-profile-tab-performance"');
  expect(navigation).toContain('aria-selected="true"');
  expect(navigation).toContain('aria-controls="scouting-profile-panel-performance"');
  expect(panel).toContain('role="tabpanel"');
  expect(panel).toContain('aria-labelledby="scouting-profile-tab-performance"');
  expect(panel).toContain("<strong>Ready</strong>");
  expect((panel.match(/scouting-profile-tab-panel/g) || []).length).toBe(1);
});

test("Scouting role model defaults use role-specific performance metrics", () => {
  const metrics = [
    { id: "minutes", label: "Minutes", direction: "higher" },
    { id: "age", label: "Age", direction: "lower" },
    { id: "save-rate", label: "Save rate", direction: "higher" },
    { id: "prevented-goals-per-90", label: "Prevented goals per 90", direction: "higher" },
    { id: "exits-per-90", label: "Exits per 90", direction: "higher" },
    { id: "accurate-long-passes", label: "Accurate long passes", direction: "higher" },
    { id: "fouls-per-90", label: "Fouls per 90", direction: "lower" },
  ];

  expect(resolveScoutingRoleModelDefaults(metrics, "GK")).toEqual([
    { metricId: "save-rate", direction: "higher", minPercentile: 70, weight: 3 },
    { metricId: "prevented-goals-per-90", direction: "higher", minPercentile: 70, weight: 3 },
    { metricId: "exits-per-90", direction: "higher", minPercentile: 70, weight: 3 },
    { metricId: "accurate-long-passes", direction: "higher", minPercentile: 70, weight: 3 },
  ]);
  expect(resolveScoutingRoleModelDefaults(metrics, "unknown")).toEqual([]);
});

test("Scouting reads the canonical Squad roster without owning its storage", () => {
  const players = readScoutingSquadPlayers(JSON.stringify({
    schemaVersion: 2,
    players: [
      { id: "ks", name: "Kailen Sheridan", position: "Goalkeeper", primaryRole: "GK", rosterType: "squad" },
      { id: "guest", name: "Trial Player", position: "Forward", primaryRole: "ST", rosterType: "guest" },
    ],
  }), { now: "2026-08-31T00:00:00.000Z" });

  expect(scoutingSquadStorageKey).toBe("football-player-profiles-v1");
  expect(players).toHaveLength(1);
  expect(players[0]).toMatchObject({
    id: "ks",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    bestRole: "GK",
    rosterType: "squad",
  });
});
