export function renderScoutingReportsWorkspace(deps = {}) {
  const state = deps.ensureState();
  const renderSection = (label, renderer) => {
    if (typeof window === "undefined" || !window.__footballScienceScoutingPerfDebug) {
      return renderer();
    }
    const startedAt = performance.now();
    const html = renderer();
    console.log(`[scouting-render-performance] ${label}: ${Math.round(performance.now() - startedAt)}ms`);
    return html;
  };
  return `
    <div class="scouting-reports-shell">
      ${renderSection("reports.next-action", () => deps.renderNextActionCenter(state, { includeRecommendations: false }))}
      ${renderSection("reports.panel", () => deps.renderReportsPanel())}
      ${renderSection("reports.role-models", () => deps.renderRoleModelsPanel())}
      ${renderSection("reports.targets", () =>
        renderScoutingReportsLazyPanel(deps, "targets", "Funnel", "Pipeline board", "Load funnel", deps.renderTargetsPanel)
      )}
      ${renderSection("reports.budget", () => deps.renderBudgetBoard(state))}
    </div>
  `;
}

export function handleScoutingReportsClick(event, deps = {}) {
  const target = event.target;
  const deleteContactTrigger = target.closest("[data-delete-scouting-contact]");
  if (deleteContactTrigger) {
    event.stopPropagation();
    deps.deleteContactLogEntry(deleteContactTrigger.dataset.deleteScoutingContact);
    return true;
  }
  const printProfileReportTrigger = target.closest("[data-print-scouting-profile-report]");
  if (printProfileReportTrigger) {
    deps.printProfileReport(printProfileReportTrigger.dataset.printScoutingProfileReport);
    return true;
  }
  const saveTargetTrigger = target.closest("[data-save-scouting-target]");
  if (saveTargetTrigger) {
    deps.saveTarget(saveTargetTrigger.dataset.saveScoutingTarget, {
      status: saveTargetTrigger.dataset.scoutingTargetStatus,
      priority: saveTargetTrigger.dataset.scoutingTargetPriority,
    });
    return true;
  }
  const removeTargetTrigger = target.closest("[data-remove-scouting-target]");
  if (removeTargetTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.removeTarget(removeTargetTrigger.dataset.removeScoutingTarget);
    return true;
  }
  const deleteReportTrigger = target.closest("[data-delete-scouting-report]");
  if (deleteReportTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.deleteReport(deleteReportTrigger.dataset.deleteScoutingReport);
    return true;
  }
  const openBuilderTrigger = target.closest("[data-open-scouting-report-builder]");
  if (openBuilderTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openReportBuilder();
    return true;
  }
  const closeBuilderTrigger = target.closest("[data-close-scouting-report-builder]");
  if (closeBuilderTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.closeReportBuilder();
    return true;
  }
  const expandPanelTrigger = target.closest("[data-expand-scouting-reports-panel]");
  if (expandPanelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.expandReportsPanel(expandPanelTrigger.dataset.expandScoutingReportsPanel);
    return true;
  }
  const collapsePanelTrigger = target.closest("[data-collapse-scouting-reports-panel]");
  if (collapsePanelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.collapseReportsPanel(collapsePanelTrigger.dataset.collapseScoutingReportsPanel);
    return true;
  }
  const reportBuilderOverlay = target.closest("[data-scouting-report-builder-overlay]");
  if (reportBuilderOverlay && target === reportBuilderOverlay) {
    deps.closeReportBuilder();
    return true;
  }
  const createOppositionReportTrigger = target.closest("[data-create-scouting-opposition-report]");
  if (createOppositionReportTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    const snapshot = deps.getOppositionLatestSnapshot() || deps.getOppositionContext();
    const title = `Opposition memo: ${snapshot.team || "Scouting analysis"}`;
    const summary =
      deps.getOppositionLatestSnapshot()?.memo ||
      deps.getOppositionReportText() ||
      `Opposition memo generated from current analysis (${snapshot.team || "all teams"}, ${snapshot.season === "all" ? "All seasons" : snapshot.season}).`;
    deps.createReportFromForm(title, "opposition", "", summary);
    return true;
  }
  const createProfileReportTrigger = target.closest("[data-create-scouting-profile-report]");
  if (createProfileReportTrigger) {
    deps.createReportForRecord(createProfileReportTrigger.dataset.createScoutingProfileReport);
    return true;
  }
  return false;
}

export function handleScoutingReportsChange(event, deps = {}) {
  const target = event.target;
  const targetStatusTrigger = target.closest("[data-scouting-target-status]");
  if (targetStatusTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.updateTarget(targetStatusTrigger.dataset.scoutingTargetStatus, {
      status: deps.normalizeTargetStatus(targetStatusTrigger.value),
    });
    return true;
  }
  const targetPriorityTrigger = target.closest("[data-scouting-target-priority]");
  if (targetPriorityTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.updateTarget(targetPriorityTrigger.dataset.scoutingTargetPriority, {
      priority: deps.normalizeTargetPriority(targetPriorityTrigger.value),
    });
    return true;
  }
  const profileRoleTemplateTrigger = target.closest("[data-scouting-profile-role-template]");
  if (profileRoleTemplateTrigger) {
    deps.setProfileRoleProfile(profileRoleTemplateTrigger.value);
    return true;
  }
  const profileSpiderSeasonTrigger = target.closest("[data-scouting-profile-spider-season]");
  if (profileSpiderSeasonTrigger) {
    deps.setProfileSpiderSeason(profileSpiderSeasonTrigger.value);
    return true;
  }
  const oppositionForm = target.closest("[data-scouting-opposition-form]");
  if (oppositionForm) {
    const formData = new FormData(oppositionForm);
    deps.setOppositionFilters({
      team: formData.get("team"),
      season: formData.get("season"),
      minMinutes: formData.get("minMinutes"),
    });
    return true;
  }
  return false;
}

