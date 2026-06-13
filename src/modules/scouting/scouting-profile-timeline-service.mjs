function normalizeTimelineText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeTimelineHtml(value = "", escapeHtml = null) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTimelineState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : {};
}

function getNowIso(deps = {}) {
  return normalizeTimelineText(deps.now?.() || new Date().toISOString(), 40, deps.normalizeText) || new Date().toISOString();
}

function findOptionLabel(options = [], value = "", fallback = "") {
  return options.find((option) => option.value === value)?.label || fallback;
}

function getShadowRoles(deps = {}, state = {}, recordId = "") {
  const slots = Array.isArray(deps.getShadowSlots?.()) ? deps.getShadowSlots() : [];
  return slots.filter((slot) => {
    const recordIds = deps.getShadowSlotRecordIds?.(slot.id, state);
    return Array.isArray(recordIds) && recordIds.includes(recordId);
  });
}

export function createScoutingProfileTimelineService(deps = {}) {
  function normalizeText(value = "", limit = 160) {
    return normalizeTimelineText(value, limit, deps.normalizeText);
  }

  function escapeHtml(value = "") {
    return escapeTimelineHtml(value, deps.escapeHtml);
  }

  function getTimelineForRecord(record, state = getTimelineState(deps)) {
    const recordId = normalizeText(deps.getRecordId?.(record), 160);
    const target = deps.findTargetByRecordId?.(recordId, state) || null;
    const market = deps.getMarketInfo?.(recordId, state) || {};
    const shadowRoles = getShadowRoles(deps, state, recordId);
    const items = [];
    if (target) {
      items.push({
        date: target.updatedAt || target.createdAt,
        label: "Pipeline",
        title: findOptionLabel(deps.getStatusOptions?.() || [], target.status, "Pipeline updated"),
        detail: [target.priority, target.owner ? `Owner ${target.owner}` : "", target.nextAction ? `Next: ${target.nextAction}` : ""].filter(Boolean).join(" / "),
      });
    }
    if (deps.isRecordFavorited?.(recordId) === true) {
      items.push({
        date: target?.createdAt || getNowIso(deps),
        label: "Favorite",
        title: "Marked as favorite",
        detail: "Player is on the live watchlist.",
      });
    }
    shadowRoles.forEach((slot) => {
      const meta = deps.getShadowRecordMeta?.(slot.id, recordId, state) || {};
      items.push({
        date: meta.updatedAt || target?.updatedAt || getNowIso(deps),
        label: "Shadow XI",
        title: `Added to ${slot.label}`,
        detail: findOptionLabel(deps.getShadowTagOptions?.() || [], meta.tag, "Monitor"),
      });
    });
    if (market.updatedAt) {
      items.push({
        date: market.updatedAt,
        label: "Market",
        title: deps.getContractStatusLabel?.(market.contractStatus) || "Unknown / unverified",
        detail:
          [market.agent ? `Agent ${market.agent}` : "", market.estimatedFee ? `Fee ${market.estimatedFee}` : "", market.dealProbability ? `Deal ${market.dealProbability}` : ""]
            .filter(Boolean)
            .join(" / ") || "Market file updated.",
      });
    }
    (deps.getContactLogForRecord?.(recordId, state) || []).forEach((entry) => {
      items.push({
        date: entry.date || entry.createdAt,
        label: findOptionLabel(deps.getContactTypeOptions?.() || [], entry.type, "Contact"),
        title: entry.contact || entry.outcome || "Contact logged",
        detail: [entry.outcome, entry.nextStep ? `Next: ${entry.nextStep}` : "", entry.notes].filter(Boolean).join(" / "),
      });
    });
    if (target) {
      (deps.getReportsForTarget?.(target.id, state) || []).forEach((report) => {
        items.push({
          date: report.createdAt,
          label: "Report",
          title: report.title || "Report created",
          detail: `${report.recommendation || "monitor"} / confidence ${report.confidence || 3}/5`,
        });
      });
    }
    return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function renderTimeline(record, state = getTimelineState(deps)) {
    const items = getTimelineForRecord(record, state);
    return `
    <section class="scouting-profile-timeline">
      <div>
        <span>Case timeline</span>
        <strong>${items.length ? `${items.length} events` : "No case events yet"}</strong>
      </div>
      <div class="scouting-timeline-list">
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article>
                      <span>${escapeHtml(item.label)} / ${escapeHtml(String(item.date || "").slice(0, 10) || "No date")}</span>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.detail || "No detail")}</p>
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Add this player to pipeline, Shadow XI, market file or contact log to start a timeline.</p>`
        }
      </div>
    </section>
  `;
  }

  function renderContactsTab(record, state = getTimelineState(deps)) {
    const recordId = normalizeText(deps.getRecordId?.(record), 160);
    const contacts = deps.getContactLogForRecord?.(recordId, state) || [];
    const canEdit = deps.canEdit?.() === true;
    const contactTypeOptions = deps.getContactTypeOptions?.() || [];
    return `
    <section class="scouting-contact-log">
      <article class="scouting-contact-form-card">
        <div>
          <span>Contact log</span>
          <strong>Agent, club and internal notes</strong>
          <p>Log every call, video scout, live scout or internal decision touchpoint.</p>
        </div>
        ${
          canEdit
            ? `
              <form data-scouting-contact-form="${escapeHtml(recordId)}">
                <input type="date" name="date" value="${escapeHtml(getNowIso(deps).slice(0, 10))}" />
                <select name="type">
                  ${contactTypeOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
                </select>
                <input name="contact" placeholder="Contact person / scout" />
                <input name="outcome" placeholder="Outcome" />
                <input name="nextStep" placeholder="Next step" />
                <textarea name="notes" rows="3" placeholder="Notes"></textarea>
                <button type="submit" class="scouting-primary-button">Save contact</button>
              </form>
            `
            : `<p class="scouting-muted">Contact log is locked.</p>`
        }
      </article>
      <article class="scouting-contact-list-card">
        <div>
          <span>Logged contacts</span>
          <strong>${contacts.length} entries</strong>
        </div>
        <div class="scouting-contact-list">
          ${
            contacts.length
              ? contacts
                  .map(
                    (entry) => `
                      <article>
                        <div>
                          <span>${escapeHtml(entry.date)} / ${escapeHtml(findOptionLabel(contactTypeOptions, entry.type, "Contact"))}</span>
                          <strong>${escapeHtml(entry.contact || entry.outcome || "Contact")}</strong>
                          <p>${escapeHtml([entry.outcome, entry.nextStep ? `Next: ${entry.nextStep}` : "", entry.notes].filter(Boolean).join(" / ") || "No notes")}</p>
                        </div>
                        ${
                          canEdit
                            ? `<button type="button" class="scouting-contact-delete-button" data-delete-scouting-contact="${escapeHtml(entry.id)}" aria-label="Remove contact entry">
                                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                                  <path d="M9 4h6l1 2h4v2H4V6h4l1-2Z"></path>
                                  <path d="M7 10h2l.4 9h5.2l.4-9h2l-.5 10.4A1.8 1.8 0 0 1 14.7 22H9.3a1.8 1.8 0 0 1-1.8-1.6L7 10Z"></path>
                                  <path d="M10.4 11h1.5v8h-1.5v-8Zm3.7 0h1.5v8h-1.5v-8Z"></path>
                                </svg>
                              </button>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No contacts logged for this player yet.</p>`
          }
        </div>
      </article>
      ${renderTimeline(record, state)}
    </section>
  `;
  }

  return {
    getTimelineForRecord,
    renderContactsTab,
    renderTimeline,
  };
}
