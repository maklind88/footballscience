import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";

function callOptional(fn, ...args) {
  return typeof fn === "function" ? fn(...args) : undefined;
}

function getStateValue(state = {}, key, fallback = undefined) {
  const getter = state[`get${key}`];
  return typeof getter === "function" ? getter() : fallback;
}

function setStateValue(state = {}, key, value) {
  const setter = state[`set${key}`];
  if (typeof setter === "function") setter(value);
}

function getMedicalState(state = {}) {
  return getStateValue(state, "MedicalState", { players: [], records: [], injuryPlans: [], selectedDate: "", selectedPlayerId: "", policy: null });
}

function queryWorkspace(workspaceElement, selector) {
  return workspaceElement?.querySelector?.(selector) ?? null;
}

function queryWorkspaceAll(workspaceElement, selector) {
  return Array.from(workspaceElement?.querySelectorAll?.(selector) ?? []);
}

function normalizeRtpClinicalQuery(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("/", " ")
    .replaceAll("-", " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRtpClinicalQueryTerms(query = "") {
  return normalizeRtpClinicalQuery(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function getRtpClinicalCardHaystack(card = {}) {
  const dataset = card.dataset || {};
  return normalizeRtpClinicalQuery(
    [
      dataset.search,
      dataset.clinicalSearch,
      dataset.clinicalSymptoms,
      dataset.clinicalBodyArea,
      dataset.clinicalMechanism,
      dataset.clinicalRedFlags,
      dataset.clinicalMovement,
      dataset.clinicalTissue,
      dataset.clinicalPositionDemand,
      dataset.movement,
      dataset.position,
    ].filter(Boolean).join(" ")
  );
}

function cardMatchesRtpClinicalQuery(card = {}, query = "") {
  const normalizedQuery = normalizeRtpClinicalQuery(query);
  if (!normalizedQuery) return true;
  const haystack = getRtpClinicalCardHaystack(card);
  if (haystack.includes(normalizedQuery)) return true;
  const terms = getRtpClinicalQueryTerms(normalizedQuery);
  return terms.length ? terms.every((term) => haystack.includes(term)) : false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function bindMedicalRuntimeBindings(deps = {}) {
  const { actions = {}, state = {}, win = globalThis, workspaceElement = null } = deps;
  if (!workspaceElement?.addEventListener) return {};

  const renderWorkspace = actions.renderMedicalTeamWorkspace ?? (() => {});
  const canEdit = actions.canEditMedicalTeam ?? (() => false);

  const recordSync = (eventType, payload) => {
    void actions.recordMedicalDatabaseSyncEvent?.(eventType, payload);
  };

  const filterMedicalRtpLibrary = () => {
    const library = queryWorkspace(workspaceElement, "[data-medical-rtp-library]");
    if (!library) return;
    const query = String(library.querySelector("[data-medical-rtp-library-search]")?.value || "").trim();
    const filters = Array.from(library.querySelectorAll("[data-medical-rtp-library-filter]")).reduce((acc, control) => {
      acc[control.dataset.medicalRtpLibraryFilter] = String(control.value || "all").toLowerCase();
      return acc;
    }, {});
    let visibleCount = 0;
    library.querySelectorAll("[data-medical-rtp-profile]").forEach((card) => {
      const matchesQuery = cardMatchesRtpClinicalQuery(card, query);
      const matchesMovement = !filters.movement || filters.movement === "all" || String(card.dataset.movement || "").toLowerCase().includes(filters.movement);
      const matchesPosition = !filters.position || filters.position === "all" || String(card.dataset.position || "").toLowerCase().includes(filters.position);
      const matchesSeason = !filters.season || filters.season === "all" || String(card.dataset.season || "").toLowerCase().includes(filters.season);
      const matchesSex = !filters.sex || filters.sex === "all" || String(card.dataset.sex || "").toLowerCase().includes(filters.sex);
      const matchesLevel = !filters.level || filters.level === "all" || String(card.dataset.level || "").toLowerCase().includes(filters.level);
      const isVisible = matchesQuery && matchesMovement && matchesPosition && matchesSeason && matchesSex && matchesLevel;
      card.hidden = !isVisible;
      visibleCount += isVisible ? 1 : 0;
    });
    const count = library.querySelector("[data-medical-rtp-library-count]");
    if (count) count.textContent = String(visibleCount);
    const empty = library.querySelector("[data-medical-rtp-library-empty]");
    if (empty) empty.hidden = visibleCount !== 0;
  };

  const filterMedicalRtpExerciseCatalog = () => {
    const catalog = queryWorkspace(workspaceElement, "[data-medical-rtp-exercise-catalog]");
    if (!catalog) return;
    const query = String(catalog.querySelector("[data-medical-rtp-exercise-search]")?.value || "").trim().toLowerCase();
    const filters = Array.from(catalog.querySelectorAll("[data-medical-rtp-exercise-filter]")).reduce((acc, control) => {
      acc[control.dataset.medicalRtpExerciseFilter] = String(control.value || "all").toLowerCase();
      return acc;
    }, {});
    let visibleCount = 0;
    catalog.querySelectorAll("[data-medical-rtp-exercise]").forEach((card) => {
      const matchesQuery = !query || String(card.dataset.search || "").toLowerCase().includes(query);
      const matchesPhase = !filters.phase || filters.phase === "all" || String(card.dataset.phase || "").toLowerCase().includes(filters.phase);
      const matchesTissue = !filters.tissue || filters.tissue === "all" || String(card.dataset.tissue || "").toLowerCase().includes(filters.tissue);
      const matchesRisk = !filters.risk || filters.risk === "all" || String(card.dataset.risk || "").toLowerCase() === filters.risk;
      const isVisible = matchesQuery && matchesPhase && matchesTissue && matchesRisk;
      card.hidden = !isVisible;
      visibleCount += isVisible ? 1 : 0;
    });
    const count = catalog.querySelector("[data-medical-rtp-exercise-count]");
    if (count) count.textContent = String(visibleCount);
    const empty = catalog.querySelector("[data-medical-rtp-exercise-empty]");
    if (empty) empty.hidden = visibleCount !== 0;
  };

  const closeMedicalRtpExerciseOverlay = () => {
    queryWorkspaceAll(workspaceElement, "[data-medical-rtp-exercise-overlay]").forEach((overlay) => {
      overlay.hidden = true;
      overlay.setAttribute?.("aria-hidden", "true");
    });
    win.document?.body?.classList?.remove?.("medical-rtp-exercise-overlay-open");
  };

  const openMedicalRtpExerciseOverlay = () => {
    const overlay = queryWorkspace(workspaceElement, "[data-medical-rtp-exercise-overlay]");
    if (!overlay) return;
    closeMedicalRtpGuideDraftModal();
    closeMedicalRtpProfileModal();
    overlay.hidden = false;
    overlay.removeAttribute?.("aria-hidden");
    win.document?.body?.classList?.add?.("medical-rtp-exercise-overlay-open");
    filterMedicalRtpExerciseCatalog();
    overlay.querySelector?.("[role='dialog']")?.focus?.();
  };

  const closeMedicalRtpProfileModal = () => {
    queryWorkspaceAll(workspaceElement, "[data-medical-rtp-profile-modal]").forEach((modal) => {
      modal.hidden = true;
      modal.setAttribute?.("aria-hidden", "true");
    });
  };

  const getRtpProfileAnchorId = (profileId = "", suffix = "") =>
    `medical-rtp-${String(profileId || "guide").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}-${suffix}`;

  const getFirstRtpGuideItem = (items = [], fallback = "Review and individualize in the Medical Plan.") =>
    (Array.isArray(items) && items.find(Boolean)) || fallback;

  const renderRtpGuideList = (title, items = [], anchorId = "") => `
<section${anchorId ? ` id="${escapeHtml(anchorId)}"` : ""}>
<h4>${escapeHtml(title)}</h4>
${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>Not set yet.</p>"}
</section>
`;

  const renderRtpGuideTags = (items = [], limit = 5) =>
    items
      .slice(0, limit)
      .map((item) => `<span class="medical-ops-chip medical-ops-chip-low">${escapeHtml(item)}</span>`)
      .join("");

  const getRtpProfileExercises = (profile = {}, limit = 6) =>
    actions.getMedicalRtpExercisesForProfile?.(profile.id, { limit }) || [];

  const renderRtpExerciseCards = (profile = {}, limit = 6) => {
    const exercises = getRtpProfileExercises(profile, limit);
    if (!exercises.length) {
      return `<div class="medical-rtp-exercise-empty">No Exercise Bank starters mapped yet.</div>`;
    }
    return `
<div class="medical-rtp-exercise-grid">
${exercises
  .map(
    (item) => `
<article class="medical-rtp-exercise-card medical-rtp-exercise-${escapeHtml(item.riskLevel)}">
<header>
<span>${escapeHtml(item.phases.slice(0, 2).join(" / ") || "phase")}</span>
<strong>${escapeHtml(item.name)}</strong>
</header>
<p>${escapeHtml(item.intent)}</p>
<div class="medical-rtp-exercise-meta">
<span>${escapeHtml(item.tissueTypes.slice(0, 2).join(" / ") || "tissue")}</span>
<span>${escapeHtml(item.footballDemands.slice(0, 2).join(" / ") || "football demand")}</span>
<span>${escapeHtml(item.riskLevel)}</span>
</div>
<small><strong>Evidence:</strong> ${escapeHtml(item.evidenceLevel)}. ${escapeHtml(item.evidenceSummary)}</small>
<small><strong>Hold:</strong> ${escapeHtml(item.holdRules[0] || "Medical review if symptoms increase.")}</small>
</article>
`
  )
  .join("")}
</div>
`;
  };

  const renderRtpProfileHeaderMeta = (profile = {}) => `
<div class="medical-rtp-profile-header-meta" aria-label="RTP guide metadata">
<span>${escapeHtml(profile.system || "System")}</span>
<span>${escapeHtml(profile.bodyArea || "Body area")}</span>
<span>${escapeHtml(profile.evidenceLevel || "Evidence level not set")}</span>
</div>
`;

  const renderRtpProfileQuickNav = (profile = {}) => {
    const profileId = profile.id || "guide";
    return `
<nav class="medical-rtp-profile-quick-nav" aria-label="RTP guide quick sections">
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "summary"))}">Summary</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "red-flags"))}">Red flags</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "criteria"))}">Criteria</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "exercises"))}">Exercises</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "training"))}">Training</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "match"))}">Match</a>
<a href="#${escapeHtml(getRtpProfileAnchorId(profileId, "full-guide"))}">37 sections</a>
</nav>
`;
  };

  const renderRtpProfileDecisionStrip = (profile = {}) => `
<section class="medical-rtp-profile-decision-strip" aria-label="RTP guide decision support">
<div>
<span>Library guide</span>
<strong>Club-neutral knowledge</strong>
<small>No player data is stored or selected inside the Library.</small>
</div>
<div>
<span>Gate focus</span>
<strong>${escapeHtml(getFirstRtpGuideItem(profile.criteria, "Set player-specific gate criteria."))}</strong>
</div>
<div>
<span>Next field exposure</span>
<strong>${escapeHtml(getFirstRtpGuideItem(profile.trainingChecklist, "Set the next tolerated field exposure."))}</strong>
</div>
<div>
<span>Hold trigger</span>
<strong>${escapeHtml(getFirstRtpGuideItem(profile.redFlags, "Hold if symptoms or risk signals increase."))}</strong>
</div>
</section>
`;

  const renderRtpGoldStandardSections = (sections = []) => `
<section class="medical-rtp-gold-standard-sections" aria-label="Gold Standard RTP profile sections">
<header>
<span>Gold Standard Template</span>
<strong>${sections.length} sections</strong>
</header>
${sections
  .map(
    (section, index) => `
<details${index < 4 ? " open" : ""}>
<summary><span>${index + 1}</span>${escapeHtml(section.title)}</summary>
<p>${escapeHtml(section.content)}</p>
${Array.isArray(section.items) && section.items.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
</details>
`
  )
  .join("")}
</section>
`;

  const renderRtpProfileDialogContent = (profile = {}) => {
    return `
<header>
<div>
<span>Medical RTP guide</span>
<h3 id="medical-rtp-profile-title">${escapeHtml(profile.name || "RTP injury guide")}</h3>
${renderRtpProfileHeaderMeta(profile)}
</div>
<button type="button" class="medical-rtp-profile-modal-close" data-medical-close-rtp-profile aria-label="Close ${escapeHtml(profile.name || "RTP")} guide">Close</button>
</header>
<div class="medical-rtp-profile-dialog-body">
<div class="medical-rtp-profile-body">
${renderRtpProfileQuickNav(profile)}
<section class="medical-rtp-profile-summary" id="${escapeHtml(getRtpProfileAnchorId(profile.id, "summary"))}">
<div>
<h3>Quick Summary</h3>
<p>${escapeHtml(profile.summary)}</p>
</div>
<div>
<h3>Medical-safe Evidence</h3>
<p><strong>Evidence:</strong> ${escapeHtml(profile.evidence)}</p>
<p><strong>Experience/consensus:</strong> ${escapeHtml(profile.experience)}</p>
</div>
</section>
<div class="medical-rtp-profile-tags">
${renderRtpGuideTags(profile.riskTags || [], 5)}
</div>
${renderRtpProfileDecisionStrip(profile)}
<div class="medical-rtp-profile-sections">
${renderRtpGuideList("Red flags", profile.redFlags || [], getRtpProfileAnchorId(profile.id, "red-flags"))}
${renderRtpGuideList("Progression criteria", profile.criteria || [], getRtpProfileAnchorId(profile.id, "criteria"))}
<section id="${escapeHtml(getRtpProfileAnchorId(profile.id, "exercises"))}">
<h4>Exercise Bank starters</h4>
${renderRtpExerciseCards(profile, 6)}
</section>
${renderRtpGuideList("Return-to-training checklist", profile.trainingChecklist || [], getRtpProfileAnchorId(profile.id, "training"))}
${renderRtpGuideList("Return-to-match checklist", profile.matchChecklist || [], getRtpProfileAnchorId(profile.id, "match"))}
${renderRtpGuideList("Common mistakes / risks", profile.mistakes || [], getRtpProfileAnchorId(profile.id, "risks"))}
</div>
<div id="${escapeHtml(getRtpProfileAnchorId(profile.id, "full-guide"))}">
${renderRtpGoldStandardSections(profile.goldStandardSections || [])}
</div>
<div class="medical-rtp-profile-actions medical-rtp-profile-actions-info">
<div>
<strong>To build a player program</strong>
<small>Open Active Cases or the player's Medical Plan, choose this guide, then save the case-specific program there.</small>
</div>
<b>Knowledge only</b>
</div>
</div>
</div>
`;
  };

  const renderPlanGuidePreviewContent = (profile = {}) => {
    const previewItems = [
      ["Phases", profile.phases?.[0] || "No phase starter set"],
      ["Load focus", profile.loadText?.[0] || "No load starter set"],
      ["Gate", profile.criteria?.[0] || "No gate criterion set"],
      ["Exercise", getRtpProfileExercises(profile, 1)[0]?.name || "No exercise starter mapped"],
      ["Next exposure", profile.trainingChecklist?.[0] || "No next exposure set"],
      ["Hold rule", profile.redFlags?.[0] || "No hold rule set"],
    ];
    return `
<span>Starter preview</span>
<strong>${escapeHtml(profile.name || "RTP guide")} -> Medical Plan draft</strong>
<ul>
${previewItems.map(([label, value]) => `<li><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></li>`).join("")}
</ul>
<div class="medical-rtp-exercise-preview">
<span>Exercise Bank starters</span>
${renderRtpExerciseCards(profile, 3)}
</div>
<small>Loading the guide does not save automatically. Medical must individualize and save the player-specific plan.</small>
`;
  };

  const updateMedicalPlanGuidePreview = (guideSelect) => {
    const form = guideSelect?.closest?.("#medicalInjuryPlanForm");
    const preview = form?.querySelector?.("[data-medical-rtp-guide-preview]");
    const profile = actions.getMedicalRtpLibraryProfile?.(guideSelect?.value);
    if (!preview || !profile) return;
    preview.innerHTML = renderPlanGuidePreviewContent(profile);
  };

  const closeMedicalRtpGuideDraftModal = () => {
    queryWorkspaceAll(workspaceElement, "[data-medical-rtp-guide-draft-modal]").forEach((modal) => {
      modal.hidden = true;
      modal.setAttribute?.("aria-hidden", "true");
    });
  };

  const openMedicalRtpProfileModal = (profileId) => {
    const targetProfileId = String(profileId || "");
    const modal =
      queryWorkspaceAll(workspaceElement, "[data-medical-rtp-profile-modal]").find(
        (candidate) => candidate.dataset?.medicalRtpProfileModal === targetProfileId
      ) ?? queryWorkspace(workspaceElement, "[data-medical-rtp-profile-modal]");
    if (!modal) return;
    const profile = actions.getMedicalRtpLibraryProfile?.(targetProfileId);
    const content = modal.querySelector?.("[data-medical-rtp-profile-dialog-content]");
    if (profile && content) {
      content.innerHTML = renderRtpProfileDialogContent(profile);
    }
    closeMedicalRtpProfileModal();
    modal.hidden = false;
    modal.removeAttribute?.("aria-hidden");
    modal.querySelector?.("[role='dialog']")?.focus?.();
  };

  const openMedicalRtpGuideDraftModal = () => {
    const modal = queryWorkspace(workspaceElement, "[data-medical-rtp-guide-draft-modal]");
    if (!modal) return;
    closeMedicalRtpProfileModal();
    modal.hidden = false;
    modal.removeAttribute?.("aria-hidden");
    modal.querySelector?.("[role='dialog']")?.focus?.();
  };

  const getMedicalRtpGuideTemplateText = () => [
    "RTP Injury Guide Draft",
    "",
    "Metadata",
    "- Injury name:",
    "- System / body area:",
    "- Movement plane:",
    "- Symptoms / risk tags:",
    "- Evidence level:",
    "",
    "1. Overview",
    "2. Mechanism of Injury",
    "3. Risk Factors",
    "4. Clinical Presentation",
    "5. Assessment Protocols",
    "6. Differential Diagnosis",
    "7. Red Flags",
    "8. Imaging Considerations",
    "9. Rehabilitation Principles",
    "10. Exercise Bank",
    "11. Running Progression",
    "12. Sprint Progression",
    "13. Change of Direction Progression",
    "14. Football Integration",
    "15. Return to Running Criteria",
    "16. Return to Training Criteria",
    "17. Return to Performance Criteria",
    "18. Monitoring Metrics",
    "19. GPS Benchmarks",
    "20. Strength Benchmarks",
    "21. Common Mistakes",
    "22. Case Study Example",
    "23. Research Summary",
    "24. Evidence Level",
    "25. Coach Summary",
    "26. Medical Notes",
    "27. Performance Notes",
    "28. Position-Specific Football Demands",
    "29. Women's Football Considerations",
    "30. RTP Decision Tree",
    "31. Objective RTP Testing Battery",
    "32. Match Return Strategy",
    "33. Worst Case Scenario Analysis",
    "34. NWSL / Elite Women's Football Context",
    "35. RTP Risk Score",
    "36. RTP Meeting Summary",
    "37. Return-to-Performance Analytics",
  ].join("\n");

  const copyMedicalRtpGuideTemplate = () => {
    const writeText = win.navigator?.clipboard?.writeText;
    if (typeof writeText === "function") {
      void writeText.call(win.navigator.clipboard, getMedicalRtpGuideTemplateText())
        .then(() => renderWorkspace("RTP injury guide template copied."))
        .catch(() => renderWorkspace("RTP injury guide template could not be copied."));
      return;
    }
    renderWorkspace("RTP injury guide template is ready once clipboard access is available.");
  };

  const showMoreMedicalHistoryRows = (showMoreButton) => {
    const table = showMoreButton.closest?.("[data-medical-history-table]") ?? queryWorkspace(workspaceElement, "[data-medical-history-table]");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll?.("[data-medical-history-row]") ?? []);
    const pageSize = Number(showMoreButton.dataset?.medicalHistoryPageSize || table.dataset?.medicalHistoryPageSize || 25) || 25;
    const visibleCount = rows.filter((row) => !row.hidden).length;
    const nextVisibleCount = Math.min(rows.length, visibleCount + pageSize);
    rows.forEach((row, index) => {
      const isVisible = index < nextVisibleCount;
      row.hidden = !isVisible;
      row.dataset.medicalHistoryRowVisible = isVisible ? "true" : "false";
    });
    const status = table.querySelector?.("[data-medical-history-page-status]");
    if (status) status.textContent = `Showing ${nextVisibleCount} of ${rows.length}`;
    if (nextVisibleCount >= rows.length) showMoreButton.hidden = true;
  };

  const onClick = async (event) => {
    const closeModalButton = event.target.closest("[data-medical-close-modal]");
    if (closeModalButton) {
      callOptional(actions.closeMedicalPlayerModal);
      return;
    }
    const modalTabButton = event.target.closest("[data-medical-modal-tab]");
    if (modalTabButton) {
      setStateValue(state, "MedicalPlayerModalTab", actions.normalizeMedicalPlayerModalTab?.(modalTabButton.dataset.medicalModalTab));
      renderWorkspace();
      return;
    }
    const recommendationPreset = event.target.closest("[data-medical-recommendation-preset]");
    if (recommendationPreset) {
      const form = recommendationPreset.closest("[data-medical-recommendation-form]");
      const participationInput = form?.querySelector("#medicalRecommendationParticipation");
      const statusInput = form?.querySelector("#medicalRecommendationStatus");
      const rtpSelect = form?.querySelector("#medicalRecommendationRtpPhase");
      const dateInput = form?.querySelector("[name='date']");
      const preview = form?.querySelector("[data-medical-recommendation-preview]") ?? queryWorkspace(workspaceElement, "[data-medical-recommendation-preview]");
      const selectedDate = getMedicalState(state).selectedDate;
      const participation = actions.normalizeMedicalParticipation?.(recommendationPreset.dataset.medicalParticipation);
      const status = actions.getMedicalStatusOption?.(recommendationPreset.dataset.medicalStatus);
      const activityContext = actions.getMedicalRecommendationActivityContext?.(dateInput?.value || selectedDate);
      const phase = actions.getMedicalRtpPhaseOption?.(actions.getMedicalRtpPhaseForRecommendation?.(status.key, participation, activityContext.type));
      const displayStatus = actions.getMedicalStatusOptionForDate?.(status.key, dateInput?.value || selectedDate, phase.key);
      if (participationInput && statusInput) {
        participationInput.value = String(participation);
        statusInput.value = status.key;
        if (rtpSelect) rtpSelect.value = phase.key;
        form.querySelectorAll("[data-medical-recommendation-preset]").forEach((button) => {
          button.classList.toggle("is-selected", button === recommendationPreset);
        });
        if (preview) preview.textContent = `${participation}% / ${displayStatus.label}`;
      }
      return;
    }
    const actualPreset = event.target.closest("[data-medical-actual-value]");
    if (actualPreset) {
      const form = actualPreset.closest("[data-medical-recommendation-form]");
      const actualInput = form?.querySelector("#medicalActualParticipation");
      if (actualInput) {
        actualInput.value = actualPreset.dataset.medicalActualValue;
        form.querySelectorAll("[data-medical-actual-value]").forEach((button) => {
          button.classList.toggle("is-selected", button === actualPreset);
        });
      }
      return;
    }
    const durationPreset = event.target.closest("[data-medical-duration-preset]");
    if (durationPreset) {
      const form = durationPreset.closest("#medicalInjuryPlanForm");
      const durationInput = form?.querySelector("[name='duration']");
      const durationUnitInput = form?.querySelector("[name='durationUnit']");
      if (durationInput && durationUnitInput) {
        durationInput.value = durationPreset.dataset.medicalDuration;
        durationUnitInput.value = durationPreset.dataset.medicalDurationUnit;
        form.querySelectorAll("[data-medical-duration-preset]").forEach((button) => {
          button.classList.toggle("is-selected", button === durationPreset);
        });
        actions.persistMedicalInjuryPlanDraftFromForm?.(form);
      }
      return;
    }
    const copyHandoverButton = event.target.closest("[data-medical-copy-handover]");
    if (copyHandoverButton) {
      callOptional(actions.copyMedicalCoachHandoverToClipboard);
      return;
    }
    const quickClearButton = event.target.closest("[data-medical-quick-clear]");
    if (quickClearButton) {
      event.preventDefault();
      event.stopPropagation();
      if (!canEdit()) return;
      const result = actions.clearMedicalQuickRecommendation?.(
        quickClearButton.dataset.medicalQuickClear
      ) ?? {};
      const archivedRecords = Array.isArray(result.archivedRecords)
        ? result.archivedRecords
        : result.archivedRecord
          ? [result.archivedRecord]
          : [];
      archivedRecords.forEach((archivedRecord) => {
        recordSync("record-archived", {
          playerId: archivedRecord.playerId,
          recordId: archivedRecord.id,
          archivedAt: archivedRecord.archivedAt,
          idempotencyKey: `record-archived:${archivedRecord.id}:${archivedRecord.archivedAt || "quick-clear"}`,
        });
      });
      const playerName = result.player?.name || "Player";
      renderWorkspace(
        result.cleared
          ? `${playerName}: recommendation cleared.`
          : result.blockReason || "Recommendation could not be cleared."
      );
      return;
    }
    const quickRecommendationButton = event.target.closest("[data-medical-quick-recommend]");
    if (quickRecommendationButton) {
      event.preventDefault();
      event.stopPropagation();
      if (!canEdit()) return;
      const result = actions.applyMedicalQuickRecommendation?.(
        quickRecommendationButton.dataset.medicalQuickRecommend,
        quickRecommendationButton.dataset.medicalQuickParticipation
      ) ?? {};
      if (result.record) {
        recordSync("recommendation-saved", {
          playerId: result.record.playerId,
          record: result.record,
          idempotencyKey: `recommendation-saved:${result.record.id}`,
        });
      }
      const archivedRecords = Array.isArray(result.archivedRecords)
        ? result.archivedRecords
        : result.archivedRecord
          ? [result.archivedRecord]
          : [];
      archivedRecords.forEach((archivedRecord) => {
        recordSync("record-archived", {
          playerId: archivedRecord.playerId,
          recordId: archivedRecord.id,
          archivedAt: archivedRecord.archivedAt,
          idempotencyKey: `record-archived:${archivedRecord.id}:${archivedRecord.archivedAt || "quick-toggle"}`,
        });
      });
      const playerName = result.player?.name || "Player";
      renderWorkspace(
        result.record
          ? `${playerName}: ${result.record.participation}% recommendation saved.`
          : result.unchanged
            ? `${playerName}: recommendation already set.`
            : result.blockReason || "Recommendation could not be saved."
      );
      return;
    }
    const bulkToggleButton = event.target.closest("[data-medical-bulk-toggle]");
    if (bulkToggleButton && canEdit()) {
      event.preventDefault();
      event.stopPropagation();
      actions.toggleMedicalBulkPlayer?.(bulkToggleButton.dataset.medicalBulkToggle);
      return;
    }
    const bulkMenuToggleButton = event.target.closest("[data-medical-bulk-menu-toggle]");
    if (bulkMenuToggleButton && canEdit()) {
      setStateValue(state, "MedicalBulkRecommendationOpen", !getStateValue(state, "MedicalBulkRecommendationOpen", false));
      renderWorkspace();
      return;
    }
    const bulkSelectVisibleButton = event.target.closest("[data-medical-bulk-select-visible]");
    if (bulkSelectVisibleButton && canEdit()) {
      actions.setMedicalBulkSelection?.(actions.getFilteredMedicalPlayers?.().map((player) => player.id));
      return;
    }
    const bulkSelectNotSetButton = event.target.closest("[data-medical-bulk-select-not-set]");
    if (bulkSelectNotSetButton && canEdit()) {
      const form = bulkSelectNotSetButton.closest("#medicalBulkRecommendationForm");
      const dateValue = form?.querySelector("[data-medical-bulk-date]")?.value;
      actions.setMedicalBulkNotSetSelection?.(dateValue, actions.getFilteredMedicalPlayers?.());
      return;
    }
    const bulkClearButton = event.target.closest("[data-medical-bulk-clear]");
    if (bulkClearButton && canEdit()) {
      actions.setMedicalBulkSelection?.([]);
      return;
    }
    const operationsTabButton = event.target.closest("[data-medical-ops-tab]");
    if (operationsTabButton) {
      setStateValue(state, "MedicalOperationsTab", actions.normalizeMedicalOperationsTab?.(operationsTabButton.dataset.medicalOpsTab));
      renderWorkspace();
      return;
    }
    const historyShowMoreButton = event.target.closest("[data-medical-history-show-more]");
    if (historyShowMoreButton) {
      event.preventDefault();
      showMoreMedicalHistoryRows(historyShowMoreButton);
      return;
    }
    const openExerciseOverlayButton = event.target.closest("[data-medical-rtp-exercise-open]");
    if (openExerciseOverlayButton) {
      event.preventDefault();
      openMedicalRtpExerciseOverlay();
      return;
    }
    const closeExerciseOverlayButton = event.target.closest("[data-medical-rtp-exercise-close]");
    if (closeExerciseOverlayButton) {
      event.preventDefault();
      closeMedicalRtpExerciseOverlay();
      return;
    }
    const exerciseOverlay = event.target.closest("[data-medical-rtp-exercise-overlay]");
    if (exerciseOverlay && event.target === exerciseOverlay) {
      event.preventDefault();
      closeMedicalRtpExerciseOverlay();
      return;
    }
    const closeRtpGuideDraftButton = event.target.closest("[data-medical-close-rtp-guide-draft]");
    if (closeRtpGuideDraftButton) {
      event.preventDefault();
      closeMedicalRtpGuideDraftModal();
      return;
    }
    const openRtpGuideDraftButton = event.target.closest("[data-medical-open-rtp-guide-draft]");
    if (openRtpGuideDraftButton) {
      event.preventDefault();
      openMedicalRtpGuideDraftModal();
      return;
    }
    const copyRtpGuideTemplateButton = event.target.closest("[data-medical-copy-rtp-guide-template]");
    if (copyRtpGuideTemplateButton) {
      event.preventDefault();
      copyMedicalRtpGuideTemplate();
      return;
    }
    const closeRtpProfileButton = event.target.closest("[data-medical-close-rtp-profile]");
    if (closeRtpProfileButton) {
      event.preventDefault();
      closeMedicalRtpProfileModal();
      return;
    }
    const openRtpProfileButton = event.target.closest("[data-medical-open-rtp-profile]");
    if (openRtpProfileButton) {
      event.preventDefault();
      openMedicalRtpProfileModal(openRtpProfileButton.dataset.medicalOpenRtpProfile);
      return;
    }
    const loadRtpGuideButton = event.target.closest("[data-medical-plan-load-rtp-guide]");
    if (loadRtpGuideButton && canEdit()) {
      event.preventDefault();
      const form = loadRtpGuideButton.closest("#medicalInjuryPlanForm");
      const profileSelect = form?.querySelector?.("[data-medical-plan-rtp-guide]");
      const currentDraft = actions.getMedicalInjuryPlanFormDraft?.(form) || {};
      const playerId = currentDraft.playerId || getMedicalState(state).selectedPlayerId;
      const guideDraft = currentDraft.planId
        ? actions.getMedicalRtpLibraryStarterDraftForPlan?.(profileSelect?.value, currentDraft.planId)
        : actions.getMedicalRtpLibraryStarterDraft?.(profileSelect?.value, playerId);
      if (!guideDraft?.playerId) {
        renderWorkspace("RTP guide could not be loaded. Select a player and guide first.");
        return;
      }
      const mergedDraft = {
        ...guideDraft,
        planId: currentDraft.planId || guideDraft.planId,
        startDate: currentDraft.startDate || guideDraft.startDate,
        reviewDate: currentDraft.reviewDate || guideDraft.reviewDate,
        comment: currentDraft.comment || guideDraft.comment,
        coachNote: currentDraft.coachNote || guideDraft.coachNote,
        shareWithCoach: Boolean(currentDraft.shareWithCoach),
      };
      actions.setMedicalInjuryPlanDraft?.(guideDraft.playerId, mergedDraft);
      setStateValue(state, "MedicalSelectedPlayerId", guideDraft.playerId);
      setStateValue(state, "MedicalPlayerModalOpen", true);
      setStateValue(state, "MedicalPlayerModalTab", "plan");
      renderWorkspace(`${guideDraft.rtpLibraryProfileName || guideDraft.injuryType} guide loaded into Medical Plan draft. Review before saving.`);
      return;
    }
    const applyRtpStarterButton = event.target.closest("[data-medical-apply-rtp-starter]");
    if (applyRtpStarterButton && canEdit()) {
      event.preventDefault();
      event.stopPropagation();
      const playerId = applyRtpStarterButton.dataset.medicalPlayerId || getMedicalState(state).selectedPlayerId;
      const draft = actions.getMedicalRtpLibraryStarterDraft?.(applyRtpStarterButton.dataset.medicalRtpProfileId, playerId);
      if (!draft?.playerId) {
        renderWorkspace("RTP Library starter could not be applied. Select a player first.");
        return;
      }
      actions.setMedicalInjuryPlanDraft?.(draft.playerId, draft);
      setStateValue(state, "MedicalSelectedPlayerId", draft.playerId);
      setStateValue(state, "MedicalPlayerModalOpen", true);
      setStateValue(state, "MedicalPlayerModalTab", "plan");
      renderWorkspace(`${draft.injuryType} starter ready in Medical Plan.`);
      return;
    }
    const selectPlayerCard = event.target.closest("[data-medical-select-player]");
    if (selectPlayerCard) {
      actions.openMedicalPlayerModal?.(selectPlayerCard.dataset.medicalSelectPlayer);
      return;
    }
    const shiftDateButton = event.target.closest("[data-medical-shift-date]");
    if (shiftDateButton) {
      actions.shiftMedicalSelectedDate?.(Number(shiftDateButton.dataset.medicalShiftDate) || 0);
      return;
    }
    const todayButton = event.target.closest("[data-medical-today]");
    if (todayButton) {
      actions.setMedicalSelectedDate?.(actions.formatScheduleDateValue?.(new Date()));
      return;
    }
    const setDateButton = event.target.closest("[data-medical-set-date]");
    if (setDateButton) {
      actions.setMedicalSelectedDate?.(setDateButton.dataset.medicalSetDate);
      return;
    }
    const deleteRecordButton = event.target.closest("[data-medical-delete-record]");
    if (deleteRecordButton && canEdit()) {
      const confirmed = await confirmPlatformAction({
        eyebrow: "Medical Room",
        title: "Archive log entry?",
        message: "Archive this medical log entry? It will remain in protected clinical history.",
        confirmLabel: "Archive",
        tone: "warning",
        win,
      });
      if (confirmed) {
        const recordId = deleteRecordButton.dataset.medicalDeleteRecord;
        const medicalState = getMedicalState(state);
        const record = medicalState.records.find((entry) => entry.id === recordId) ?? null;
        const archivedRecord = actions.removeMedicalRecord?.(recordId);
        recordSync("record-archived", {
          playerId: record?.playerId || "",
          recordId,
          record: archivedRecord || record,
          idempotencyKey: `record-archived:${recordId}:${archivedRecord?.archivedAt || Date.now()}`,
        });
        renderWorkspace("Log entry archived in protected clinical history.");
      }
      return;
    }
    const deleteInjuryPlanButton = event.target.closest("[data-medical-delete-injury-plan]");
    if (deleteInjuryPlanButton && canEdit()) {
      const confirmed = await confirmPlatformAction({
        eyebrow: "Medical Room",
        title: "Archive availability plan?",
        message: "Archive this availability plan? It will remain in protected clinical history.",
        confirmLabel: "Archive",
        tone: "warning",
        win,
      });
      if (confirmed) {
        const planId = deleteInjuryPlanButton.dataset.medicalDeleteInjuryPlan;
        const medicalState = getMedicalState(state);
        const plan = medicalState.injuryPlans.find((entry) => entry.id === planId) ?? null;
        const archivedPlan = actions.removeMedicalInjuryPlan?.(planId);
        recordSync("availability-plan-archived", {
          playerId: plan?.playerId || "",
          planId,
          plan: archivedPlan || plan,
          idempotencyKey: `availability-plan-archived:${planId}:${archivedPlan?.archivedAt || Date.now()}`,
        });
        renderWorkspace("Availability plan archived in protected clinical history.");
      }
      return;
    }
    const editInjuryPlanButton = event.target.closest("[data-medical-edit-injury-plan]");
    if (editInjuryPlanButton && canEdit()) {
      const planId = editInjuryPlanButton.dataset.medicalEditInjuryPlan;
      const medicalState = getMedicalState(state);
      const plan = medicalState.injuryPlans.find((entry) => entry.id === planId && !actions.isMedicalItemArchived?.(entry));
      if (plan) {
        event.preventDefault();
        event.stopPropagation();
        actions.setMedicalInjuryPlanDraftFromPlan?.(plan);
        setStateValue(state, "MedicalSelectedPlayerId", plan.playerId);
        setStateValue(state, "MedicalPlayerModalOpen", true);
        setStateValue(state, "MedicalPlayerModalTab", "plan");
        const rtpFocusKey = editInjuryPlanButton.dataset.medicalRtpFocus || "";
        renderWorkspace("Medical plan ready to edit.", rtpFocusKey ? {
          focusMedicalRtpPlan: true,
          rtpFocusPlanId: plan.id,
          rtpFocusKey,
          rtpFocusGroupKey: editInjuryPlanButton.dataset.medicalRtpFocusGroup || "",
          rtpFocusIndex: editInjuryPlanButton.dataset.medicalRtpFocusIndex || "",
        } : {});
      }
      return;
    }
    const cancelInjuryPlanEditButton = event.target.closest("[data-medical-cancel-injury-plan-edit]");
    if (cancelInjuryPlanEditButton && canEdit()) {
      const form = cancelInjuryPlanEditButton.closest("#medicalInjuryPlanForm");
      const playerId = form?.querySelector("[name='playerId']")?.value || getMedicalState(state).selectedPlayerId;
      actions.clearMedicalInjuryPlanDraft?.(playerId);
      renderWorkspace("Plan edit cancelled.");
      return;
    }
    const removePlayerButton = event.target.closest("[data-medical-remove-player]");
    if (removePlayerButton && canEdit()) {
      const medicalState = getMedicalState(state);
      const player = medicalState.players.find((candidate) => candidate.id === removePlayerButton.dataset.medicalRemovePlayer);
      const confirmed = player
        ? await confirmPlatformAction({
            eyebrow: "Medical Room",
            title: "Archive player?",
            message: `Archive ${player.name} from Medical Room? Medical history will remain protected.`,
            confirmLabel: "Archive",
            tone: "warning",
            win,
          })
        : false;
      if (player && confirmed) {
        const archivedPlayer = actions.removeMedicalPlayer?.(player.id);
        recordSync("player-archived", {
          playerId: player.id,
          player: archivedPlayer || player,
          idempotencyKey: `player-archived:${player.id}:${archivedPlayer?.archivedAt || Date.now()}`,
        });
        setStateValue(state, "MedicalPlayerModalOpen", false);
        renderWorkspace("Player archived with protected medical history.");
      }
    }
  };

  const onKeydown = (event) => {
    if (event.key === "Escape" && queryWorkspace(workspaceElement, "[data-medical-rtp-exercise-overlay]:not([hidden])")) {
      event.preventDefault();
      closeMedicalRtpExerciseOverlay();
      return;
    }
    if (event.key === "Escape" && queryWorkspace(workspaceElement, "[data-medical-rtp-guide-draft-modal]:not([hidden])")) {
      event.preventDefault();
      closeMedicalRtpGuideDraftModal();
      return;
    }
    if (event.key === "Escape" && queryWorkspace(workspaceElement, "[data-medical-rtp-profile-modal]:not([hidden])")) {
      event.preventDefault();
      closeMedicalRtpProfileModal();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("button, input, select, textarea, label")) return;
    const selectPlayerCard = event.target.closest("[data-medical-select-player]");
    if (!selectPlayerCard) return;
    event.preventDefault();
    actions.openMedicalPlayerModal?.(selectPlayerCard.dataset.medicalSelectPlayer);
  };

  const onInput = (event) => {
    if (event.target.closest("[data-medical-rtp-library-search]")) {
      filterMedicalRtpLibrary();
      return;
    }
    if (event.target.closest("[data-medical-rtp-exercise-search]")) {
      filterMedicalRtpExerciseCatalog();
      return;
    }
    const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
    if (injuryPlanForm) {
      actions.persistMedicalInjuryPlanDraftFromForm?.(injuryPlanForm);
      return;
    }
    const searchInput = event.target.closest("[data-medical-roster-search]");
    if (!searchInput) return;
    const selectionStart = searchInput.selectionStart ?? searchInput.value.length;
    const selectionEnd = searchInput.selectionEnd ?? selectionStart;
    setStateValue(state, "MedicalRosterSearchQuery", searchInput.value);
    renderWorkspace("", { focusRosterSearch: true, searchSelectionStart: selectionStart, searchSelectionEnd: selectionEnd });
  };

  const onChange = (event) => {
    if (event.target.closest("[data-medical-rtp-library-filter]")) {
      filterMedicalRtpLibrary();
      return;
    }
    if (event.target.closest("[data-medical-rtp-exercise-filter]")) {
      filterMedicalRtpExerciseCatalog();
      return;
    }
    const planRtpGuide = event.target.closest("[data-medical-plan-rtp-guide]");
    if (planRtpGuide) {
      updateMedicalPlanGuidePreview(planRtpGuide);
    }
    const datePicker = event.target.closest("[data-medical-date-picker]");
    if (datePicker) {
      actions.setMedicalSelectedDate?.(datePicker.value);
      return;
    }
    const statusFilter = event.target.closest("[data-medical-status-filter]");
    if (statusFilter) {
      setStateValue(state, "MedicalStatusFilter", statusFilter.value);
      renderWorkspace();
      return;
    }
    const historyDateFilter = event.target.closest("[data-medical-history-date-filter]");
    if (historyDateFilter) {
      setStateValue(state, "MedicalHistoryDateFilter", historyDateFilter.value || "all");
      renderWorkspace();
      return;
    }
    const historyPlayerFilter = event.target.closest("[data-medical-history-player-filter]");
    if (historyPlayerFilter) {
      setStateValue(state, "MedicalHistoryPlayerFilter", historyPlayerFilter.value || "all");
      renderWorkspace();
      return;
    }
    const bulkDate = event.target.closest("[data-medical-bulk-date]");
    if (bulkDate) {
      actions.updateMedicalBulkActivityControls?.(bulkDate.closest("#medicalBulkRecommendationForm"));
      return;
    }
    const recommendationStatus = event.target.closest("#medicalRecommendationStatus");
    if (recommendationStatus) {
      const form = recommendationStatus.closest("[data-medical-recommendation-form]");
      const participationSelect = form?.querySelector("#medicalRecommendationParticipation") ?? queryWorkspace(workspaceElement, "#medicalRecommendationParticipation");
      const preview = form?.querySelector("[data-medical-recommendation-preview]") ?? queryWorkspace(workspaceElement, "[data-medical-recommendation-preview]");
      const dateInput = form?.querySelector("[name='date']");
      const status = actions.getMedicalStatusOption?.(recommendationStatus.value);
      if (participationSelect && status.defaultParticipation !== null) participationSelect.value = String(status.defaultParticipation);
      if (preview) {
        const participation = actions.normalizeMedicalParticipation?.(participationSelect?.value, status.defaultParticipation ?? 100);
        preview.textContent = `${participation}% / ${actions.getMedicalStatusOptionForDate?.(status.key, dateInput?.value || getMedicalState(state).selectedDate).label}`;
      }
    }
    const recommendationRtpPhase = event.target.closest("#medicalRecommendationRtpPhase");
    if (recommendationRtpPhase) {
      const form = recommendationRtpPhase.closest("[data-medical-recommendation-form]");
      const participationInput = form?.querySelector("#medicalRecommendationParticipation");
      const statusInput = form?.querySelector("#medicalRecommendationStatus");
      const dateInput = form?.querySelector("[name='date']");
      const preview = form?.querySelector("[data-medical-recommendation-preview]") ?? queryWorkspace(workspaceElement, "[data-medical-recommendation-preview]");
      const phase = actions.getMedicalRtpPhaseOption?.(recommendationRtpPhase.value);
      if (participationInput && statusInput) {
        participationInput.value = String(phase.participation);
        statusInput.value = phase.status;
        form.querySelectorAll("[data-medical-recommendation-preset]").forEach((button) => {
          button.classList.toggle("is-selected", actions.normalizeMedicalParticipation?.(button.dataset.medicalParticipation) === phase.participation);
        });
        if (preview) preview.textContent = `${phase.participation}% / ${actions.getMedicalStatusOptionForDate?.(phase.status, dateInput?.value || getMedicalState(state).selectedDate, phase.key).label}`;
      }
      return;
    }
    const bulkParticipation = event.target.closest("[data-medical-bulk-participation]");
    if (bulkParticipation) {
      const form = bulkParticipation.closest("#medicalBulkRecommendationForm");
      const phaseSelect = form?.querySelector("[data-medical-bulk-rtp-phase]");
      const phasePreview = form?.querySelector("[data-medical-bulk-rtp-preview]");
      const dateValue = form?.querySelector("[data-medical-bulk-date]")?.value || getMedicalState(state).selectedDate;
      const activityContext = actions.getMedicalRecommendationActivityContext?.(dateValue);
      const participation = actions.normalizeMedicalParticipation?.(bulkParticipation.value, 75);
      const phaseKey = actions.getMedicalRtpPhaseForRecommendation?.(actions.getMedicalStatusForParticipation?.(participation), participation, activityContext.type);
      if (phaseSelect) phaseSelect.value = phaseKey;
      if (phasePreview) {
        if ("value" in phasePreview) phasePreview.value = actions.getMedicalRtpPhaseOption?.(phaseKey).label;
        else phasePreview.textContent = actions.getMedicalRtpPhaseOption?.(phaseKey).label;
      }
      return;
    }
    const bulkRtpPhase = event.target.closest("[data-medical-bulk-rtp-phase]");
    if (bulkRtpPhase) {
      const form = bulkRtpPhase.closest("#medicalBulkRecommendationForm");
      const participationSelect = form?.querySelector("[data-medical-bulk-participation]");
      const phase = actions.getMedicalRtpPhaseOption?.(bulkRtpPhase.value);
      if (participationSelect) participationSelect.value = String(phase.participation);
      return;
    }
    const planRtpPhase = event.target.closest("[data-medical-plan-rtp-phase]");
    if (planRtpPhase) {
      const form = planRtpPhase.closest("#medicalInjuryPlanForm");
      const statusSelect = form?.querySelector("[name='status']");
      const participationSelect = form?.querySelector("[data-medical-plan-participation]");
      const phase = actions.getMedicalRtpPhaseOption?.(planRtpPhase.value);
      if (statusSelect) statusSelect.value = phase.status;
      if (participationSelect) participationSelect.value = String(phase.participation);
    }
    const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
    if (injuryPlanForm) {
      actions.persistMedicalInjuryPlanDraftFromForm?.(injuryPlanForm);
      return;
    }
  };

  const onSubmit = (event) => {
    const rtpCaseLinkerForm = event.target.closest("[data-medical-rtp-case-linker-form]");
    if (rtpCaseLinkerForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const profileSelect = rtpCaseLinkerForm.querySelector?.("[data-medical-rtp-case-profile]");
      const draft = actions.getMedicalRtpLibraryStarterDraftForPlan?.(
        profileSelect?.value,
        rtpCaseLinkerForm.dataset.medicalPlanId
      );
      if (!draft?.playerId) {
        renderWorkspace("RTP Library starter could not be linked to this active case.");
        return;
      }
      actions.setMedicalInjuryPlanDraft?.(draft.playerId, draft);
      setStateValue(state, "MedicalSelectedPlayerId", draft.playerId);
      setStateValue(state, "MedicalPlayerModalOpen", true);
      setStateValue(state, "MedicalPlayerModalTab", "plan");
      renderWorkspace(`${draft.rtpLibraryProfileName || draft.injuryType} starter opened in Medical Plan draft. Review and save before it becomes active.`);
      return;
    }
    const rtpLibraryControls = event.target.closest("[data-medical-rtp-library-controls]");
    if (rtpLibraryControls) {
      event.preventDefault();
      filterMedicalRtpLibrary();
      return;
    }
    const historyFilterForm = event.target.closest("[data-medical-history-filter-form]");
    if (historyFilterForm) {
      event.preventDefault();
      const searchInput = historyFilterForm.querySelector?.("[data-medical-history-search]");
      const dateFilter = historyFilterForm.querySelector?.("[data-medical-history-date-filter]");
      const playerFilter = historyFilterForm.querySelector?.("[data-medical-history-player-filter]");
      setStateValue(state, "MedicalHistorySearchQuery", searchInput?.value || "");
      setStateValue(state, "MedicalHistoryDateFilter", dateFilter?.value || "all");
      setStateValue(state, "MedicalHistoryPlayerFilter", playerFilter?.value || "all");
      renderWorkspace();
      return;
    }
    const governanceForm = event.target.closest("#medicalGovernanceForm");
    if (governanceForm) {
      event.preventDefault();
      const saved = actions.updateMedicalGovernancePolicy?.(actions.getPlatformFormValues?.(governanceForm));
      if (saved) {
        const medicalState = getMedicalState(state);
        recordSync("governance-saved", { policy: medicalState.policy, idempotencyKey: `governance-saved:${medicalState.policy?.updatedAt || Date.now()}` });
      }
      renderWorkspace(saved ? "Medical governance policy saved." : "Medical governance policy could not be saved.");
      return;
    }
    const rosterImportForm = event.target.closest("#medicalRosterImportForm");
    if (rosterImportForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const values = actions.getPlatformFormValues?.(rosterImportForm);
      const importResult = actions.parseMedicalRosterText?.(values.rosterText);
      const players = importResult.players;
      const skippedCount = importResult.skippedLines.length;
      if (!players.length) {
        const skippedMessage = skippedCount ? ` ${skippedCount} line(s) could not be parsed.` : "";
        renderWorkspace(`No players found in the roster paste.${skippedMessage}`);
        return;
      }
      actions.upsertMedicalPlayers?.(players);
      recordSync("players-imported", { players, importedCount: players.length, idempotencyKey: `players-imported:${Date.now()}` });
      rosterImportForm.reset();
      const skippedMessage = skippedCount ? ` ${skippedCount} line${skippedCount === 1 ? "" : "s"} could not be parsed and were skipped.` : "";
      renderWorkspace(`${players.length} player${players.length === 1 ? "" : "s"} imported.${skippedMessage}`);
      return;
    }
    const bulkRecommendationForm = event.target.closest("#medicalBulkRecommendationForm");
    if (bulkRecommendationForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const selectedCount = actions.getMedicalBulkSelectedPlayers?.().length;
      if (!selectedCount) {
        renderWorkspace("Select players before applying a bulk recommendation.");
        return;
      }
      const result = actions.applyMedicalBulkRecommendation?.(actions.getPlatformFormValues?.(bulkRecommendationForm));
      if (result.savedCount) {
        recordSync("bulk-recommendation-saved", {
          records: result.records,
          recordIds: result.records.map((record) => record.id),
          date: result.records[0]?.date || getMedicalState(state).selectedDate,
          idempotencyKey: `bulk-recommendation-saved:${result.records.map((record) => record.id).join("|")}`,
        });
      }
      const skippedText = result.blockReason ? ` ${result.blockReason}` : result.blockedCount ? ` ${result.blockedCount} skipped for clearance: ${result.blockedNames.slice(0, 3).join(", ")}${result.blockedNames.length > 3 ? "..." : ""}.` : "";
      const bulkMessage = result.savedCount ? `${result.savedCount} bulk recommendation${result.savedCount === 1 ? "" : "s"} saved.${skippedText}` : result.blockReason || "No bulk recommendations saved.";
      renderWorkspace(bulkMessage);
      return;
    }
    const newPlayerForm = event.target.closest("#medicalNewPlayerForm");
    if (newPlayerForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const player = actions.normalizeMedicalPlayer?.(actions.getPlatformFormValues?.(newPlayerForm));
      if (!player) {
        renderWorkspace("Player name is required.");
        return;
      }
      actions.upsertMedicalPlayers?.([player]);
      recordSync("player-added", { playerId: player.id, player, idempotencyKey: `player-added:${player.id}` });
      newPlayerForm.reset();
      renderWorkspace("Player added.");
      return;
    }
    const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
    if (injuryPlanForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const draft = actions.getMedicalInjuryPlanFormDraft?.(injuryPlanForm);
      const plan = draft?.planId ? actions.updateMedicalInjuryPlan?.(draft) : actions.addMedicalInjuryPlan?.(draft);
      if (plan) {
        actions.clearMedicalInjuryPlanDraft?.(plan.playerId);
        const eventType = draft?.planId ? "availability-plan-updated" : "availability-plan-created";
        recordSync(eventType, { playerId: plan.playerId, planId: plan.id, plan, idempotencyKey: `${eventType}:${plan.id}:${plan.updatedAt || Date.now()}` });
      }
      renderWorkspace(plan ? `Availability plan ${draft?.planId ? "updated" : "created"}.` : "Availability plan could not be saved.");
      return;
    }
    const recommendationForm = event.target.closest("[data-medical-recommendation-form]");
    if (recommendationForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const values = actions.getPlatformFormValues?.(recommendationForm);
      const participation = actions.normalizeMedicalParticipation?.(values.participation);
      const blockReason = actions.getMedicalRecommendationBlockReason?.(values.playerId, participation, values.date);
      if (blockReason) {
        renderWorkspace(blockReason);
        return;
      }
      const record = actions.addMedicalRecord?.(values);
      if (record) recordSync("recommendation-saved", { playerId: record.playerId, record, idempotencyKey: `recommendation-saved:${record.id}` });
      setStateValue(state, "MedicalPlayerModalOpen", false);
      renderWorkspace(record ? "Status saved." : "Status could not be saved.");
      return;
    }
    const clearanceForm = event.target.closest("#medicalClearanceForm");
    if (clearanceForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const saved = actions.updateMedicalPlanClearance?.(actions.getPlatformFormValues?.(clearanceForm));
      if (saved) recordSync("clearance-saved", { playerId: saved.playerId, plan: saved, idempotencyKey: `clearance-saved:${saved.id}:${saved.updatedAt || Date.now()}` });
      renderWorkspace(saved ? "Clearance checklist saved." : "Clearance checklist could not be saved.");
      return;
    }
    const playerProfileForm = event.target.closest("#medicalPlayerProfileForm");
    if (playerProfileForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const profileValues = actions.getPlatformFormValues?.(playerProfileForm);
      const saved = actions.updateMedicalPlayerProfile?.(profileValues);
      if (saved) {
        const player = actions.getMedicalDatabasePlayer?.(profileValues.playerId);
        recordSync("player-profile-saved", { playerId: profileValues.playerId, player, idempotencyKey: `player-profile-saved:${profileValues.playerId}:${player?.updatedAt || Date.now()}` });
      }
      renderWorkspace(saved ? "Player profile saved." : "Player profile could not be saved.");
    }
  };

  workspaceElement.addEventListener("click", onClick);
  workspaceElement.addEventListener("keydown", onKeydown);
  workspaceElement.addEventListener("input", onInput);
  workspaceElement.addEventListener("change", onChange);
  workspaceElement.addEventListener("submit", onSubmit);

  return { click: onClick, keydown: onKeydown, input: onInput, change: onChange, submit: onSubmit };
}
