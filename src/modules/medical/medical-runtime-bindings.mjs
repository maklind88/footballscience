import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";
import { getMedicalRtpExercisesForProfile as getDefaultMedicalRtpExercisesForProfile } from "./medical-rtp-exercise-bank-data.mjs";
import { createMedicalRtpExerciseCatalogRenderer } from "./medical-rtp-exercise-catalog-renderer.mjs";
import { MEDICAL_RTP_LIBRARY_PAGE_SIZE } from "./medical-rtp-library-renderer.mjs";
import {
  normalizeMedicalRtpClinicalQuery,
  rankMedicalRtpClinicalCards,
} from "./medical-rtp-library-search.mjs";

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
  let lastRtpProfileTrigger = null;

  const recordSync = (eventType, payload) => {
    void actions.recordMedicalDatabaseSyncEvent?.(eventType, payload);
  };

  const filterMedicalRtpLibrary = ({ resetLimit = false } = {}) => {
    const library = queryWorkspace(workspaceElement, "[data-medical-rtp-library]");
    if (!library) return;
    const query = String(library.querySelector("[data-medical-rtp-library-search]")?.value || "").trim();
    const filters = Array.from(library.querySelectorAll("[data-medical-rtp-library-filter]")).reduce((acc, control) => {
      acc[control.dataset.medicalRtpLibraryFilter] = String(control.value || "all").toLowerCase();
      return acc;
    }, {});
    if (resetLimit) {
      if (library.dataset) {
        library.dataset.medicalRtpLibraryLimit = String(MEDICAL_RTP_LIBRARY_PAGE_SIZE);
      } else {
        library.setAttribute?.("data-medical-rtp-library-limit", String(MEDICAL_RTP_LIBRARY_PAGE_SIZE));
      }
    }
    const visibleLimit = Math.max(
      MEDICAL_RTP_LIBRARY_PAGE_SIZE,
      Number(library.dataset?.medicalRtpLibraryLimit) || MEDICAL_RTP_LIBRARY_PAGE_SIZE
    );
    const matchingCards = [];
    const allCards = Array.from(library.querySelectorAll("[data-medical-rtp-profile]"));
    allCards.forEach((card) => {
      card.hidden = true;
    });
    const rankedCards = rankMedicalRtpClinicalCards(allCards, query);
    const resultGrid = library.querySelector("[data-medical-rtp-library-results]");
    rankedCards.forEach(({ card }) => {
      const matchesQuery = true;
      const movementTerms = String(filters.movement || "")
        .split("|")
        .map((term) => term.trim())
        .filter(Boolean);
      const cardMovement = [
        card.dataset.movement,
        card.dataset.clinicalMovement,
        card.dataset.clinicalMechanism,
        card.dataset.clinicalPositionDemand,
        card.dataset.search,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesMovement =
        !movementTerms.length ||
        movementTerms.includes("all") ||
        movementTerms.some((term) => cardMovement.includes(term));
      const matchesPosition = !filters.position || filters.position === "all" || String(card.dataset.position || "").toLowerCase().includes(filters.position);
      const matchesSeason = !filters.season || filters.season === "all" || String(card.dataset.season || "").toLowerCase().includes(filters.season);
      const matchesSex = !filters.sex || filters.sex === "all" || String(card.dataset.sex || "").toLowerCase().includes(filters.sex);
      const matchesLevel = !filters.level || filters.level === "all" || String(card.dataset.level || "").toLowerCase().includes(filters.level);
      const matches = matchesQuery && matchesMovement && matchesPosition && matchesSeason && matchesSex && matchesLevel;
      if (matches) matchingCards.push(card);
      resultGrid?.append?.(card);
    });
    matchingCards.slice(0, visibleLimit).forEach((card) => {
      card.hidden = false;
    });
    const shownCount = Math.min(visibleLimit, matchingCards.length);
    const count = library.querySelector("[data-medical-rtp-library-count]");
    if (count) count.textContent = String(matchingCards.length);
    const shown = library.querySelector("[data-medical-rtp-library-shown]");
    if (shown) shown.textContent = String(shownCount);
    const orderLabel = library.querySelector("[data-medical-rtp-library-order]");
    if (orderLabel) {
      orderLabel.textContent = normalizeMedicalRtpClinicalQuery(query) ? "clinical relevance" : "library priority";
    }
    const empty = library.querySelector("[data-medical-rtp-library-empty]");
    if (empty) empty.hidden = matchingCards.length !== 0;
    const loadMore = library.querySelector("[data-medical-rtp-library-more]");
    if (loadMore) {
      const remaining = Math.max(0, matchingCards.length - shownCount);
      loadMore.hidden = remaining === 0;
      loadMore.textContent = `Load ${Math.min(MEDICAL_RTP_LIBRARY_PAGE_SIZE, remaining)} more`;
    }
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
    const body = overlay.querySelector?.("[data-medical-rtp-exercise-overlay-body]");
    if (body && body.dataset?.medicalRtpExerciseLoaded !== "true") {
      body.innerHTML = createMedicalRtpExerciseCatalogRenderer({ escapeHtml }).renderExerciseCatalog();
      body.dataset.medicalRtpExerciseLoaded = "true";
    }
    closeMedicalRtpGuideDraftModal();
    closeMedicalRtpProfileModal();
    overlay.hidden = false;
    overlay.removeAttribute?.("aria-hidden");
    win.document?.body?.classList?.add?.("medical-rtp-exercise-overlay-open");
    filterMedicalRtpExerciseCatalog();
    overlay.querySelector?.("[role='dialog']")?.focus?.();
  };

  const closeMedicalBoardEditorOverlay = () => {
    queryWorkspaceAll(workspaceElement, "[data-medical-board-editor-overlay]").forEach((overlay) => {
      overlay.hidden = true;
      overlay.setAttribute?.("aria-hidden", "true");
    });
    win.document?.body?.classList?.remove?.("medical-board-editor-open");
  };

  const openMedicalBoardEditorOverlay = (planId) => {
    const normalizedPlanId = String(planId || "").trim();
    const overlay =
      queryWorkspaceAll(workspaceElement, "[data-medical-board-editor-overlay]").find(
        (candidate) => candidate.dataset?.medicalBoardEditorOverlay === normalizedPlanId
      ) ?? null;
    if (!overlay) return false;
    closeMedicalRtpExerciseOverlay();
    closeMedicalRtpGuideDraftModal();
    closeMedicalRtpProfileModal();
    closeMedicalBoardEditorOverlay();
    overlay.hidden = false;
    overlay.removeAttribute?.("aria-hidden");
    win.document?.body?.classList?.add?.("medical-board-editor-open");
    overlay.querySelector?.("[role='dialog']")?.focus?.();
    return true;
  };

  const showMedicalProgramsList = () => {
    const medicalState = getMedicalState(state);
    if (medicalState) {
      medicalState.selectedMedicalBoardPlanId = "";
    }
    const layout = queryWorkspace(workspaceElement, "[data-medical-programs-layout]");
    layout?.setAttribute?.("data-medical-program-view", "list");
    layout?.classList?.remove?.("medical-programs-layout-detail");
    layout?.classList?.add?.("medical-programs-layout-list");
    const listPanel = queryWorkspace(workspaceElement, "[data-medical-program-list-panel]");
    if (listPanel) {
      listPanel.hidden = false;
    }
    const boardCard = queryWorkspace(workspaceElement, "[data-medical-board-card]");
    if (boardCard) {
      boardCard.hidden = true;
    }
    queryWorkspaceAll(workspaceElement, "[data-medical-select-board-plan]").forEach((row) => {
      row.classList?.remove?.("is-board-selected");
      row.setAttribute?.("aria-selected", "false");
    });
  };

  const openMedicalProgramDetail = () => {
    const layout = queryWorkspace(workspaceElement, "[data-medical-programs-layout]");
    layout?.setAttribute?.("data-medical-program-view", "detail");
    layout?.classList?.remove?.("medical-programs-layout-list");
    layout?.classList?.add?.("medical-programs-layout-detail");
    const listPanel = queryWorkspace(workspaceElement, "[data-medical-program-list-panel]");
    if (listPanel) {
      listPanel.hidden = true;
    }
    const boardCard = queryWorkspace(workspaceElement, "[data-medical-board-card]");
    if (boardCard) {
      boardCard.hidden = false;
    }
  };

  const selectMedicalBoardPlan = (planId, options = {}) => {
    const normalizedPlanId = String(planId || "").trim();
    if (!normalizedPlanId) return false;
    const views = queryWorkspaceAll(workspaceElement, "[data-medical-board-plan-view]");
    const hasView = views.some((view) => view.dataset?.medicalBoardPlanView === normalizedPlanId);
    if (!hasView) return false;
    getMedicalState(state).selectedMedicalBoardPlanId = normalizedPlanId;
    views.forEach((view) => {
      view.hidden = view.dataset?.medicalBoardPlanView !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-board-name-option]").forEach((node) => {
      node.hidden = node.dataset?.medicalBoardNameOption !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-board-meta-option]").forEach((node) => {
      node.hidden = node.dataset?.medicalBoardMetaOption !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-board-edit-button]").forEach((button) => {
      button.hidden = button.dataset?.medicalBoardEditButton !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-rehab-program-panel]").forEach((panel) => {
      panel.hidden = panel.dataset?.medicalRehabProgramPanel !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-board-footer-option]").forEach((node) => {
      node.hidden = node.dataset?.medicalBoardFooterOption !== normalizedPlanId;
    });
    queryWorkspaceAll(workspaceElement, "[data-medical-select-board-plan]").forEach((row) => {
      const isSelected = row.dataset?.medicalSelectBoardPlan === normalizedPlanId;
      row.classList?.toggle?.("is-board-selected", isSelected);
      row.setAttribute?.("aria-selected", isSelected ? "true" : "false");
    });
    if (options.openDetail !== false) {
      openMedicalProgramDetail();
    }
    return true;
  };

  const getMedicalPlanById = (planId) => {
    const normalizedPlanId = String(planId || "").trim();
    return getMedicalState(state).injuryPlans.find((entry) => entry.id === normalizedPlanId && !actions.isMedicalItemArchived?.(entry)) || null;
  };

  const getMedicalBoardFromPlan = (plan = {}) => {
    const source = plan.medicalBoard && typeof plan.medicalBoard === "object" ? plan.medicalBoard : {};
    return {
      pitchMode: source.pitchMode || "full-wide",
      elements: Array.isArray(source.elements) ? source.elements.map((item) => ({ ...item })) : [],
      exercises: Array.isArray(source.exercises) ? source.exercises.map((item) => ({ ...item })) : [],
      updatedAt: source.updatedAt || "",
    };
  };

  const saveMedicalBoardForPlan = (planId, updater, message = "RTP Player Board updated.") => {
    const plan = getMedicalPlanById(planId);
    if (!plan || typeof updater !== "function") {
      return false;
    }
    const board = getMedicalBoardFromPlan(plan);
    const result = updater(board, plan) || {};
    const nextBoard = {
      ...board,
      ...(result.medicalBoard || result.board || {}),
      updatedAt: new Date().toISOString(),
    };
    const saved = actions.updateMedicalInjuryPlan?.({
      planId: plan.id,
      medicalBoard: nextBoard,
      ...(result.values || {}),
    });
    if (saved) {
      recordSync("medical-board-updated", {
        playerId: saved.playerId,
        planId: saved.id,
        plan: saved,
        idempotencyKey: `medical-board-updated:${saved.id}:${saved.updatedAt || Date.now()}`,
      });
      renderWorkspace(message);
      openMedicalBoardEditorOverlay(saved.id);
      return true;
    }
    return false;
  };

  const getMedicalBoardTool = (overlay) =>
    String(overlay?.querySelector?.("[data-medical-board-tool].is-active")?.dataset?.medicalBoardTool || "arrow").trim() || "arrow";

  const getMedicalBoardPointFromEvent = (event, canvas) => {
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
      return null;
    }
    const clamp = (value) => Math.max(4, Math.min(96, Number(value) || 50));
    return {
      x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100) * 10) / 10,
      y: Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100) * 10) / 10,
    };
  };

  const createMedicalBoardElement = (tool, point) => {
    const id = `medical-board-${tool}-${Date.now()}`;
    const base = { id, type: tool, x: point.x, y: point.y, createdAt: new Date().toISOString() };
    if (tool === "zone") {
      return { ...base, x2: Math.min(96, point.x + 18), y2: Math.min(96, point.y + 14), color: "#f59e0b", label: "Work zone" };
    }
    if (tool === "run") {
      return { ...base, x2: Math.min(96, point.x + 18), y2: Math.max(4, point.y - 8), color: "#2563eb", label: "Run" };
    }
    if (tool === "cone") {
      return { ...base, color: "#f97316", label: "Cone" };
    }
    if (tool === "text") {
      return { ...base, color: "#0f172a", label: "Note" };
    }
    return { ...base, type: "arrow", x2: Math.min(96, point.x + 18), y2: point.y, color: "#0f766e", label: "Arrow" };
  };

  const closeMedicalRtpProfileModal = ({ restoreFocus = true } = {}) => {
    queryWorkspaceAll(workspaceElement, "[data-medical-rtp-profile-modal]").forEach((modal) => {
      modal.hidden = true;
      modal.setAttribute?.("aria-hidden", "true");
    });
    if (restoreFocus) {
      lastRtpProfileTrigger?.focus?.();
    }
  };

  const switchMedicalRtpGuideGroup = (trigger) => {
    const groupKey = String(trigger?.dataset?.medicalRtpGuideGroup || "").trim();
    const content = trigger?.closest?.("[data-medical-rtp-profile-dialog-content]");
    if (!groupKey || !content) return false;
    content.querySelectorAll?.("[data-medical-rtp-guide-group]")?.forEach?.((button) => {
      button.setAttribute?.("aria-pressed", button.dataset?.medicalRtpGuideGroup === groupKey ? "true" : "false");
    });
    content.querySelectorAll?.("[data-medical-rtp-guide-group-panel]")?.forEach?.((panel) => {
      panel.hidden = panel.dataset?.medicalRtpGuideGroupPanel !== groupKey;
    });
    const body = content.querySelector?.(".medical-rtp-profile-dialog-body");
    body?.scrollTo?.({ top: 0, behavior: "smooth" });
    return true;
  };

  const jumpToMedicalRtpProfileSection = (trigger) => {
    const targetId = String(trigger?.dataset?.medicalRtpProfileJump || trigger?.getAttribute?.("href")?.replace(/^#/, "") || "");
    if (!targetId) return;
    const dialogBody = trigger.closest?.(".medical-rtp-profile-dialog-body");
    const content = trigger.closest?.("[data-medical-rtp-profile-dialog-content]");
    const targetRoot = dialogBody || content || queryWorkspace(workspaceElement, "[data-medical-rtp-profile-dialog-content]");
    const target = Array.from(targetRoot?.querySelectorAll?.("[id]") ?? []).find((candidate) => candidate.id === targetId);
    if (!target) return;
    if (dialogBody?.scrollTo && target.getBoundingClientRect && dialogBody.getBoundingClientRect) {
      const targetTop = target.getBoundingClientRect().top - dialogBody.getBoundingClientRect().top + (dialogBody.scrollTop || 0) - 8;
      dialogBody.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      return;
    }
    target.scrollIntoView?.({ behavior: "smooth", block: "start" });
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

  const getRtpProfileExercises = (profile = {}, limit = 6) => {
    const fromRuntime = actions.getMedicalRtpExercisesForProfile?.(profile.id, { limit });
    return Array.isArray(fromRuntime) && fromRuntime.length
      ? fromRuntime
      : getDefaultMedicalRtpExercisesForProfile(profile.id, { limit });
  };

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

  const rtpGuideGroups = Object.freeze([
    { key: "decision", label: "Decision summary", indexes: [] },
    { key: "clinical", label: "Clinical", indexes: [0, 1, 2, 3, 4, 5, 6, 7] },
    { key: "rehabilitation", label: "Rehabilitation", indexes: [8, 9, 19, 20] },
    { key: "field", label: "Field progression", indexes: [10, 11, 12, 13, 18, 27, 32] },
    { key: "return", label: "Return decisions", indexes: [14, 15, 16, 29, 30, 31, 34, 35, 36] },
    { key: "evidence", label: "Evidence & notes", indexes: [17, 21, 22, 23, 24, 25, 26, 28, 33] },
  ]);

  const renderRtpProfileQuickNav = () => `
<nav class="medical-rtp-profile-quick-nav" aria-label="RTP guide work areas">
${rtpGuideGroups
  .map(
    ({ key, label }, index) => `
<button
type="button"
data-medical-rtp-guide-group="${escapeHtml(key)}"
aria-pressed="${index === 0 ? "true" : "false"}"
>${escapeHtml(label)}</button>
`
  )
  .join("")}
</nav>
`;

  const renderRtpProfileDecisionStrip = (profile = {}) => `
<section class="medical-rtp-profile-decision-strip" aria-label="RTP guide decision support">
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

  const renderRtpGoldStandardSections = (sections = [], indexes = []) => {
    const selectedSections = indexes
      .map((sectionIndex) => ({ section: sections[sectionIndex], sectionIndex }))
      .filter(({ section }) => section);
    return `
<section class="medical-rtp-gold-standard-sections" aria-label="Gold Standard RTP profile sections">
<header>
<strong>${selectedSections.length} sections</strong>
</header>
${selectedSections
  .map(
    ({ section, sectionIndex }, index) => `
<details${index === 0 ? " open" : ""}>
<summary><span>${sectionIndex + 1}</span>${escapeHtml(section.title)}</summary>
<p>${escapeHtml(section.content)}</p>
${Array.isArray(section.items) && section.items.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
</details>
`
  )
  .join("")}
</section>
`;
  };

  const renderRtpDecisionGroup = (profile = {}) => `
<section class="medical-rtp-guide-group-panel" data-medical-rtp-guide-group-panel="decision">
<section class="medical-rtp-profile-summary" id="${escapeHtml(getRtpProfileAnchorId(profile.id, "summary"))}">
<div>
<h3>Quick clinical summary</h3>
<p>${escapeHtml(profile.summary)}</p>
</div>
<div>
<h3>Medical-safe evidence</h3>
<p><strong>Evidence:</strong> ${escapeHtml(profile.evidence)}</p>
<p><strong>Experience / consensus:</strong> ${escapeHtml(profile.experience)}</p>
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
<div class="medical-rtp-guide-section-heading">
<h4>Exercise starters</h4>
<small>Mapped from the professional Exercise Bank</small>
</div>
${renderRtpExerciseCards(profile, 6)}
</section>
${renderRtpGuideList("Return-to-training checklist", profile.trainingChecklist || [], getRtpProfileAnchorId(profile.id, "training"))}
${renderRtpGuideList("Return-to-match checklist", profile.matchChecklist || [], getRtpProfileAnchorId(profile.id, "match"))}
</div>
</section>
`;

  const renderRtpSectionGroups = (profile = {}) =>
    rtpGuideGroups
      .filter(({ key }) => key !== "decision")
      .map(
        ({ key, label, indexes }) => `
<section
class="medical-rtp-guide-group-panel"
data-medical-rtp-guide-group-panel="${escapeHtml(key)}"
hidden
>
<header class="medical-rtp-guide-group-heading">
<div>
<span>Gold Standard work area</span>
<h3>${escapeHtml(label)}</h3>
</div>
<small>${indexes.length} of 37 sections</small>
</header>
${renderRtpGoldStandardSections(profile.goldStandardSections || [], indexes)}
</section>
`
      )
      .join("");

  const renderRtpProfileDialogContent = (profile = {}) => {
    return `
<header>
<div>
<span>Medical RTP guide</span>
<h3 id="medical-rtp-profile-title">${escapeHtml(profile.name || "RTP injury guide")}</h3>
${renderRtpProfileHeaderMeta(profile)}
<small>Club-neutral knowledge / 37 sections / reviewed ${escapeHtml(profile.researchAuditReviewedAt || "date not set")}</small>
</div>
<div class="medical-rtp-profile-header-actions">
<button
type="button"
class="medical-rtp-profile-start-plan"
data-medical-start-from-rtp-guide="${escapeHtml(profile.id)}"
data-medical-start-from-rtp-guide-name="${escapeHtml(profile.name || "RTP guide")}"
>Use in Medical Plan</button>
<button type="button" class="medical-rtp-profile-modal-close" data-medical-close-rtp-profile aria-label="Close ${escapeHtml(profile.name || "RTP")} guide">Close</button>
</div>
</header>
<div class="medical-rtp-profile-dialog-body">
<div class="medical-rtp-profile-layout">
${renderRtpProfileQuickNav()}
<div class="medical-rtp-profile-body" id="${escapeHtml(getRtpProfileAnchorId(profile.id, "full-guide"))}">
${renderRtpDecisionGroup(profile)}
${renderRtpSectionGroups(profile)}
<div class="medical-rtp-profile-actions medical-rtp-profile-actions-info">
<div>
<strong>To build a player program</strong>
<small>Use this guide in Active Cases or the player's Medical Plan, individualize it, then save the case-specific program.</small>
</div>
<b>Knowledge only. No player data is stored or selected inside the Library.</b>
</div>
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
    closeMedicalRtpProfileModal({ restoreFocus: false });
    modal.hidden = false;
    modal.removeAttribute?.("aria-hidden");
    modal.querySelector?.("[role='dialog']")?.focus?.();
  };

  const openMedicalRtpGuideDraftModal = () => {
    const modal = queryWorkspace(workspaceElement, "[data-medical-rtp-guide-draft-modal]");
    if (!modal) return;
    closeMedicalRtpProfileModal({ restoreFocus: false });
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
      const nextTab = actions.normalizeMedicalOperationsTab?.(operationsTabButton.dataset.medicalOpsTab);
      setStateValue(state, "MedicalOperationsTab", nextTab);
      renderWorkspace();
      if (nextTab === "rtp-library" && typeof actions.loadMedicalRtpLibraryProfiles === "function") {
        const result = await actions.loadMedicalRtpLibraryProfiles();
        if (result?.changed && getStateValue(state, "MedicalOperationsTab") === "rtp-library") {
          renderWorkspace();
        }
      }
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
    const programBackButton = event.target.closest("[data-medical-programs-back]");
    if (programBackButton) {
      event.preventDefault();
      event.stopPropagation();
      showMedicalProgramsList();
      return;
    }
    const openProgramDetailButton = event.target.closest("[data-medical-open-program-detail]");
    if (openProgramDetailButton) {
      event.preventDefault();
      event.stopPropagation();
      selectMedicalBoardPlan(openProgramDetailButton.dataset.medicalOpenProgramDetail);
      return;
    }
    const boardSelectionRow = event.target.closest("[data-medical-select-board-plan]");
    const boardSelectionInteractive = event.target.closest("button,a,input,textarea,select,[data-medical-edit-injury-plan],[data-medical-open-program-detail],[data-medical-create-program]");
    if (boardSelectionRow && !boardSelectionInteractive) {
      event.preventDefault();
      event.stopPropagation();
      selectMedicalBoardPlan(boardSelectionRow.dataset.medicalSelectBoardPlan);
      return;
    }
    const openBoardButton = event.target.closest("[data-medical-open-board-plan]");
    if (openBoardButton) {
      event.preventDefault();
      event.stopPropagation();
      const planId = openBoardButton.dataset.medicalOpenBoardPlan;
      selectMedicalBoardPlan(planId);
      openMedicalBoardEditorOverlay(planId);
      return;
    }
    const closeBoardButton = event.target.closest("[data-medical-close-board-editor]");
    if (closeBoardButton) {
      event.preventDefault();
      closeMedicalBoardEditorOverlay();
      return;
    }
    const boardOverlay = event.target.closest("[data-medical-board-editor-overlay]");
    if (boardOverlay && event.target === boardOverlay) {
      event.preventDefault();
      closeMedicalBoardEditorOverlay();
      return;
    }
    const boardToolButton = event.target.closest("[data-medical-board-tool]");
    if (boardToolButton) {
      event.preventDefault();
      const overlay = boardToolButton.closest("[data-medical-board-editor-overlay]");
      overlay?.querySelectorAll?.("[data-medical-board-tool]").forEach((button) => {
        button.classList.toggle("is-active", button === boardToolButton);
      });
      return;
    }
    const boardCanvas = event.target.closest("[data-medical-board-canvas]");
    if (boardCanvas && canEdit() && !event.target.closest("[data-medical-board-player-home]")) {
      event.preventDefault();
      const point = getMedicalBoardPointFromEvent(event, boardCanvas);
      const planId = boardCanvas.dataset.medicalBoardCanvas;
      const overlay = boardCanvas.closest("[data-medical-board-editor-overlay]");
      const tool = getMedicalBoardTool(overlay);
      if (!point || !planId) return;
      saveMedicalBoardForPlan(planId, (board) => ({
        board: {
          ...board,
          elements: [...board.elements, createMedicalBoardElement(tool, point)],
        },
    }), "RTP Player Board drawing saved.");
      return;
    }
    const removeBoardExerciseButton = event.target.closest("[data-medical-remove-board-exercise]");
    if (removeBoardExerciseButton && canEdit()) {
      event.preventDefault();
      const [planId, exerciseId] = String(removeBoardExerciseButton.dataset.medicalRemoveBoardExercise || "").split(":");
      if (!planId || !exerciseId) return;
      saveMedicalBoardForPlan(planId, (board, plan) => {
        const removedExercise = board.exercises.find((exercise) => exercise.id === exerciseId);
        const removedTitle = String(removedExercise?.title || "").trim();
        const nextExercises = board.exercises.filter((exercise) => exercise.id !== exerciseId);
        const nextProgramExercises = Array.isArray(plan.rtpProgramExercises)
          ? plan.rtpProgramExercises.filter((item) => !removedTitle || !String(item || "").startsWith(removedTitle))
          : [];
        return {
          board: { ...board, exercises: nextExercises },
          values: { rtpProgramExercises: nextProgramExercises },
        };
      }, "RTP Player Board exercise removed.");
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
    const loadMoreRtpGuidesButton = event.target.closest("[data-medical-rtp-library-more]");
    if (loadMoreRtpGuidesButton) {
      event.preventDefault();
      const library = loadMoreRtpGuidesButton.closest("[data-medical-rtp-library]");
      const currentLimit = Number(library?.dataset?.medicalRtpLibraryLimit) || MEDICAL_RTP_LIBRARY_PAGE_SIZE;
      if (library) {
        library.dataset.medicalRtpLibraryLimit = String(currentLimit + MEDICAL_RTP_LIBRARY_PAGE_SIZE);
      }
      filterMedicalRtpLibrary();
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
      lastRtpProfileTrigger = openRtpProfileButton;
      const profileId = openRtpProfileButton.dataset.medicalOpenRtpProfile;
      if (typeof actions.loadMedicalRtpLibraryProfile === "function") {
        await actions.loadMedicalRtpLibraryProfile(profileId);
      }
      openMedicalRtpProfileModal(profileId);
      return;
    }
    const rtpGuideGroupButton = event.target.closest("[data-medical-rtp-guide-group]");
    if (rtpGuideGroupButton) {
      event.preventDefault();
      switchMedicalRtpGuideGroup(rtpGuideGroupButton);
      return;
    }
    const startFromRtpGuideButton = event.target.closest("[data-medical-start-from-rtp-guide]");
    if (startFromRtpGuideButton) {
      event.preventDefault();
      const guideName = String(startFromRtpGuideButton.dataset.medicalStartFromRtpGuideName || "RTP guide");
      closeMedicalRtpProfileModal({ restoreFocus: false });
      setStateValue(state, "MedicalOperationsTab", actions.normalizeMedicalOperationsTab?.("cases") || "cases");
      renderWorkspace(`Choose an active case and apply ${guideName} in the Medical Plan.`);
      return;
    }
    const rtpProfileJumpButton = event.target.closest("[data-medical-rtp-profile-jump]");
    if (rtpProfileJumpButton) {
      event.preventDefault();
      jumpToMedicalRtpProfileSection(rtpProfileJumpButton);
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
    const createProgramButton = event.target.closest("[data-medical-create-program]");
    if (createProgramButton && canEdit()) {
      const playerId = createProgramButton.dataset.medicalCreateProgram;
      setStateValue(state, "MedicalSelectedPlayerId", playerId);
      setStateValue(state, "MedicalPlayerModalOpen", true);
      setStateValue(state, "MedicalPlayerModalTab", "plan");
      renderWorkspace("Medical Plan ready.");
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
        closeMedicalBoardEditorOverlay();
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
    if (event.key === "Escape" && queryWorkspace(workspaceElement, "[data-medical-board-editor-overlay]:not([hidden])")) {
      event.preventDefault();
      closeMedicalBoardEditorOverlay();
      return;
    }
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
    const boardSelectionRow = event.target.closest("[data-medical-select-board-plan]");
    if (boardSelectionRow) {
      event.preventDefault();
      selectMedicalBoardPlan(boardSelectionRow.dataset.medicalSelectBoardPlan);
      return;
    }
    const selectPlayerCard = event.target.closest("[data-medical-select-player]");
    if (!selectPlayerCard) return;
    event.preventDefault();
    actions.openMedicalPlayerModal?.(selectPlayerCard.dataset.medicalSelectPlayer);
  };

  const onInput = (event) => {
    if (event.target.closest("[data-medical-rtp-library-search]")) {
      filterMedicalRtpLibrary({ resetLimit: true });
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
      filterMedicalRtpLibrary({ resetLimit: true });
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
    const boardExerciseForm = event.target.closest("[data-medical-board-exercise-form]");
    if (boardExerciseForm) {
      event.preventDefault();
      if (!canEdit()) return;
      const planId = boardExerciseForm.dataset.medicalBoardExerciseForm;
      const values = actions.getPlatformFormValues?.(boardExerciseForm) || {};
      const title = String(values.title || "").trim();
      if (!planId || !title) {
        renderWorkspace("Add an exercise name first.");
        openMedicalBoardEditorOverlay(planId);
        return;
      }
      const phase = String(values.phase || "").trim();
      const dose = String(values.dose || "").trim();
      const focusArea = String(values.focusArea || "").trim();
      const detail = String(values.detail || "").trim();
      const exercise = {
        id: `medical-board-exercise-${Date.now()}`,
        title,
        phase,
        dose,
        focusArea,
        detail,
        createdAt: new Date().toISOString(),
      };
      saveMedicalBoardForPlan(planId, (board, plan) => {
        const exerciseLine = [title, phase, dose, focusArea, detail].filter(Boolean).join(" | ");
        const currentProgramExercises = Array.isArray(plan.rtpProgramExercises) ? plan.rtpProgramExercises : [];
        return {
          board: { ...board, exercises: [exercise, ...board.exercises] },
          values: {
            rtpProgramExercises: currentProgramExercises.includes(exerciseLine)
              ? currentProgramExercises
              : [exerciseLine, ...currentProgramExercises],
          },
        };
      }, `${title} added to RTP Player Board.`);
      return;
    }
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