export function handleScoutingReportsSubmit(event, deps = {}) {
  const target = event.target;
  const contactForm = target.closest("[data-scouting-contact-form]");
  if (contactForm) {
    if (!deps.canEdit()) {
      return true;
    }
    event.preventDefault();
    const formData = new FormData(contactForm);
    deps.createContactLogEntry(contactForm.dataset.scoutingContactForm, {
      date: formData.get("date"),
      type: formData.get("type"),
      contact: formData.get("contact"),
      outcome: formData.get("outcome"),
      nextStep: formData.get("nextStep"),
      notes: formData.get("notes"),
    });
    contactForm.reset();
    return true;
  }
  const marketForm = target.closest("[data-scouting-market-form]");
  if (marketForm) {
    if (!deps.canEdit()) {
      return true;
    }
    event.preventDefault();
    const formData = new FormData(marketForm);
    deps.saveMarketInfo(marketForm.dataset.scoutingMarketForm, {
      contractStatus: formData.get("contractStatus"),
      contractEnd: formData.get("contractEnd"),
      optionYears: formData.get("optionYears"),
      agent: formData.get("agent"),
      wageBand: formData.get("wageBand"),
      estimatedFee: formData.get("estimatedFee"),
      salaryRange: formData.get("salaryRange"),
      dealProbability: formData.get("dealProbability"),
      budgetImpact: formData.get("budgetImpact"),
      transferStatus: formData.get("transferStatus"),
      medicalLoad: formData.get("medicalLoad"),
      roleTranslation: formData.get("roleTranslation"),
      notes: formData.get("notes"),
    });
    return true;
  }
  const targetForm = target.closest("[data-scouting-target-form]");
  if (targetForm) {
    if (!deps.canEdit()) {
      return true;
    }
    event.preventDefault();
    const formData = new FormData(targetForm);
    deps.saveTarget(targetForm.dataset.scoutingTargetForm, {
      status: formData.get("status"),
      priority: formData.get("priority"),
      slotId: formData.get("slotId"),
      notes: formData.get("notes"),
      owner: formData.get("owner"),
      nextAction: formData.get("nextAction"),
      nextActionDate: formData.get("nextActionDate"),
      lastContact: formData.get("lastContact"),
      decisionDeadline: formData.get("decisionDeadline"),
    });
    return true;
  }
  const reportForm = target.closest("[data-scouting-report-form]");
  if (reportForm) {
    if (!deps.canEdit()) {
      return true;
    }
    event.preventDefault();
    const formData = new FormData(reportForm);
    const summaryParts = [
      ["Assessment", formData.get("summary")],
      ["Strengths", formData.get("strengths")],
      ["Risks / questions", formData.get("risks")],
      ["Next step", formData.get("nextStep")],
    ]
      .map(([label, value]) => {
        const text = deps.normalizeText(value, 500);
        return text ? `${label}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    deps.setReportBuilderOpen(false);
    deps.createReport({
      title: formData.get("title"),
      type: formData.get("type"),
      targetId: formData.get("targetId"),
      summary: summaryParts || formData.get("summary"),
      recommendation: formData.get("recommendation"),
      confidence: formData.get("confidence"),
      technical: formData.get("technical"),
      tactical: formData.get("tactical"),
      physical: formData.get("physical"),
      psychological: formData.get("psychological"),
      scoutType: formData.get("scoutType"),
    });
    if (reportForm.elements.type?.value !== "opposition") {
      reportForm.reset();
    }
    return true;
  }
  const oppositionForm = target.closest("[data-scouting-opposition-form]");
  if (oppositionForm) {
    event.preventDefault();
    const formData = new FormData(oppositionForm);
    deps.setOppositionFilters({
      team: formData.get("team"),
      season: formData.get("season"),
      minMinutes: formData.get("minMinutes"),
    });
    return true;
  }
  return false;
}

function renderScoutingReportsLazyPanel(deps, panelId, title, detail, actionLabel, renderer) {
  const id = deps.normalizeText(panelId, 80);
  if (deps.expandedPanels.has(id)) {
    return renderer();
  }
  return `
    <section class="scouting-role-models scouting-role-model-launcher" data-scouting-reports-lazy-panel="${deps.escapeHtml(id)}">
      <div class="scouting-role-model-head">
        <div>
          <p class="placeholder-tag">${deps.escapeHtml(detail)}</p>
          <h2>${deps.escapeHtml(title)}</h2>
        </div>
        <div class="scouting-role-model-toolbar">
          <button type="button" class="scouting-primary-button" data-expand-scouting-reports-panel="${deps.escapeHtml(id)}">${deps.escapeHtml(actionLabel)}</button>
        </div>
      </div>
    </section>
  `;
}
