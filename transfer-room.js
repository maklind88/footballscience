import { getTransferRoomTargetStageGateIssues, transferRoomApprovalRoles } from "./transfer-room-state.js";

let activeContext = null;

const transferRoomTargetStageOptions = Object.freeze([
  { value: "monitoring", label: "Monitoring" },
  { value: "shortlist", label: "Shortlist" },
  { value: "internal-approved", label: "Internal approved" },
  { value: "contact", label: "Contact" },
  { value: "negotiation", label: "Negotiation" },
  { value: "medical-admin", label: "Medical/Admin" },
  { value: "approved", label: "Approved" },
  { value: "signed", label: "Signed" },
  { value: "lost", label: "Lost" },
  { value: "paused", label: "Paused" },
]);
const transferRoomTargetRiskOptions = Object.freeze([
  { value: "unknown", label: "Unknown" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]);
const transferRoomTargetConfidenceOptions = Object.freeze([
  { value: "unknown", label: "Unknown" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]);
const transferRoomTargetDealTypeOptions = Object.freeze([
  { value: "transfer", label: "Transfer" },
  { value: "loan", label: "Loan" },
  { value: "free-agent", label: "Free agent" },
  { value: "trade", label: "Trade" },
  { value: "extension", label: "Extension" },
  { value: "unknown", label: "Unknown" },
]);
const transferRoomBudgetActiveStages = new Set(["shortlist", "internal-approved", "contact", "negotiation", "medical-admin", "approved", "signed"]);
const transferRoomOutgoingStatuses = new Set(["sell", "loan", "release"]);

function setContext(context = {}) {
  activeContext = context;
}

function escapeHtml(value) {
  if (typeof activeContext?.escapeHtml === "function") {
    return activeContext.escapeHtml(value);
  }
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getState() {
  return activeContext?.state || {};
}

function getCanEdit() {
  return activeContext?.canEdit?.() === true;
}

function getCanManageAccess() {
  return activeContext?.canManageAccess?.() === true;
}

function getCurrency() {
  return getState().settings?.currency || "USD";
}

function getWagePeriod() {
  return getState().settings?.wagePeriod || "year";
}

function getWageMultiplier(period = getWagePeriod()) {
  const option = (activeContext?.wagePeriodOptions || []).find((item) => item.value === period);
  return Number(option?.multiplier) || 1;
}

function toNumber(value) {
  const numericValue = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toAnnual(value, period = getWagePeriod()) {
  return toNumber(value) * getWageMultiplier(period);
}

function formatMoney(value, currency = getCurrency()) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue)}%` : "0%";
}

function getLeagueProfile() {
  return getLeagueProfileForSettings(getState().settings || {});
}

function getLeagueProfileForSettings(settings = {}) {
  const state = getState();
  const profileId = settings.leagueProfileId || state.settings?.leagueProfileId || "nwsl-2026";
  return state.leagueProfiles?.[profileId] || state.leagueProfiles?.["nwsl-2026"] || {};
}

function getSquadPlans() {
  return Object.values(getState().squadPlans || {}).filter((plan) => plan?.playerId);
}

function getTargetPlans() {
  return Object.values(getState().targetPlans || {}).filter((plan) => plan?.recordId);
}

function getTargetSnapshot(recordId) {
  return getState().targetSnapshots?.[recordId] || {};
}

function isTargetBudgetActive(plan = {}) {
  return transferRoomBudgetActiveStages.has(plan.stage || "monitoring");
}

function getTargetStageLabel(stage = "") {
  return transferRoomTargetStageOptions.find((option) => option.value === stage)?.label || "Monitoring";
}

function getRiskLabel(risk = "") {
  return transferRoomTargetRiskOptions.find((option) => option.value === risk)?.label || "Unknown";
}

function getDealTypeLabel(dealType = "") {
  return transferRoomTargetDealTypeOptions.find((option) => option.value === dealType)?.label || "Transfer";
}

function getTargetGateIssues(plan = {}) {
  return getTransferRoomTargetStageGateIssues(plan, getState()).filter((issue) => issue?.severity === "blocker");
}

function getRuleStatusLabel(status = "clear") {
  if (status === "blocker") {
    return "Blocked";
  }
  if (status === "warning") {
    return "Needs attention";
  }
  return "Clear";
}

function getTargetApprovalSummary(plan = {}) {
  const approvals = plan.approvals || {};
  const approvedCount = transferRoomApprovalRoles.filter((role) => approvals[role.id]?.status === "approved").length;
  const rejectedCount = transferRoomApprovalRoles.filter((role) => approvals[role.id]?.status === "rejected").length;
  return {
    approvedCount,
    rejectedCount,
    total: transferRoomApprovalRoles.length,
    label: rejectedCount ? `${rejectedCount} rejected` : `${approvedCount}/${transferRoomApprovalRoles.length} approvals`,
  };
}

function getDealSummary(plan = {}) {
  const stage = plan.stage || "monitoring";
  const stageLabel = getTargetStageLabel(stage);
  const dealTypeLabel = getDealTypeLabel(plan.dealType);
  const budget = calculateBudget();
  const gateIssues = getTargetGateIssues(plan);
  const approvalSummary = getTargetApprovalSummary(plan);
  const fee = toNumber(plan.fee);
  const annualWage = toAnnual(plan.wage, plan.wagePeriod);
  const isFinalStage = stage === "approved" || stage === "signed";
  const hasFullApprovals = approvalSummary.approvedCount === approvalSummary.total;
  const hasRejectedApproval = approvalSummary.rejectedCount > 0;
  const isBlocked = gateIssues.length > 0 || hasRejectedApproval || budget.capSpace < 0;
  const tone = isBlocked ? "blocked" : hasFullApprovals || isFinalStage ? "ready" : "watch";
  const statusLabel = isBlocked
    ? "Blocked"
    : hasFullApprovals
      ? "Ready"
      : isFinalStage
        ? "Needs approval"
        : "Needs decision";
  const statusDetail = hasRejectedApproval
    ? "An approval has been rejected."
    : gateIssues[0]?.message || (budget.capSpace < 0 ? "Projected cap space is negative." : "");
  const nextStep = statusDetail || (hasFullApprovals ? "Approval workflow is complete for the current plan." : "Needs the decision group before final approval.");
  return {
    tone,
    statusLabel,
    statusMeta: `${stageLabel} / ${dealTypeLabel}`,
    nextStep,
    metrics: [
      {
        label: "Total exposure",
        value: fee || annualWage ? formatMoney(fee + annualWage) : "Not set",
        meta: `${formatMoney(fee)} fee + ${formatMoney(annualWage)} annual wage`,
      },
      {
        label: "Cap impact",
        value: isTargetBudgetActive(plan) ? formatMoney(annualWage) : "Not active",
        meta: `Projected space ${formatMoney(budget.capSpace)}`,
      },
      {
        label: "Approvals",
        value: approvalSummary.label,
        meta: hasRejectedApproval ? "Decision conflict" : hasFullApprovals ? "All roles approved" : "Sporting, scouting, coaching",
      },
      {
        label: "Next action",
        value: plan.nextAction || "Set next action",
        meta: plan.nextActionDate || plan.decisionOwner || "Owner/date missing",
      },
      {
        label: "Risk",
        value: getRiskLabel(plan.riskLevel),
        meta: `Confidence ${getRiskLabel(plan.valuationConfidence)}`,
      },
    ],
  };
}

function renderSelectOptions(options = [], selectedValue = "") {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}

function calculateBudget() {
  const state = getState();
  const profile = getLeagueProfile();
  const cap = toNumber(state.settings?.salaryCap || profile.salaryCap || 0);
  const buffer = toNumber(state.settings?.capBuffer || 0);
  const squadPlans = getSquadPlans();
  const targetPlans = getTargetPlans();
  const currentCommitment = squadPlans.reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod), 0);
  const outgoingRelief = squadPlans
    .filter((plan) => transferRoomOutgoingStatuses.has(plan.status))
    .reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod), 0);
  const activeTargets = targetPlans.filter(isTargetBudgetActive);
  const incomingWages = targetPlans
    .filter(isTargetBudgetActive)
    .reduce((sum, plan) => sum + toAnnual(plan.wage, plan.wagePeriod), 0);
  const incomingFees = targetPlans
    .filter(isTargetBudgetActive)
    .reduce((sum, plan) => sum + toNumber(plan.fee), 0);
  const projectedCommitment = Math.max(0, currentCommitment - outgoingRelief + incomingWages);
  const capSpace = cap - buffer - projectedCommitment;
  const utilization = cap > 0 ? Math.min(120, Math.max(0, (projectedCommitment / cap) * 100)) : 0;
  return {
    cap,
    buffer,
    currentCommitment,
    outgoingRelief,
    incomingWages,
    incomingFees,
    projectedCommitment,
    capSpace,
    utilization,
    targetCount: targetPlans.length,
    activeTargetCount: activeTargets.length,
  };
}

function calculateScenarioPlanner() {
  const budget = calculateBudget();
  const squadPlans = getSquadPlans();
  const targetPlans = getTargetPlans();
  const outgoingPlans = squadPlans.filter((plan) => transferRoomOutgoingStatuses.has(plan.status));
  const activeTargets = targetPlans.filter(isTargetBudgetActive);
  const outgoingValue = outgoingPlans
    .filter((plan) => plan.status !== "loan")
    .reduce((sum, plan) => sum + toNumber(plan.estimatedValue), 0);
  const netWageChange = budget.incomingWages - budget.outgoingRelief;
  const netFeeExposure = budget.incomingFees - outgoingValue;
  const missingWageCount = activeTargets.filter((plan) => !toNumber(plan.wage)).length;
  const missingFeeCount = activeTargets.filter((plan) => !toNumber(plan.fee) && !["free-agent", "loan", "trade"].includes(plan.dealType)).length;
  const highRiskCount = activeTargets.filter((plan) => plan.riskLevel === "high").length;
  const missingNextActionCount = activeTargets.filter((plan) => !plan.nextAction).length;
  const stageCounts = transferRoomTargetStageOptions.map((stage) => ({
    ...stage,
    count: targetPlans.filter((plan) => (plan.stage || "monitoring") === stage.value).length,
  }));
  const warnings = [
    budget.capSpace < 0 ? `Projected cap is over by ${formatMoney(Math.abs(budget.capSpace))}` : "",
    budget.capSpace >= 0 && budget.cap > 0 && budget.capSpace < budget.cap * 0.08 ? `Cap buffer is thin at ${formatMoney(budget.capSpace)}` : "",
    missingWageCount ? `${missingWageCount} active target${missingWageCount === 1 ? "" : "s"} missing wage` : "",
    missingFeeCount ? `${missingFeeCount} active target${missingFeeCount === 1 ? "" : "s"} missing fee` : "",
    highRiskCount ? `${highRiskCount} high-risk active deal${highRiskCount === 1 ? "" : "s"}` : "",
    missingNextActionCount ? `${missingNextActionCount} active target${missingNextActionCount === 1 ? "" : "s"} missing next action` : "",
  ].filter(Boolean);
  return {
    ...budget,
    activeTargets,
    outgoingPlans,
    outgoingValue,
    netWageChange,
    netFeeExposure,
    warnings,
    stageCounts,
  };
}

function getScenarioPlanMap(plans = [], idField = "id") {
  return plans.reduce((map, plan) => {
    const id = plan?.[idField];
    if (id) {
      map[id] = plan;
    }
    return map;
  }, {});
}

function calculateScenarioSnapshot(scenario = null) {
  const state = getState();
  const settings = scenario?.settings || state.settings || {};
  const profile = getLeagueProfileForSettings(settings);
  const squadPlans = Object.values(scenario?.squadPlans || state.squadPlans || {}).filter((plan) => plan?.playerId);
  const targetPlans = Object.values(scenario?.targetPlans || state.targetPlans || {}).filter((plan) => plan?.recordId);
  const cap = toNumber(settings.salaryCap || profile.salaryCap || 0);
  const buffer = toNumber(settings.capBuffer || 0);
  const currentCommitment = squadPlans.reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod || settings.wagePeriod), 0);
  const outgoingPlans = squadPlans.filter((plan) => transferRoomOutgoingStatuses.has(plan.status));
  const outgoingRelief = outgoingPlans.reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod || settings.wagePeriod), 0);
  const outgoingValue = outgoingPlans
    .filter((plan) => plan.status !== "loan")
    .reduce((sum, plan) => sum + toNumber(plan.estimatedValue), 0);
  const activeTargets = targetPlans.filter(isTargetBudgetActive);
  const incomingWages = activeTargets.reduce((sum, plan) => sum + toAnnual(plan.wage, plan.wagePeriod || settings.wagePeriod), 0);
  const incomingFees = activeTargets.reduce((sum, plan) => sum + toNumber(plan.fee), 0);
  const projectedCommitment = Math.max(0, currentCommitment - outgoingRelief + incomingWages);
  const capSpace = cap - buffer - projectedCommitment;
  const targetState = {
    ...state,
    settings: {
      ...(state.settings || {}),
      ...settings,
    },
    squadPlans: getScenarioPlanMap(squadPlans, "playerId"),
    targetPlans: getScenarioPlanMap(targetPlans, "recordId"),
  };
  const blockerCount = targetPlans.reduce(
    (sum, plan) => sum + getTransferRoomTargetStageGateIssues(plan, targetState).filter((issue) => issue?.severity === "blocker").length,
    0
  );
  return {
    cap,
    capSpace,
    currency: settings.currency || getCurrency(),
    activeTargetCount: activeTargets.length,
    targetCount: targetPlans.length,
    outgoingCount: outgoingPlans.length,
    incomingFees,
    incomingWages,
    netWageChange: incomingWages - outgoingRelief,
    netFeeExposure: incomingFees - outgoingValue,
    blockerCount,
  };
}

function calculateRuleCheck() {
  const scenario = calculateScenarioPlanner();
  const targetPlans = getTargetPlans();
  const activeTargets = scenario.activeTargets || [];
  const gateEntries = targetPlans.flatMap((plan) => getTargetGateIssues(plan).map((issue) => ({ ...issue, plan })));
  const missingDataCount = activeTargets.filter((plan) => {
    const missingFee = !toNumber(plan.fee) && ["transfer", "extension", "unknown"].includes(plan.dealType || "transfer");
    return missingFee || !toNumber(plan.wage) || !plan.nextAction;
  }).length;
  const approvalMissingCount = activeTargets.filter((plan) => getTargetApprovalSummary(plan).approvedCount < transferRoomApprovalRoles.length).length;
  const tradeCount = activeTargets.filter((plan) => plan.dealType === "trade").length;
  const releaseCount = getSquadPlans().filter((plan) => plan.status === "release").length;
  const capStatus = scenario.capSpace < 0 ? "blocker" : scenario.cap > 0 && scenario.capSpace < scenario.cap * 0.08 ? "warning" : "clear";
  const checks = [
    {
      id: "salary-cap",
      status: capStatus,
      title: "Salary cap",
      value: formatMoney(scenario.capSpace),
      detail: capStatus === "blocker" ? "Projected cap space is negative." : capStatus === "warning" ? "Cap buffer is thin for the planned window." : "Projected commitment is inside the league profile.",
    },
    {
      id: "stage-gates",
      status: gateEntries.length ? "blocker" : "clear",
      title: "Stage gates",
      value: gateEntries.length ? `${gateEntries.length} blocker${gateEntries.length === 1 ? "" : "s"}` : "Ready",
      detail: gateEntries.length
        ? `${gateEntries[0].plan.name || "Target"}: ${gateEntries[0].label} missing.`
        : "Active pipeline stages have their required fields.",
    },
    {
      id: "data-quality",
      status: missingDataCount ? "warning" : "clear",
      title: "Deal data",
      value: missingDataCount ? `${missingDataCount} target${missingDataCount === 1 ? "" : "s"}` : "Complete",
      detail: missingDataCount ? "Some active targets need fee, wage or next action before decisions." : "Active targets have the core planning fields.",
    },
    {
      id: "approval-workflow",
      status: approvalMissingCount ? "warning" : "clear",
      title: "Approvals",
      value: approvalMissingCount ? `${approvalMissingCount} pending` : "Complete",
      detail: approvalMissingCount ? "Active targets still need sporting, scouting or coaching approval." : "Active targets have all required approval slots.",
    },
    {
      id: "nwsl-movement",
      status: tradeCount || releaseCount ? "warning" : "clear",
      title: "NWSL movement rules",
      value: tradeCount || releaseCount ? `${tradeCount + releaseCount} check${tradeCount + releaseCount === 1 ? "" : "s"}` : "Clear",
      detail: tradeCount
        ? "Trade targets need player-consent review."
        : releaseCount
          ? "Release decisions need guaranteed-contract review."
          : "No trade or release warnings in the current plan.",
    },
  ];
  return {
    checks,
    gateEntries,
    blockerCount: checks.filter((check) => check.status === "blocker").length,
    warningCount: checks.filter((check) => check.status === "warning").length,
  };
}

function renderOptionList(options = [], selectedValue = "") {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}

function renderTabButton(tabId, label) {
  const activeTab = getState().activeTab || "overview";
  return `<button type="button" class="${activeTab === tabId ? "is-active" : ""}" data-transfer-room-tab="${escapeHtml(tabId)}">${escapeHtml(label)}</button>`;
}

function renderStatusOption(value, label, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderBudgetHero() {
  const state = getState();
  const team = activeContext?.team || {};
  const profile = getLeagueProfile();
  const budget = calculateBudget();
  const capTone = budget.capSpace < 0 ? "is-danger" : budget.capSpace < budget.cap * 0.08 ? "is-warn" : "is-good";
  return `
    <header class="transfer-room-hero">
      <div class="transfer-room-hero-main">
        <p>Confidential Transfer Room</p>
        <h1>${escapeHtml(team.name || "Transfer Room")}</h1>
        <div class="transfer-room-hero-tags">
          <span>${escapeHtml(profile.label || "League profile")}</span>
          <span>${escapeHtml(state.settings?.currency || "USD")} / ${escapeHtml((activeContext?.wagePeriodOptions || []).find((item) => item.value === state.settings?.wagePeriod)?.label || "Per year")}</span>
          <span>Selected access</span>
        </div>
      </div>
      <div class="transfer-room-cap-board ${capTone}">
        <span>Projected cap space</span>
        <strong>${formatMoney(budget.capSpace)}</strong>
        <div class="transfer-room-cap-track" aria-label="Salary cap usage">
          <i style="width:${Math.min(100, budget.utilization).toFixed(1)}%"></i>
        </div>
        <small>${formatPercent(budget.utilization)} of ${formatMoney(budget.cap)} cap</small>
      </div>
    </header>
  `;
}

function renderKpiGrid() {
  const budget = calculateBudget();
  const items = [
    ["Salary cap", formatMoney(budget.cap), "NWSL active cap"],
    ["Current wages", formatMoney(budget.currentCommitment), "Squad annualized"],
    ["Outgoing relief", formatMoney(budget.outgoingRelief), "Sell, loan, release"],
    ["Incoming wages", formatMoney(budget.incomingWages), `${budget.activeTargetCount} active targets`],
    ["Transfer fees", formatMoney(budget.incomingFees), "Planned fees"],
  ];
  return `
    <section class="transfer-room-kpis">
      ${items
        .map(
          ([label, value, meta]) => `
            <article>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
              <small>${escapeHtml(meta)}</small>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderScenarioCard(label, value, meta, tone = "") {
  return `
    <article class="${tone ? `is-${escapeHtml(tone)}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function renderScenarioLine(plan = {}, type = "target") {
  const isTarget = type === "target";
  const name = plan.name || "Player";
  const meta = isTarget
    ? [getTargetStageLabel(plan.stage), plan.nextAction || getRiskLabel(plan.riskLevel)].filter(Boolean).join(" / ")
    : [plan.status || "review", plan.position].filter(Boolean).join(" / ");
  const value = isTarget
    ? `${formatOptionalMoney(plan.fee)} fee`
    : `${formatOptionalMoney(plan.estimatedValue)} value`;
  return `
    <li>
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
      <em>${escapeHtml(value)}</em>
    </li>
  `;
}

function renderScenarioPlanner() {
  const scenario = calculateScenarioPlanner();
  const capTone = scenario.capSpace < 0 ? "danger" : scenario.warnings.length ? "warn" : "good";
  const targetPreview = scenario.activeTargets.slice(0, 5);
  const outgoingPreview = scenario.outgoingPlans.slice(0, 5);
  return `
    <section class="transfer-room-scenario">
      <div class="transfer-room-section-head">
        <div>
          <p>Window impact</p>
          <h2>Scenario planner</h2>
        </div>
        <span>${escapeHtml(scenario.warnings.length ? `${scenario.warnings.length} checks` : "Aligned")}</span>
      </div>
      <div class="transfer-room-scenario-grid">
        ${renderScenarioCard("Projected cap space", formatMoney(scenario.capSpace), `${formatPercent(scenario.utilization)} cap usage`, capTone)}
        ${renderScenarioCard("Net wage change", formatMoney(scenario.netWageChange), "Incoming minus outgoing relief")}
        ${renderScenarioCard("Net fee exposure", formatMoney(scenario.netFeeExposure), "Fees minus outgoing value")}
        ${renderScenarioCard("Active deals", `${scenario.activeTargets.length}/${scenario.targetCount}`, "Budget-active pipeline")}
      </div>
      <div class="transfer-room-scenario-lanes">
        <article>
          <span>Outgoing decisions</span>
          <ul>${outgoingPreview.length ? outgoingPreview.map((plan) => renderScenarioLine(plan, "outgoing")).join("") : `<li><div><strong>No outgoing plan</strong><span>Squad plan is stable</span></div><em>${escapeHtml(formatMoney(0))}</em></li>`}</ul>
        </article>
        <article>
          <span>Incoming targets</span>
          <ul>${targetPreview.length ? targetPreview.map((plan) => renderScenarioLine(plan, "target")).join("") : `<li><div><strong>No active targets</strong><span>Monitoring does not hit budget</span></div><em>${escapeHtml(formatMoney(0))}</em></li>`}</ul>
        </article>
        <article class="${scenario.warnings.length ? "is-warn" : "is-clear"}">
          <span>Rule watch</span>
          <ul>${scenario.warnings.length ? scenario.warnings.map((warning) => `<li><div><strong>${escapeHtml(warning)}</strong><span>${escapeHtml(getLeagueProfile().label || "League profile")}</span></div></li>`).join("") : `<li><div><strong>No active blockers</strong><span>${escapeHtml(getLeagueProfile().label || "League profile")}</span></div></li>`}</ul>
        </article>
      </div>
    </section>
  `;
}

function renderDealPipeline() {
  const scenario = calculateScenarioPlanner();
  return `
    <section class="transfer-room-pipeline">
      <div class="transfer-room-section-head">
        <div>
          <p>Deal desk</p>
          <h2>Pipeline</h2>
        </div>
        <span>${escapeHtml(String(scenario.activeTargetCount))} active</span>
      </div>
      <div class="transfer-room-pipeline-grid">
        ${scenario.stageCounts
          .map(
            (stage) => `
              <article class="${stage.count ? "has-count" : ""}">
                <strong>${escapeHtml(String(stage.count))}</strong>
                <span>${escapeHtml(stage.label)}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderNotice() {
  const notice = getState().lastNotice;
  if (!notice?.message) {
    return "";
  }
  return `
    <section class="transfer-room-notice is-${escapeHtml(notice.type || "info")}">
      <div>
        <strong>${escapeHtml(notice.message)}</strong>
        ${notice.detail ? `<span>${escapeHtml(notice.detail)}</span>` : ""}
      </div>
    </section>
  `;
}

function renderRuleCheckItem(check = {}) {
  return `
    <article class="is-${escapeHtml(check.status || "clear")}">
      <div>
        <span>${escapeHtml(getRuleStatusLabel(check.status))}</span>
        <strong>${escapeHtml(check.title)}</strong>
      </div>
      <em>${escapeHtml(check.value)}</em>
      <p>${escapeHtml(check.detail)}</p>
    </article>
  `;
}

function renderRuleCheckPanel() {
  const ruleCheck = calculateRuleCheck();
  const statusText = ruleCheck.blockerCount
    ? `${ruleCheck.blockerCount} blocked`
    : ruleCheck.warningCount
      ? `${ruleCheck.warningCount} warnings`
      : "All clear";
  return `
    <section class="transfer-room-rule-check">
      <div class="transfer-room-section-head">
        <div>
          <p>${escapeHtml(getLeagueProfile().label || "League profile")}</p>
          <h2>Rule check</h2>
        </div>
        <span>${escapeHtml(statusText)}</span>
      </div>
      <div class="transfer-room-rule-check-grid">
        ${ruleCheck.checks.map(renderRuleCheckItem).join("")}
      </div>
    </section>
  `;
}

function formatAuditTime(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getAuditEvents(recordId = "") {
  const events = Array.isArray(getState().auditEvents) ? getState().auditEvents : [];
  return events
    .filter((event) => !recordId || event.targetRecordId === recordId)
    .slice(-8)
    .reverse();
}

function renderAuditTimeline(recordId = "", title = "Latest activity") {
  const events = getAuditEvents(recordId);
  return `
    <section class="transfer-room-audit">
      <div class="transfer-room-section-head">
        <div>
          <p>Audit trail</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <span>${escapeHtml(String(events.length))} events</span>
      </div>
      <div class="transfer-room-audit-list">
        ${events.length
          ? events
              .map(
                (event) => `
                  <article>
                    <time>${escapeHtml(formatAuditTime(event.createdAt))}</time>
                    <div>
                      <strong>${escapeHtml(event.message)}</strong>
                      <span>${escapeHtml([event.actorName, event.actorRole].filter(Boolean).join(" / ") || "Transfer Room user")}</span>
                      ${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ""}
                    </div>
                  </article>
                `
              )
              .join("")
          : `<article><time>Now</time><div><strong>No audited changes yet</strong><span>Transfer Room will log edits here.</span></div></article>`}
      </div>
    </section>
  `;
}

function getScenarioSummary(scenario = {}) {
  const targetCount = Object.values(scenario.targetPlans || {}).filter((plan) => plan?.recordId).length;
  const activeCount = Object.values(scenario.targetPlans || {}).filter((plan) => plan?.recordId && isTargetBudgetActive(plan)).length;
  const outgoingCount = Object.values(scenario.squadPlans || {}).filter((plan) => transferRoomOutgoingStatuses.has(plan?.status)).length;
  return `${activeCount}/${targetCount} active targets, ${outgoingCount} outgoing`;
}

function renderScenarioVersionCard(scenario = {}) {
  const isActive = scenario.id && scenario.id === getState().activeScenarioId;
  return `
    <article class="${isActive ? "is-active" : ""}">
      <div>
        <span>${escapeHtml(isActive ? "Active scenario" : formatAuditTime(scenario.createdAt))}</span>
        <strong>${escapeHtml(scenario.name || "Transfer scenario")}</strong>
        <p>${escapeHtml(scenario.notes || getScenarioSummary(scenario))}</p>
      </div>
      <small>${escapeHtml(getScenarioSummary(scenario))}</small>
      <div class="transfer-room-scenario-actions">
        <button type="button" data-transfer-activate-scenario="${escapeHtml(scenario.id)}">Activate</button>
        <button type="button" class="transfer-room-danger" data-transfer-remove-scenario="${escapeHtml(scenario.id)}">Remove</button>
      </div>
    </article>
  `;
}

function getScenarioComparisonTone(summary = {}) {
  if (summary.blockerCount || summary.capSpace < 0) {
    return "blocked";
  }
  if (summary.cap > 0 && summary.capSpace < summary.cap * 0.08) {
    return "watch";
  }
  return "ready";
}

function renderScenarioComparisonRow(item = {}) {
  const summary = item.summary || {};
  const tone = getScenarioComparisonTone(summary);
  return `
    <article class="is-${escapeHtml(tone)} ${item.isCurrent ? "is-current" : ""}">
      <div>
        <span>${escapeHtml(item.isCurrent ? "Live state" : item.meta)}</span>
        <strong>${escapeHtml(item.name)}</strong>
      </div>
      <em>${escapeHtml(formatMoney(summary.capSpace, summary.currency))}</em>
      <em>${escapeHtml(formatMoney(summary.netWageChange, summary.currency))}</em>
      <em>${escapeHtml(formatMoney(summary.netFeeExposure, summary.currency))}</em>
      <em>${escapeHtml(`${summary.activeTargetCount || 0}/${summary.targetCount || 0}`)}</em>
      <em>${escapeHtml(summary.blockerCount ? `${summary.blockerCount} blockers` : "Clear")}</em>
    </article>
  `;
}

function renderScenarioComparison(scenarios = []) {
  const rows = [
    {
      id: "current",
      name: "Current plan",
      meta: "Live state",
      isCurrent: true,
      summary: calculateScenarioSnapshot(),
    },
    ...scenarios.slice(0, 4).map((scenario) => ({
      id: scenario.id,
      name: scenario.name || "Transfer scenario",
      meta: formatAuditTime(scenario.createdAt),
      summary: calculateScenarioSnapshot(scenario),
    })),
  ];
  return `
    <div class="transfer-room-scenario-compare">
      <div class="transfer-room-scenario-compare-head">
        <div>
          <span>Scenario comparison</span>
          <strong>Cap, wages and blockers</strong>
        </div>
        <small>${escapeHtml(String(rows.length))} plan${rows.length === 1 ? "" : "s"}</small>
      </div>
      <div class="transfer-room-scenario-compare-grid">
        <div class="is-head">
          <span>Scenario</span>
          <span>Cap space</span>
          <span>Net wages</span>
          <span>Net fees</span>
          <span>Deals</span>
          <span>Gate</span>
        </div>
        ${rows.map(renderScenarioComparisonRow).join("")}
      </div>
    </div>
  `;
}

function renderScenarioVersions() {
  const state = getState();
  const canEdit = getCanEdit();
  const draft = state.scenarioDraft || {};
  const scenarios = Array.isArray(state.scenarios) ? state.scenarios.slice().reverse() : [];
  return `
    <section class="transfer-room-scenarios">
      <div class="transfer-room-section-head">
        <div>
          <p>Window planning</p>
          <h2>Scenario versions</h2>
        </div>
        <span>${escapeHtml(String(scenarios.length))} saved</span>
      </div>
      <form class="transfer-room-scenario-form" data-transfer-scenario-form>
        <label>
          <span>Name</span>
          <input type="text" value="${escapeHtml(draft.name || "")}" data-transfer-scenario-field="name" ${canEdit ? "" : "disabled"} />
        </label>
        <label>
          <span>Notes</span>
          <input type="text" value="${escapeHtml(draft.notes || "")}" data-transfer-scenario-field="notes" ${canEdit ? "" : "disabled"} />
        </label>
        <button type="button" data-transfer-save-scenario ${canEdit ? "" : "disabled"}>Save Current</button>
      </form>
      ${renderScenarioComparison(scenarios)}
      <div class="transfer-room-scenario-version-grid">
        ${scenarios.length ? scenarios.map(renderScenarioVersionCard).join("") : `<article class="transfer-room-empty">No saved scenarios yet.</article>`}
      </div>
    </section>
  `;
}

function renderOverview() {
  const profile = getLeagueProfile();
  const squadPlans = getSquadPlans();
  const targetPlans = getTargetPlans();
  const statusCounts = squadPlans.reduce((counts, plan) => {
    counts[plan.status] = (counts[plan.status] || 0) + 1;
    return counts;
  }, {});
  return `
    ${renderKpiGrid()}
    ${renderScenarioPlanner()}
    ${renderRuleCheckPanel()}
    <section class="transfer-room-overview">
      <article class="transfer-room-panel">
        <div class="transfer-room-panel-head">
          <span>Squad decisions</span>
          <strong>${squadPlans.length}</strong>
        </div>
        <div class="transfer-room-decision-grid">
          ${["keep", "review", "renew", "sell", "loan", "release"]
            .map((status) => `<div><span>${escapeHtml(status)}</span><strong>${escapeHtml(String(statusCounts[status] || 0))}</strong></div>`)
            .join("")}
        </div>
      </article>
      <article class="transfer-room-panel">
        <div class="transfer-room-panel-head">
          <span>Target board</span>
          <strong>${targetPlans.length}</strong>
        </div>
        <div class="transfer-room-target-strip">
          ${targetPlans.slice(0, 5).map(renderCompactTarget).join("") || `<p>No targets in Transfer Room yet.</p>`}
        </div>
      </article>
      <article class="transfer-room-panel transfer-room-rules-panel">
        <div class="transfer-room-panel-head">
          <span>${escapeHtml(profile.label || "Rules")}</span>
          <strong>${formatMoney(profile.salaryCap || 0)}</strong>
        </div>
        <div class="transfer-room-rule-list">
          ${(profile.rules || []).slice(0, 5).map(renderRulePill).join("")}
        </div>
      </article>
    </section>
    ${renderAuditTimeline("", "Latest activity")}
  `;
}

function renderCompactTarget(plan) {
  const snapshot = getTargetSnapshot(plan.recordId);
  return `
    <button type="button" data-transfer-open-target-profile="${escapeHtml(plan.recordId)}">
      <strong>${escapeHtml(plan.name || snapshot.name || "Saved target")}</strong>
      <span>${escapeHtml([plan.position || snapshot.position, plan.club || snapshot.club].filter(Boolean).join(" / ") || "Scouted player")}</span>
    </button>
  `;
}

function renderRulePill(rule = {}) {
  const value = rule.type === "money" ? formatMoney(rule.amount || 0) : "Required";
  return `<div><span>${escapeHtml(rule.label || "Rule")}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderSquadPlan() {
  const canEdit = getCanEdit();
  const squadPlayers = activeContext?.squadPlayers || [];
  const state = getState();
  return `
    <section class="transfer-room-table-shell">
      <div class="transfer-room-section-head">
        <div>
          <p>Own squad</p>
          <h2>Squad plan</h2>
        </div>
        <span>${escapeHtml(String(squadPlayers.length))} players from Squad Room</span>
      </div>
      <div class="transfer-room-squad-table">
        <div class="transfer-room-squad-row is-head">
          <span>Player</span><span>Decision</span><span>Salary</span><span>Value</span><span>Contract</span><span>Notes</span>
        </div>
        ${squadPlayers
          .map((player) => renderSquadRow(player, state.squadPlans?.[player.id] || {}, canEdit))
          .join("")}
      </div>
    </section>
  `;
}

function renderSquadRow(player, plan, canEdit) {
  return `
    <article class="transfer-room-squad-row">
      <div class="transfer-room-player-cell">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml([player.number && `#${player.number}`, player.position].filter(Boolean).join(" / ") || "Squad player")}</span>
      </div>
      <label>
        <select data-transfer-squad-field="status" data-transfer-player-id="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"}>
          ${renderStatusOption("keep", "Keep", plan.status)}
          ${renderStatusOption("review", "Review", plan.status)}
          ${renderStatusOption("renew", "Renew", plan.status)}
          ${renderStatusOption("sell", "Sell", plan.status)}
          ${renderStatusOption("loan", "Loan", plan.status)}
          ${renderStatusOption("release", "Release", plan.status)}
        </select>
      </label>
      <label>
        <input type="number" min="0" step="1000" value="${escapeHtml(plan.salary || "")}" data-transfer-squad-field="salary" data-transfer-player-id="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label>
        <input type="number" min="0" step="1000" value="${escapeHtml(plan.estimatedValue || "")}" data-transfer-squad-field="estimatedValue" data-transfer-player-id="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label>
        <input type="date" value="${escapeHtml(plan.contractEnd || "")}" data-transfer-squad-field="contractEnd" data-transfer-player-id="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label>
        <input type="text" value="${escapeHtml(plan.notes || "")}" data-transfer-squad-field="notes" data-transfer-player-id="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"} />
      </label>
    </article>
  `;
}

function renderTargets() {
  const targets = getTargetPlans();
  return `
    <section class="transfer-room-targets">
      <div class="transfer-room-section-head">
        <div>
          <p>Scouted and Shadow XI</p>
          <h2>Target board</h2>
        </div>
        <button type="button" data-transfer-open-workspace="scouting">Open Scouting</button>
      </div>
      ${renderDealPipeline()}
      <div class="transfer-room-target-grid">
        ${targets.length ? targets.map(renderTargetCard).join("") : `<article class="transfer-room-empty">No scouting targets have been sent or placed in Shadow XI yet.</article>`}
      </div>
    </section>
  `;
}

function renderTargetCard(plan) {
  const snapshot = getTargetSnapshot(plan.recordId);
  const canEdit = getCanEdit();
  const gateIssues = getTargetGateIssues(plan);
  const approvalSummary = getTargetApprovalSummary(plan);
  const squadOptions = (activeContext?.squadPlayers || [])
    .map((player) => `<option value="${escapeHtml(player.id)}" ${plan.replacementFor === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`)
    .join("");
  return `
    <article class="transfer-room-target-card">
      <div class="transfer-room-target-card-head">
        <div class="transfer-room-target-avatar">${snapshot.imageUrl ? `<img src="${escapeHtml(snapshot.imageUrl)}" alt="" />` : escapeHtml((plan.name || snapshot.name || "T").slice(0, 1))}</div>
        <div>
          <strong>${escapeHtml(plan.name || snapshot.name || "Saved target")}</strong>
          <span>${escapeHtml([plan.position || snapshot.position, plan.club || snapshot.club].filter(Boolean).join(" / ") || "Scouted player")}</span>
        </div>
        <button type="button" data-transfer-open-target-profile="${escapeHtml(plan.recordId)}" aria-label="Open saved transfer target profile">Open</button>
      </div>
      <div class="transfer-room-target-meta">
        <span>${escapeHtml(getTargetStageLabel(plan.stage))}</span>
        <span>${escapeHtml(getDealTypeLabel(plan.dealType))}</span>
        <span>${escapeHtml(`${getRiskLabel(plan.riskLevel)} risk`)}</span>
        <span class="${approvalSummary.rejectedCount ? "is-blocked" : approvalSummary.approvedCount === approvalSummary.total ? "is-clear" : ""}">${escapeHtml(approvalSummary.label)}</span>
        <span class="${gateIssues.length ? "is-blocked" : "is-clear"}">${escapeHtml(gateIssues.length ? `${gateIssues.length} gate blockers` : "Gate clear")}</span>
        <span>${escapeHtml(snapshot.league || "League unknown")}</span>
        <span>${escapeHtml(snapshot.fit || "Fit pending")}</span>
        <span>${escapeHtml(plan.nextAction || snapshot.signalLabel || "Next action pending")}</span>
      </div>
      <div class="transfer-room-target-fields">
        <label>
          <span>Stage</span>
          <select data-transfer-target-field="stage" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>
            ${renderSelectOptions(transferRoomTargetStageOptions, plan.stage || "monitoring")}
          </select>
        </label>
        <label>
          <span>Deal</span>
          <select data-transfer-target-field="dealType" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>
            ${renderSelectOptions(transferRoomTargetDealTypeOptions, plan.dealType || "transfer")}
          </select>
        </label>
        <label>
          <span>Fee</span>
          <input type="number" min="0" step="1000" value="${escapeHtml(plan.fee || "")}" data-transfer-target-field="fee" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label>
          <span>Wage</span>
          <input type="number" min="0" step="1000" value="${escapeHtml(plan.wage || "")}" data-transfer-target-field="wage" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label>
          <span>Risk</span>
          <select data-transfer-target-field="riskLevel" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>
            ${renderSelectOptions(transferRoomTargetRiskOptions, plan.riskLevel || "unknown")}
          </select>
        </label>
        <label>
          <span>Next action</span>
          <input type="text" value="${escapeHtml(plan.nextAction || "")}" data-transfer-target-field="nextAction" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label>
          <span>Replacement</span>
          <select data-transfer-target-field="replacementFor" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>
            <option value="">Unassigned</option>
            ${squadOptions}
          </select>
        </label>
      </div>
      <textarea rows="3" placeholder="Decision notes" data-transfer-target-field="notes" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>${escapeHtml(plan.notes || "")}</textarea>
      <button type="button" class="transfer-room-danger" data-transfer-remove-target="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>Remove</button>
    </article>
  `;
}

function renderTargetGatePanel(plan = {}) {
  const gateIssues = getTargetGateIssues(plan);
  return `
    <section class="transfer-room-stage-gate ${gateIssues.length ? "is-blocked" : "is-clear"}">
      <div class="transfer-room-target-profile-section-head">
        <span>Stage gate</span>
        <strong>${escapeHtml(gateIssues.length ? `${gateIssues.length} blockers` : "Ready")}</strong>
      </div>
      <ul>
        ${gateIssues.length
          ? gateIssues.map((issue) => `<li><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.message)}</span></li>`).join("")
          : `<li><strong>${escapeHtml(getTargetStageLabel(plan.stage))}</strong><span>Required fields are complete for this stage.</span></li>`}
      </ul>
    </section>
  `;
}

function renderApprovalPanel(plan = {}) {
  const canEdit = getCanEdit();
  const summary = getTargetApprovalSummary(plan);
  return `
    <section class="transfer-room-approval-panel">
      <div class="transfer-room-target-profile-section-head">
        <span>Approvals</span>
        <strong>${escapeHtml(summary.label)}</strong>
      </div>
      <div class="transfer-room-approval-grid">
        ${transferRoomApprovalRoles
          .map((role) => {
            const approval = plan.approvals?.[role.id] || {};
            const status = approval.status || "pending";
            return `
              <article class="is-${escapeHtml(status)}">
                <div>
                  <span>${escapeHtml(status)}</span>
                  <strong>${escapeHtml(role.label)}</strong>
                  <small>${escapeHtml(approval.actorName || "No decision yet")}</small>
                </div>
                <div class="transfer-room-approval-actions">
                  <button type="button" data-transfer-approval-action="approved" data-transfer-approval-role="${escapeHtml(role.id)}" data-transfer-approval-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>Approve</button>
                  <button type="button" data-transfer-approval-action="rejected" data-transfer-approval-role="${escapeHtml(role.id)}" data-transfer-approval-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>Reject</button>
                  <button type="button" data-transfer-approval-action="pending" data-transfer-approval-role="${escapeHtml(role.id)}" data-transfer-approval-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>Reset</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function getTargetProfileInitials(name = "") {
  const parts = String(name || "T")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase());
  return (parts.length > 1 ? `${parts[0]}${parts[1]}` : parts[0] || "T").slice(0, 2);
}

function formatOptionalMoney(value) {
  if (value === "" || value === null || value === undefined) {
    return "Not set";
  }
  return formatMoney(toNumber(value));
}

function formatTargetMetricPercentile(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return text.toLowerCase().startsWith("p") ? text.toUpperCase() : `P${text}`;
}

function getTargetProfileFacts(plan = {}, snapshot = {}) {
  const nationality = [snapshot.nationalityCode, snapshot.nationalityLabel].filter(Boolean).join(" / ") || snapshot.passportCountry || snapshot.birthCountry;
  const coreFacts = [
    { label: "Club", value: plan.club || snapshot.club },
    { label: "Position", value: plan.position || snapshot.position },
    { label: "Age", value: snapshot.age },
    { label: "Nationality", value: nationality },
    { label: "League", value: [snapshot.league, snapshot.season].filter(Boolean).join(" / ") },
    { label: "Minutes", value: snapshot.minutes },
    { label: "Best role", value: snapshot.bestRole },
    { label: "Role fit", value: snapshot.fit },
    { label: "Date of birth", value: snapshot.dateOfBirth },
    { label: "Height", value: snapshot.height },
    { label: "Weight", value: snapshot.weight },
    { label: "Source", value: plan.source || snapshot.source },
  ];
  const seenLabels = new Set();
  return [...coreFacts, ...(Array.isArray(snapshot.facts) ? snapshot.facts : [])]
    .map((fact) => ({
      label: String(fact.label || "").trim(),
      value: String(fact.value || "").trim(),
    }))
    .filter((fact) => fact.label && fact.value)
    .filter((fact) => {
      const key = fact.label.toLowerCase();
      if (seenLabels.has(key)) {
        return false;
      }
      seenLabels.add(key);
      return true;
    })
    .slice(0, 14);
}

function renderTargetProfileFact(fact) {
  return `
    <div>
      <span>${escapeHtml(fact.label)}</span>
      <strong>${escapeHtml(fact.value)}</strong>
    </div>
  `;
}

function renderTargetProfileMetric(metric = {}) {
  const percentile = formatTargetMetricPercentile(metric.percentile);
  return `
    <article class="transfer-room-target-profile-metric">
      <div>
        <span>${escapeHtml(metric.group || metric.quality || "Scouting metric")}</span>
        <strong>${escapeHtml(metric.label || "Metric")}</strong>
      </div>
      <div>
        ${metric.value ? `<small>${escapeHtml(metric.value)}</small>` : ""}
        ${percentile ? `<em>${escapeHtml(percentile)}</em>` : ""}
      </div>
    </article>
  `;
}

function renderDealSummary(plan = {}) {
  const summary = getDealSummary(plan);
  return `
    <section class="transfer-room-deal-summary is-${escapeHtml(summary.tone)}">
      <div class="transfer-room-deal-summary-status">
        <div>
          <span>Deal Summary</span>
          <strong>${escapeHtml(summary.statusLabel)}</strong>
          <small>${escapeHtml(summary.statusMeta)}</small>
        </div>
        <p>${escapeHtml(summary.nextStep)}</p>
      </div>
      <div class="transfer-room-deal-summary-grid">
        ${summary.metrics
          .map(
            (item) => `
              <article>
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <small>${escapeHtml(item.meta)}</small>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTargetProfileDealDesk(plan = {}, canEdit = false) {
  const squadOptions = (activeContext?.squadPlayers || [])
    .map((player) => `<option value="${escapeHtml(player.id)}" ${plan.replacementFor === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`)
    .join("");
  const disabled = canEdit ? "" : "disabled";
  return `
    <section class="transfer-room-target-profile-deal-grid">
      <label>
        <span>Stage</span>
        <select data-transfer-target-field="stage" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          ${renderSelectOptions(transferRoomTargetStageOptions, plan.stage || "monitoring")}
        </select>
      </label>
      <label>
        <span>Deal</span>
        <select data-transfer-target-field="dealType" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          ${renderSelectOptions(transferRoomTargetDealTypeOptions, plan.dealType || "transfer")}
        </select>
      </label>
      <label>
        <span>Fee</span>
        <input type="number" min="0" step="1000" value="${escapeHtml(plan.fee || "")}" data-transfer-target-field="fee" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Wage</span>
        <input type="number" min="0" step="1000" value="${escapeHtml(plan.wage || "")}" data-transfer-target-field="wage" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Wage period</span>
        <select data-transfer-target-field="wagePeriod" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          ${renderSelectOptions(activeContext?.wagePeriodOptions || [], plan.wagePeriod || getWagePeriod())}
        </select>
      </label>
      <label>
        <span>Replacement</span>
        <select data-transfer-target-field="replacementFor" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          <option value="">Unassigned</option>
          ${squadOptions}
        </select>
      </label>
      <label>
        <span>Contract</span>
        <input type="text" value="${escapeHtml(plan.contractStatus || "")}" data-transfer-target-field="contractStatus" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Agent</span>
        <input type="text" value="${escapeHtml(plan.agent || "")}" data-transfer-target-field="agent" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Risk</span>
        <select data-transfer-target-field="riskLevel" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          ${renderSelectOptions(transferRoomTargetRiskOptions, plan.riskLevel || "unknown")}
        </select>
      </label>
      <label>
        <span>Confidence</span>
        <select data-transfer-target-field="valuationConfidence" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>
          ${renderSelectOptions(transferRoomTargetConfidenceOptions, plan.valuationConfidence || "unknown")}
        </select>
      </label>
      <label>
        <span>Owner</span>
        <input type="text" value="${escapeHtml(plan.decisionOwner || "")}" data-transfer-target-field="decisionOwner" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Window</span>
        <input type="text" value="${escapeHtml(plan.plannedWindow || "")}" data-transfer-target-field="plannedWindow" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Next action</span>
        <input type="text" value="${escapeHtml(plan.nextAction || "")}" data-transfer-target-field="nextAction" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label>
        <span>Action date</span>
        <input type="date" value="${escapeHtml(plan.nextActionDate || "")}" data-transfer-target-field="nextActionDate" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled} />
      </label>
      <label class="is-wide">
        <span>Why this player</span>
        <textarea rows="3" data-transfer-target-field="whyThisPlayer" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>${escapeHtml(plan.whyThisPlayer || "")}</textarea>
      </label>
      <label class="is-wide">
        <span>Decision notes</span>
        <textarea rows="3" data-transfer-target-field="notes" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${disabled}>${escapeHtml(plan.notes || "")}</textarea>
      </label>
    </section>
  `;
}

function renderTargetProfileModal() {
  const state = getState();
  const recordId = state.activeTargetProfileRecordId;
  const plan = recordId ? state.targetPlans?.[recordId] : null;
  if (!recordId || !plan) {
    return "";
  }
  const snapshot = getTargetSnapshot(recordId);
  const name = plan.name || snapshot.name || "Saved target";
  const subtitle = [plan.position || snapshot.position, plan.club || snapshot.club].filter(Boolean).join(" / ") || "Saved Transfer Room target";
  const facts = getTargetProfileFacts(plan, snapshot);
  const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
  return `
    <div class="transfer-room-target-profile-overlay" data-transfer-target-profile-overlay>
      <article class="transfer-room-target-profile-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(`${name} transfer target profile`)}">
        <header class="transfer-room-target-profile-head">
          <div class="transfer-room-target-profile-avatar">
            ${snapshot.imageUrl ? `<img src="${escapeHtml(snapshot.imageUrl)}" alt="" />` : escapeHtml(getTargetProfileInitials(name))}
          </div>
          <div>
            <p>Saved target snapshot</p>
            <h2>${escapeHtml(name)}</h2>
            <span>${escapeHtml(subtitle)}</span>
          </div>
          <button type="button" data-transfer-close-target-profile aria-label="Close transfer target profile">Close</button>
        </header>
        ${snapshot.summary ? `<p class="transfer-room-target-profile-summary">${escapeHtml(snapshot.summary)}</p>` : ""}
        ${renderDealSummary(plan)}
        <div class="transfer-room-target-profile-layout">
          <section>
            <div class="transfer-room-target-profile-section-head">
              <span>Player profile</span>
              <strong>${escapeHtml(snapshot.updatedAt ? "Snapshot saved" : "Local snapshot")}</strong>
            </div>
            <div class="transfer-room-target-profile-facts">
              ${facts.length ? facts.map(renderTargetProfileFact).join("") : `<div><span>Profile</span><strong>Identity saved in Transfer Room</strong></div>`}
            </div>
          </section>
          <section>
            <div class="transfer-room-target-profile-section-head">
              <span>Transfer plan</span>
              <strong>${escapeHtml(getCurrency())}</strong>
            </div>
            ${renderTargetProfileDealDesk(plan, getCanEdit())}
            ${renderApprovalPanel(plan)}
            ${renderTargetGatePanel(plan)}
          </section>
        </div>
        <section>
          <div class="transfer-room-target-profile-section-head">
            <span>Scouting signals</span>
            <strong>${escapeHtml(snapshot.signalLabel || snapshot.bestRole || "Saved read")}</strong>
          </div>
          <div class="transfer-room-target-profile-metrics">
            ${metrics.length ? metrics.map(renderTargetProfileMetric).join("") : `<article class="transfer-room-target-profile-metric"><div><span>Snapshot</span><strong>No metric detail saved yet</strong></div><div><em>${escapeHtml(snapshot.fit || "Pending")}</em></div></article>`}
          </div>
        </section>
        ${renderAuditTimeline(recordId, "Target activity")}
      </article>
    </div>
  `;
}

function renderRules() {
  const state = getState();
  const profile = getLeagueProfile();
  const canEdit = getCanEdit();
  return `
    ${renderKpiGrid()}
    ${renderRuleCheckPanel()}
    <section class="transfer-room-rules-layout">
      <form class="transfer-room-settings" data-transfer-settings-form>
        <div class="transfer-room-section-head">
          <div>
            <p>${escapeHtml(profile.country || "Country")} / ${escapeHtml(profile.league || "League")}</p>
            <h2>${escapeHtml(profile.label || "Rule profile")}</h2>
          </div>
        </div>
        <label>
          <span>Currency</span>
          <select data-transfer-setting="currency" ${canEdit ? "" : "disabled"}>
            ${renderOptionList(activeContext?.currencyOptions || [], state.settings?.currency || "USD")}
          </select>
        </label>
        <label>
          <span>Wage period</span>
          <select data-transfer-setting="wagePeriod" ${canEdit ? "" : "disabled"}>
            ${renderOptionList(activeContext?.wagePeriodOptions || [], state.settings?.wagePeriod || "year")}
          </select>
        </label>
        <label>
          <span>Salary cap</span>
          <input type="number" min="0" step="1000" value="${escapeHtml(state.settings?.salaryCap || "")}" data-transfer-setting="salaryCap" ${canEdit ? "" : "disabled"} />
        </label>
        <label>
          <span>Internal buffer</span>
          <input type="number" min="0" step="1000" value="${escapeHtml(state.settings?.capBuffer || "")}" data-transfer-setting="capBuffer" ${canEdit ? "" : "disabled"} />
        </label>
      </form>
      <section class="transfer-room-rule-list is-large">
        ${(profile.rules || []).map(renderRuleCard).join("")}
      </section>
    </section>
  `;
}

function renderRuleCard(rule = {}) {
  const value = rule.type === "money" ? formatMoney(rule.amount || 0) : "Required";
  return `
    <article>
      <span>${escapeHtml(rule.severity || "rule")}</span>
      <strong>${escapeHtml(rule.label || "Rule")}</strong>
      <em>${escapeHtml(value)}</em>
    </article>
  `;
}

function renderAccess() {
  const state = getState();
  const canManage = getCanManageAccess();
  const teamId = state.activeTeamId;
  const selectedIds = new Set(state.accessByTeam?.[teamId]?.userIds || []);
  const users = (activeContext?.users || []).filter((user) => user.status !== "paused");
  return `
    <section class="transfer-room-access">
      <div class="transfer-room-section-head">
        <div>
          <p>Security</p>
          <h2>Selected people</h2>
        </div>
        <span>${escapeHtml(String(selectedIds.size))} selected</span>
      </div>
      <div class="transfer-room-access-list">
        ${users
          .map((user) => {
            const role = user.role || "coach";
            const isPrivileged = role === "admin" || role === "team-admin";
            const checked = selectedIds.has(user.id);
            return `
              <label class="transfer-room-access-user">
                <input type="checkbox" data-transfer-access-user="${escapeHtml(user.id)}" ${checked ? "checked" : ""} ${canManage && !isPrivileged ? "" : "disabled"} />
                <span>
                  <strong>${escapeHtml([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User")}</strong>
                  <small>${escapeHtml(isPrivileged ? `${role} (automatic)` : role)}</small>
                </span>
              </label>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderBody() {
  const tab = getState().activeTab || "overview";
  if (tab === "squad") {
    return renderSquadPlan();
  }
  if (tab === "targets") {
    return renderTargets();
  }
  if (tab === "rules") {
    return renderRules();
  }
  if (tab === "scenarios") {
    return renderScenarioVersions();
  }
  if (tab === "access") {
    return renderAccess();
  }
  return renderOverview();
}

export function render(context = {}) {
  setContext(context);
  const root = context.ui?.transferRoomWorkspace;
  if (!root) {
    return;
  }
  root.innerHTML = `
    <section class="transfer-room-shell">
      ${renderBudgetHero()}
      <nav class="transfer-room-tabs" aria-label="Transfer Room sections">
        ${renderTabButton("overview", "Overview")}
        ${renderTabButton("squad", "Squad Plan")}
        ${renderTabButton("targets", "Targets")}
        ${renderTabButton("scenarios", "Scenarios")}
        ${renderTabButton("rules", "Rules")}
        ${renderTabButton("access", "Access")}
      </nav>
      ${renderNotice()}
      ${renderBody()}
      ${renderTargetProfileModal()}
    </section>
  `;
}

export function handleClick(event, context = activeContext) {
  setContext(context);
  const tabTrigger = event.target.closest("[data-transfer-room-tab]");
  if (tabTrigger) {
    event.preventDefault();
    activeContext?.setActiveTab?.(tabTrigger.dataset.transferRoomTab);
    return;
  }

  const openWorkspaceTrigger = event.target.closest("[data-transfer-open-workspace]");
  if (openWorkspaceTrigger) {
    event.preventDefault();
    activeContext?.openWorkspace?.(openWorkspaceTrigger.dataset.transferOpenWorkspace);
    return;
  }

  const closeTargetProfileTrigger = event.target.closest("[data-transfer-close-target-profile]");
  if (closeTargetProfileTrigger || event.target.matches("[data-transfer-target-profile-overlay]")) {
    event.preventDefault();
    activeContext?.closeTargetProfile?.();
    return;
  }

  const openTargetProfileTrigger = event.target.closest("[data-transfer-open-target-profile]");
  if (openTargetProfileTrigger) {
    event.preventDefault();
    activeContext?.openTargetProfile?.(openTargetProfileTrigger.dataset.transferOpenTargetProfile);
    return;
  }

  const openScoutingTrigger = event.target.closest("[data-transfer-open-scouting]");
  if (openScoutingTrigger) {
    event.preventDefault();
    activeContext?.openScoutingRecord?.(openScoutingTrigger.dataset.transferOpenScouting);
    return;
  }

  const removeTargetTrigger = event.target.closest("[data-transfer-remove-target]");
  if (removeTargetTrigger) {
    event.preventDefault();
    activeContext?.removeTarget?.(removeTargetTrigger.dataset.transferRemoveTarget);
    return;
  }

  const approvalTrigger = event.target.closest("[data-transfer-approval-action]");
  if (approvalTrigger) {
    event.preventDefault();
    activeContext?.setTargetApproval?.(
      approvalTrigger.dataset.transferApprovalRecordId,
      approvalTrigger.dataset.transferApprovalRole,
      approvalTrigger.dataset.transferApprovalAction
    );
    return;
  }

  const saveScenarioTrigger = event.target.closest("[data-transfer-save-scenario]");
  if (saveScenarioTrigger) {
    event.preventDefault();
    const form = saveScenarioTrigger.closest("[data-transfer-scenario-form]");
    activeContext?.saveScenario?.({
      name: form?.querySelector('[data-transfer-scenario-field="name"]')?.value || "",
      notes: form?.querySelector('[data-transfer-scenario-field="notes"]')?.value || "",
    });
    return;
  }

  const activateScenarioTrigger = event.target.closest("[data-transfer-activate-scenario]");
  if (activateScenarioTrigger) {
    event.preventDefault();
    activeContext?.activateScenario?.(activateScenarioTrigger.dataset.transferActivateScenario);
    return;
  }

  const removeScenarioTrigger = event.target.closest("[data-transfer-remove-scenario]");
  if (removeScenarioTrigger) {
    event.preventDefault();
    activeContext?.removeScenario?.(removeScenarioTrigger.dataset.transferRemoveScenario);
  }
}

export function handleInput() {}

export function handleChange(event, context = activeContext) {
  setContext(context);
  const setting = event.target.closest("[data-transfer-setting]");
  if (setting) {
    activeContext?.updateSettings?.({
      [setting.dataset.transferSetting]: setting.value,
    });
    return;
  }

  const squadField = event.target.closest("[data-transfer-squad-field]");
  if (squadField) {
    activeContext?.updateSquadPlan?.(squadField.dataset.transferPlayerId, {
      [squadField.dataset.transferSquadField]: squadField.value,
    });
    return;
  }

  const targetField = event.target.closest("[data-transfer-target-field]");
  if (targetField) {
    activeContext?.updateTargetPlan?.(targetField.dataset.transferRecordId, {
      [targetField.dataset.transferTargetField]: targetField.value,
    });
    return;
  }

  const scenarioField = event.target.closest("[data-transfer-scenario-field]");
  if (scenarioField) {
    activeContext?.updateScenarioDraft?.({
      [scenarioField.dataset.transferScenarioField]: scenarioField.value,
    });
    return;
  }

  const accessToggle = event.target.closest("[data-transfer-access-user]");
  if (accessToggle) {
    activeContext?.toggleAccessUser?.(accessToggle.dataset.transferAccessUser, accessToggle.checked);
  }
}

export function handleSubmit(event) {
  event.preventDefault();
}
