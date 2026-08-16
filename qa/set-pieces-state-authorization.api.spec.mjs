import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { protectSetPiecesStateWrite } = require("../api/_lib/set-pieces-state-authorization.js");

function stateWithContent() {
  return {
    plays: [{
      id: "play-1",
      variants: [{
        id: "variant-1",
        phases: [{
          id: "phase-1",
          elements: [{ id: "player-1" }],
          drawings: [{ id: "run-1" }],
        }],
      }],
    }],
  };
}

test("Set Pieces server policy lets analysts edit but rejects semantic deletion", () => {
  const previous = stateWithContent();
  const edited = structuredClone(previous);
  edited.plays[0].title = "Edited title";
  expect(protectSetPiecesStateWrite(
    { role: "analyst" },
    JSON.stringify(edited),
    { previousValue: JSON.stringify(previous) }
  )).toMatchObject({ ok: true });

  const removedDrawing = structuredClone(previous);
  removedDrawing.plays[0].variants[0].phases[0].drawings = [];
  expect(protectSetPiecesStateWrite(
    { role: "analyst" },
    JSON.stringify(removedDrawing),
    { previousValue: JSON.stringify(previous) }
  )).toMatchObject({ ok: false, status: 403 });
});

test("Set Pieces server policy permits coach deletion and rejects invalid state", () => {
  const previous = stateWithContent();
  expect(protectSetPiecesStateWrite(
    { role: "coach" },
    JSON.stringify({ plays: [] }),
    { previousValue: JSON.stringify(previous) }
  )).toMatchObject({ ok: true });
  expect(protectSetPiecesStateWrite(
    { role: "coach" },
    "not-json",
    { previousValue: JSON.stringify(previous) }
  )).toMatchObject({ ok: false, status: 400 });
  expect(protectSetPiecesStateWrite(
    { role: "analyst" },
    "",
    { removed: true, previousValue: JSON.stringify(previous) }
  )).toMatchObject({ ok: false, status: 403 });
});
