import { expect, test } from "@playwright/test";
import { defaultMedicalPlayers } from "../src/modules/medical/index.mjs";

test("Medical default roster exposes stable NCC seed players", () => {
  expect(defaultMedicalPlayers.length).toBeGreaterThanOrEqual(20);
  expect(defaultMedicalPlayers[0]).toMatchObject({
    id: "ncc-2026-madison-white",
    name: "Madison White",
    position: "Goalkeeper",
    rosterOrder: 1,
  });
  expect(defaultMedicalPlayers.some((player) => player.id === "ncc-2026-cortnee-vine" || player.name === "Cortnee Vine")).toBe(false);
  expect(defaultMedicalPlayers.every((player) => player.id && player.name && player.position)).toBe(true);
});
