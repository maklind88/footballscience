import { expect, test } from "@playwright/test";
import {
  buildPlayerProfileImportFeedback,
  buildPlayerProfileImportPreviewMessage,
  buildPlayerProfileOperationFeedback,
} from "../src/modules/squad/index.mjs";

test("Squad player profile feedback helpers build stable operation messages", () => {
  expect(buildPlayerProfileOperationFeedback(null, "Saved")).toBe("Saved");
  expect(buildPlayerProfileOperationFeedback({ ok: true, warnings: ["Check role"] }, "Saved")).toEqual({
    status: "warning",
    lines: ["Saved", "Quality notes:"],
    items: ["Check role"],
  });
  expect(buildPlayerProfileOperationFeedback({ ok: false, errors: ["Name required"] }, "Saved")).toEqual({
    status: "error",
    lines: ["Name required"],
    items: [],
  });
});

test("Squad player profile feedback helpers build import feedback and preview messages", () => {
  const feedback = buildPlayerProfileImportFeedback(
    {
      ok: true,
      importedCount: 2,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 1,
      warnings: [{ row: 3, message: "Duplicate ignored" }],
      errors: [],
    },
    { undoState: { canUndo: true, summary: "Undo is available." } }
  );
  expect(feedback.status).toBe("warning");
  expect(feedback.lines).toContain("2 player profiles imported: 1 added, 1 updated.");
  expect(feedback.lines).toContain("Undo is available.");
  expect(feedback.items).toContain("Row 3: Duplicate ignored");

  const failed = buildPlayerProfileImportFeedback({ ok: false, errors: [{ row: 1, message: "Missing name" }] });
  expect(failed.status).toBe("error");
  expect(failed.items).toEqual(["Row 1: Missing name"]);

  const preview = buildPlayerProfileImportPreviewMessage({
    importedCount: 1,
    createdCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    duplicateRowsCount: 0,
    rows: [{ row: 1, action: "create", playerName: "Mak Player" }],
  });
  expect(preview.status).toBe("success");
  expect(preview.items).toEqual(["Row 1: CREATE Mak Player"]);
});
