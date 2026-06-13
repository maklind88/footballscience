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

function getContactLog(deps = {}, state = getActionState(deps)) {
  return Array.isArray(deps.getContactLog?.(state)) ? deps.getContactLog(state) : Array.isArray(state?.contactLog) ? state.contactLog : [];
}

function getTargets(deps = {}, state = getActionState(deps)) {
  return Array.isArray(deps.getTargets?.(state)) ? deps.getTargets(state) : Array.isArray(state?.targets) ? state.targets : [];
}

function getTargetRecordId(deps = {}, target = {}) {
  return normalizeText(deps, target?.recordId, 160);
}

function findTargetByRecordId(deps = {}, recordId = "", state = getActionState(deps)) {
  const id = normalizeText(deps, recordId, 160);
  return getTargets(deps, state).find((target) => getTargetRecordId(deps, target) === id) || null;
}

function refreshProfileSurface(deps = {}, recordId = "", state = getActionState(deps)) {
  const selectedRecordId = normalizeText(deps, state?.selectedRecordId, 160);
  if (selectedRecordId === normalizeText(deps, recordId, 160) && deps.hasProfileModal?.() === true) {
    deps.renderProfileModal?.(recordId);
    return "profile-modal";
  }
  deps.renderWorkspace?.({ preserveFocus: true });
  return "workspace";
}

export function createScoutingProfileActions(deps = {}) {
  function createContactLogEntry(recordId, entry = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const id = normalizeText(deps, recordId, 160);
    if (!id) {
      return { changed: false, recordId: id, status: "empty" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, recordId: id, status: "empty" };
    }
    const nextEntry = deps.normalizeContactLogEntry?.({
      ...entry,
      recordId: id,
    });
    if (!nextEntry?.recordId) {
      return { changed: false, recordId: id, status: "empty" };
    }
    state.contactLog = [nextEntry, ...getContactLog(deps, state)];
    const target = findTargetByRecordId(deps, id, state);
    if (target) {
      const record = deps.getRecordById?.(id);
      state.targets = getTargets(deps, state).map((item) =>
        item.id === target.id
          ? deps.createTarget?.(record, {
              ...target,
              lastContact: deps.normalizeDateText?.(entry.date) || nowIso(deps).slice(0, 10),
              nextAction: normalizeText(deps, entry.nextStep, 180) || target.nextAction,
              updatedAt: nowIso(deps),
            })
          : item
      );
      deps.touchIntelligenceCache?.();
    }
    deps.writeState?.();
    const surface = refreshProfileSurface(deps, id, state);
    return { changed: true, entry: nextEntry, recordId: id, surface, status: "updated" };
  }

  function deleteContactLogEntry(contactId) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const id = normalizeText(deps, contactId, 120);
    if (!id) {
      return { changed: false, contactId: id, status: "empty" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, contactId: id, status: "empty" };
    }
    const contacts = getContactLog(deps, state);
    const nextContacts = contacts.filter((entry) => normalizeText(deps, entry.id, 120) !== id);
    if (nextContacts.length === contacts.length) {
      return { changed: false, contactId: id, status: "missing" };
    }
    state.contactLog = nextContacts;
    deps.writeState?.();
    const selectedRecordId = normalizeText(deps, state.selectedRecordId, 160);
    const surface =
      selectedRecordId && deps.hasProfileModal?.() === true
        ? (deps.renderProfileModal?.(selectedRecordId), "profile-modal")
        : (deps.renderWorkspace?.({ preserveFocus: true }), "workspace");
    return { changed: true, contactId: id, surface, status: "updated" };
  }

  function saveMarketInfo(recordId, patch = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const id = normalizeText(deps, recordId, 160);
    if (!id) {
      return { changed: false, recordId: id, status: "empty" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, recordId: id, status: "empty" };
    }
    state.marketIntel = {
      ...(state.marketIntel && typeof state.marketIntel === "object" ? state.marketIntel : {}),
      [id]: deps.normalizeMarketInfo?.(id, {
        ...(deps.getMarketInfo?.(id, state) || {}),
        ...patch,
        updatedAt: nowIso(deps),
      }),
    };
    deps.bumpMarketIntelVersion?.();
    deps.writeState?.();
    deps.renderWorkspace?.();
    return { changed: true, recordId: id, marketInfo: state.marketIntel[id], status: "updated" };
  }

  return {
    createContactLogEntry,
    deleteContactLogEntry,
    saveMarketInfo,
  };
}
