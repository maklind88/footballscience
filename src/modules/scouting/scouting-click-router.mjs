function normalizeFallback(value = "", maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getClosest(target, selector) {
  return target && typeof target.closest === "function" ? target.closest(selector) : null;
}

function closeRecordMoreMenus(root, currentMenu = null) {
  root?.querySelectorAll?.(".scouting-record-more-menu[open]")?.forEach((openMenu) => {
    if (!currentMenu || openMenu !== currentMenu) {
      openMenu.removeAttribute("open");
    }
  });
}

function preventAndStop(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

export function handleScoutingWorkspaceClick(event, deps = {}) {
  const target = event?.target;
  const normalizeText = typeof deps.normalizeText === "function" ? deps.normalizeText : normalizeFallback;
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  const recordMoreMenuTrigger = getClosest(target, "[data-toggle-scouting-record-more-menu]");
  if (recordMoreMenuTrigger) {
    const menu = getClosest(recordMoreMenuTrigger, ".scouting-record-more-menu");
    const recordId = normalizeText(recordMoreMenuTrigger.dataset?.toggleScoutingRecordMoreMenu, 160);
    deps.setOpenRecordActionMenuId?.(menu?.open ? "" : recordId);
    closeRecordMoreMenus(deps.getWorkspaceRoot?.(), menu);
    return true;
  }

  if (deps.getOpenRecordActionMenuId?.() && !getClosest(target, ".scouting-record-more-menu")) {
    deps.setOpenRecordActionMenuId?.("");
    closeRecordMoreMenus(deps.getWorkspaceRoot?.());
  }

  if (deps.handleModuleClick?.(event, deps)) {
    return true;
  }

  const closeProfileTrigger = getClosest(target, "[data-close-scouting-profile]");
  const clickedProfileModal = getClosest(target, "[data-scouting-profile-modal]");
  if (closeProfileTrigger && (!clickedProfileModal || String(closeProfileTrigger.tagName || "").toUpperCase() === "BUTTON")) {
    deps.closeRecordProfile?.();
    return true;
  }

  const profileTabTrigger = getClosest(target, "[data-scouting-profile-tab]");
  if (profileTabTrigger) {
    deps.setProfileTab?.(profileTabTrigger.dataset?.scoutingProfileTab);
    return true;
  }

  const tabTrigger = getClosest(target, "[data-scouting-tab]");
  if (tabTrigger) {
    preventAndStop(event);
    deps.setActiveTab?.(tabTrigger.dataset?.scoutingTab);
    return true;
  }

  const quickViewTrigger = getClosest(target, "[data-toggle-scouting-record-details]");
  if (quickViewTrigger) {
    event?.stopPropagation?.();
    deps.toggleRecordQuickView?.(quickViewTrigger.dataset?.toggleScoutingRecordDetails);
    return true;
  }

  const favoriteTrigger = getClosest(target, "[data-toggle-scouting-favorite]");
  if (favoriteTrigger) {
    event?.stopPropagation?.();
    deps.toggleFavorite?.(favoriteTrigger.dataset?.toggleScoutingFavorite);
    return true;
  }

  const sendToTransferRoomTrigger = getClosest(target, "[data-send-scouting-record-to-transfer-room]");
  if (sendToTransferRoomTrigger) {
    preventAndStop(event);
    deps.sendRecordToTransferRoom?.(sendToTransferRoomTrigger.dataset?.sendScoutingRecordToTransferRoom);
    return true;
  }

  const recordTrigger = getClosest(target, "[data-open-scouting-record]");
  if (recordTrigger) {
    deps.openRecordProfile?.(recordTrigger.dataset?.openScoutingRecord);
    return true;
  }

  const recordRowTrigger = getClosest(target, "[data-scouting-record-row]");
  if (recordRowTrigger && !getClosest(target, "button, a, input, select, textarea, details, summary")) {
    deps.openRecordProfile?.(recordRowTrigger.dataset?.scoutingRecordRow);
    return true;
  }

  return false;
}
