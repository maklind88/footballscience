export function buildPlayerProfileOperationFeedback(result = {}, successMessage = "") {
  if (!result || typeof result !== "object") {
    return successMessage || "";
  }
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  if (!result.ok) {
    return {
      status: errors.length ? "error" : warnings.length ? "warning" : "error",
      lines: errors.length ? errors : [successMessage || "Action could not be completed."],
      items: warnings.length ? warnings : [],
    };
  }
  const lines = [];
  if (successMessage) {
    lines.push(successMessage);
  }
  if (warnings.length) {
    lines.push("Quality notes:");
  }
  return {
    status: warnings.length ? "warning" : "success",
    lines,
    items: warnings,
  };
}

export function buildPlayerProfileImportFeedback(result = {}, options = {}) {
  if (!result || typeof result !== "object") {
    return "No changes imported.";
  }
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const imported = result.importedCount || 0;
  const created = result.createdCount || 0;
  const updated = result.updatedCount || 0;
  const skipped = result.skippedCount || 0;
  const lines = [];
  if (result.ok === false) {
    return {
      status: errors.length ? "error" : "warning",
      lines: ["Import did not apply any player profiles."],
      items: errors.map((entry) => `Row ${entry.row}: ${entry.message}`),
    };
  }
  if (imported) {
    lines.push(`${imported} player profile${imported === 1 ? "" : "s"} imported: ${created} added, ${updated} updated.`);
  } else {
    lines.push("No player profiles were imported.");
  }
  if (skipped) {
    lines.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped due to validation issues.`);
  }
  if (warnings.length) {
    warnings.forEach((entry) => {
      if (entry?.message) {
        lines.push(`Warning (row ${entry.row || "?"}): ${entry.message}`);
      } else if (typeof entry === "string") {
        lines.push(entry);
      }
    });
  }
  const undoState = options.undoState || {};
  if (imported && undoState.canUndo && undoState.summary) {
    lines.push(undoState.summary);
  } else if (imported && undoState.canUndo === false && undoState.reason) {
    lines.push(undoState.reason);
  }
  return {
    status: errors.length ? "error" : warnings.length ? "warning" : "success",
    lines,
    items: [
      ...errors.map((entry) => `Row ${entry.row}: ${entry.message}`),
      ...warnings
        .map((entry) => {
          if (entry?.message) {
            return `Row ${entry.row || "?"}: ${entry.message}`;
          }
          return typeof entry === "string" ? entry : "";
        })
        .filter(Boolean),
    ],
  };
}

export function buildPlayerProfileImportPreviewMessage(plan = {}, options = {}) {
  if (!plan || typeof plan !== "object") {
    return {
      status: "warning",
      lines: ["No import plan was available."],
      items: [],
    };
  }
  const rows = Array.isArray(plan.rows) ? plan.rows : [];
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 12;
  const summary = [
    `${rows.length} row${rows.length === 1 ? "" : "s"} evaluated.`,
    `${plan.importedCount || 0} will be applied: ${plan.createdCount || 0} added, ${plan.updatedCount || 0} updated.`,
    `${plan.skippedCount || 0} row${(plan.skippedCount || 0) === 1 ? "" : "s"} skipped.`,
    `${plan.duplicateRowsCount || 0} duplicate row${(plan.duplicateRowsCount || 0) === 1 ? "" : "s"} skipped.`,
  ];
  const rowSummary = rows.slice(0, maxRows).map((entry) => {
    const action = String(entry.action || "skip").toUpperCase();
    const playerName = String(entry.playerName || entry.name || "Unknown player");
    const note = entry.message ? ` (${entry.message})` : "";
    return `Row ${entry.row}: ${action} ${playerName}${note}`;
  });
  return {
    status: plan.errors && plan.errors.length ? "warning" : "success",
    lines: summary,
    items: [
      ...rowSummary,
      ...(rows.length > maxRows ? [`... and ${rows.length - maxRows} more row(s).`] : []),
    ],
  };
}
