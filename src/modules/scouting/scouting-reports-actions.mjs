function normalizeText(deps = {}, value = "", limit = 160) {
  if (typeof deps.normalizeText === "function") {
    return deps.normalizeText(value, limit);
  }
  return String(value || "").trim().slice(0, limit);
}

function canMutate(deps = {}) {
  return deps.canEdit?.() === true;
}

function getActionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : null;
}

function nowIso(deps = {}) {
  return normalizeText(deps, deps.now?.() || new Date().toISOString(), 40) || new Date().toISOString();
}

function createId(deps = {}, prefix = "scouting-item") {
  if (typeof deps.createId === "function") {
    return deps.createId(prefix);
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTargets(deps = {}, state = getActionState(deps)) {
  return Array.isArray(deps.getTargets?.(state)) ? deps.getTargets(state) : Array.isArray(state?.targets) ? state.targets : [];
}

function getReports(deps = {}, state = getActionState(deps)) {
  return Array.isArray(deps.getReports?.(state)) ? deps.getReports(state) : Array.isArray(state?.reports) ? state.reports : [];
}

function getTargetRecordId(deps = {}, target = {}) {
  return normalizeText(deps, target?.recordId, 160);
}

function findTargetByRecordId(deps = {}, recordId = "", state = getActionState(deps)) {
  const id = normalizeText(deps, recordId, 160);
  return getTargets(deps, state).find((target) => getTargetRecordId(deps, target) === id) || null;
}

function findTargetById(deps = {}, targetId = "", state = getActionState(deps)) {
  const id = normalizeText(deps, targetId, 120);
  return getTargets(deps, state).find((target) => normalizeText(deps, target?.id, 120) === id) || null;
}

function writeAndRender(deps = {}, options = {}) {
  deps.writeState?.();
  deps.renderWorkspace?.(options.renderOptions);
}

function normalizeScore(deps = {}, value, fallback = 3) {
  if (typeof deps.normalizeReportScore === "function") {
    return deps.normalizeReportScore(value, fallback);
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : fallback;
}

function normalizeReport(deps = {}, report = {}) {
  const now = nowIso(deps);
  return {
    id: normalizeText(deps, report.id, 120) || createId(deps, "scouting-report"),
    title: normalizeText(deps, report.title, 160) || "Scouting report",
    type: report.type === "opposition" ? "opposition" : "player",
    targetId: normalizeText(deps, report.targetId, 120),
    summary: normalizeText(deps, report.summary, 1200),
    recommendation: deps.normalizeReportRecommendation?.(report.recommendation) || "monitor",
    confidence: normalizeScore(deps, report.confidence, 3),
    technical: normalizeScore(deps, report.technical, 3),
    tactical: normalizeScore(deps, report.tactical, 3),
    physical: normalizeScore(deps, report.physical, 3),
    psychological: normalizeScore(deps, report.psychological, 3),
    scoutType: normalizeText(deps, report.scoutType, 80) || "Video/live",
    createdAt: normalizeText(deps, report.createdAt, 40) || now,
  };
}

function createTargetFromRecord(deps = {}, record, target = {}) {
  const now = nowIso(deps);
  const recordId = normalizeText(deps, deps.getRecordId?.(record), 160);
  const roleFit = deps.getRoleFitScore?.(record);
  return {
    id: normalizeText(deps, target.id, 120) || createId(deps, "scouting-target"),
    recordId,
    name: normalizeText(deps, deps.getRecordName?.(record), 180) || "Unknown target",
    club: normalizeText(deps, deps.getRecordTeam?.(record), 180),
    position: normalizeText(deps, deps.getRecordPosition?.(record), 80),
    age: String(deps.getRecordAge?.(record) || ""),
    status: deps.normalizeTargetStatus?.(target.status) || "new",
    priority: deps.normalizeTargetPriority?.(target.priority) || "normal",
    fit: Number.isFinite(roleFit) ? `P${roleFit}` : "n/a",
    notes: normalizeText(deps, target.notes, 900),
    slotId: normalizeText(deps, target.slotId, 40),
    owner: normalizeText(deps, target.owner, 80),
    nextAction: normalizeText(deps, target.nextAction, 220),
    nextActionDate: deps.normalizeDateText?.(target.nextActionDate) || "",
    lastContact: deps.normalizeDateText?.(target.lastContact) || "",
    decisionDeadline: deps.normalizeDateText?.(target.decisionDeadline) || "",
    createdAt: normalizeText(deps, target.createdAt, 40) || now,
    updatedAt: normalizeText(deps, target.updatedAt, 40) || now,
  };
}

function refreshExpandedPanel(deps = {}) {
  if (!deps.rerenderActiveContent?.({ preserveFocus: true })) {
    deps.renderWorkspace?.({ preserveFocus: true });
  }
}

export function createScoutingReportsActions(deps = {}) {
  function createTarget(record, target = {}) {
    return createTargetFromRecord(deps, record, target);
  }

  function openBuilder() {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    deps.setReportBuilderOpen?.(true);
    deps.renderWorkspace?.({ preserveFocus: true });
    return { changed: true, status: "updated" };
  }

  function closeBuilder() {
    deps.setReportBuilderOpen?.(false);
    deps.renderWorkspace?.({ preserveFocus: true });
    return { changed: true, status: "updated" };
  }

  function createReport(report = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const nextReport = normalizeReport(deps, report);
    if (!state || (!nextReport.title && !nextReport.summary)) {
      return { changed: false, report: nextReport, status: "empty" };
    }
    state.reports = [nextReport, ...getReports(deps, state)];
    writeAndRender(deps);
    return { changed: true, report: nextReport, status: "updated" };
  }

  function createReportFromForm(title, type, targetId, summary) {
    const safeTitle = normalizeText(deps, title, 160);
    const safeSummary = normalizeText(deps, summary, 1200);
    if (!safeTitle && !safeSummary) {
      return { changed: false, status: "empty" };
    }
    const safeType = type === "opposition" ? "opposition" : "player";
    return createReport({
      id: createId(deps, "scouting-report"),
      targetId: safeType === "player" ? normalizeText(deps, targetId, 120) : "",
      title: safeTitle || "Scouting report",
      type: safeType,
      summary: safeSummary || "No report summary yet.",
      createdAt: nowIso(deps),
    });
  }

  function deleteReport(reportId) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, reportId, 120);
    if (!state || !id) {
      return { changed: false, reportId: id, status: "empty" };
    }
    const reports = getReports(deps, state);
    const nextReports = reports.filter((report) => normalizeText(deps, report.id, 120) !== id);
    if (nextReports.length === reports.length) {
      return { changed: false, reportId: id, status: "missing" };
    }
    state.reports = nextReports;
    writeAndRender(deps);
    return { changed: true, reportId: id, status: "updated" };
  }

  function saveTarget(recordId, patch = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const record = deps.getRecordById?.(recordId);
    if (!state || !record) {
      return { changed: false, recordId: normalizeText(deps, recordId, 160), status: "empty" };
    }
    deps.rememberRecordSnapshot?.(record, state);
    const baseTarget = findTargetByRecordId(deps, recordId, state);
    const nextTarget = createTargetFromRecord(deps, record, {
      ...(baseTarget || {}),
      ...patch,
      updatedAt: nowIso(deps),
    });
    state.targets = baseTarget
      ? getTargets(deps, state).map((target) => (target.id === baseTarget.id ? nextTarget : target))
      : [nextTarget, ...getTargets(deps, state)];
    deps.touchIntelligenceCache?.();
    writeAndRender(deps);
    return { changed: true, target: nextTarget, status: "updated" };
  }

  function updateTarget(targetId, patch = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const target = findTargetById(deps, targetId, state);
    if (!state || !target) {
      return { changed: false, targetId: normalizeText(deps, targetId, 120), status: "missing" };
    }
    const record = deps.getRecordById?.(getTargetRecordId(deps, target));
    if (!record) {
      return { changed: false, targetId: target.id, status: "missing-record" };
    }
    deps.rememberRecordSnapshot?.(record, state);
    const nextTarget = createTargetFromRecord(deps, record, {
      ...target,
      ...patch,
      updatedAt: normalizeText(deps, patch.updatedAt, 40) || nowIso(deps),
    });
    state.targets = getTargets(deps, state).map((entry) => (entry.id === target.id ? nextTarget : entry));
    deps.touchIntelligenceCache?.();
    writeAndRender(deps);
    return { changed: true, target: nextTarget, status: "updated" };
  }

  function removeTarget(targetId) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, targetId, 120);
    if (!state || !id) {
      return { changed: false, targetId: id, status: "empty" };
    }
    const targets = getTargets(deps, state);
    const nextTargets = targets.filter((target) => normalizeText(deps, target.id, 120) !== id);
    if (nextTargets.length === targets.length) {
      return { changed: false, targetId: id, status: "missing" };
    }
    state.targets = nextTargets;
    deps.touchIntelligenceCache?.();
    writeAndRender(deps);
    return { changed: true, targetId: id, status: "updated" };
  }

  function expandPanel(panelId) {
    const id = normalizeText(deps, panelId, 80);
    if (!["comparison-lab", "targets"].includes(id)) {
      return { changed: false, panelId: id, status: "empty" };
    }
    const panels = deps.getExpandedPanels?.() || new Set();
    deps.setExpandedPanels?.(new Set([...panels, id]));
    refreshExpandedPanel(deps);
    return { changed: true, panelId: id, status: "updated" };
  }

  function collapsePanel(panelId) {
    const id = normalizeText(deps, panelId, 80);
    const panels = deps.getExpandedPanels?.() || new Set();
    if (!panels.has(id)) {
      return { changed: false, panelId: id, status: "unchanged" };
    }
    deps.setExpandedPanels?.(new Set([...panels].filter((panel) => panel !== id)));
    refreshExpandedPanel(deps);
    return { changed: true, panelId: id, status: "updated" };
  }

  return {
    closeBuilder,
    collapsePanel,
    createReport,
    createReportFromForm,
    createTarget,
    deleteReport,
    expandPanel,
    openBuilder,
    removeTarget,
    saveTarget,
    updateTarget,
  };
}
