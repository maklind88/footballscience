let activeContext = null;

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
  const state = getState();
  const profileId = state.settings?.leagueProfileId || "nwsl-2026";
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

function calculateBudget() {
  const state = getState();
  const profile = getLeagueProfile();
  const cap = toNumber(state.settings?.salaryCap || profile.salaryCap || 0);
  const buffer = toNumber(state.settings?.capBuffer || 0);
  const squadPlans = getSquadPlans();
  const targetPlans = getTargetPlans();
  const currentCommitment = squadPlans.reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod), 0);
  const outgoingRelief = squadPlans
    .filter((plan) => ["sell", "loan", "release"].includes(plan.status))
    .reduce((sum, plan) => sum + toAnnual(plan.salary, plan.wagePeriod), 0);
  const incomingWages = targetPlans
    .filter((plan) => plan.stage !== "paused")
    .reduce((sum, plan) => sum + toAnnual(plan.wage, plan.wagePeriod), 0);
  const incomingFees = targetPlans
    .filter((plan) => plan.stage !== "paused")
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
    ["Incoming wages", formatMoney(budget.incomingWages), `${budget.targetCount} targets`],
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
  `;
}

function renderCompactTarget(plan) {
  const snapshot = getTargetSnapshot(plan.recordId);
  return `
    <button type="button" data-transfer-open-scouting="${escapeHtml(plan.recordId)}">
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
      <div class="transfer-room-target-grid">
        ${targets.length ? targets.map(renderTargetCard).join("") : `<article class="transfer-room-empty">No scouting targets have been sent or placed in Shadow XI yet.</article>`}
      </div>
    </section>
  `;
}

function renderTargetCard(plan) {
  const snapshot = getTargetSnapshot(plan.recordId);
  const canEdit = getCanEdit();
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
        <button type="button" data-transfer-open-scouting="${escapeHtml(plan.recordId)}" aria-label="Open scouting profile">Open</button>
      </div>
      <div class="transfer-room-target-meta">
        <span>${escapeHtml(snapshot.league || "League unknown")}</span>
        <span>${escapeHtml(snapshot.fit || "Fit pending")}</span>
        <span>${escapeHtml(snapshot.signalLabel || "Signal pending")}</span>
      </div>
      <div class="transfer-room-target-fields">
        <label>
          <span>Stage</span>
          <select data-transfer-target-field="stage" data-transfer-record-id="${escapeHtml(plan.recordId)}" ${canEdit ? "" : "disabled"}>
            ${renderStatusOption("monitoring", "Monitoring", plan.stage)}
            ${renderStatusOption("shortlist", "Shortlist", plan.stage)}
            ${renderStatusOption("contact", "Contact", plan.stage)}
            ${renderStatusOption("negotiation", "Negotiation", plan.stage)}
            ${renderStatusOption("approved", "Approved", plan.stage)}
            ${renderStatusOption("paused", "Paused", plan.stage)}
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

function renderRules() {
  const state = getState();
  const profile = getLeagueProfile();
  const canEdit = getCanEdit();
  return `
    ${renderKpiGrid()}
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
        ${renderTabButton("rules", "Rules")}
        ${renderTabButton("access", "Access")}
      </nav>
      ${renderBody()}
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

  const accessToggle = event.target.closest("[data-transfer-access-user]");
  if (accessToggle) {
    activeContext?.toggleAccessUser?.(accessToggle.dataset.transferAccessUser, accessToggle.checked);
  }
}

export function handleSubmit(event) {
  event.preventDefault();
}
