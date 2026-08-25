function getTeamInitials(teamName = "") {
  return (
    String(teamName || "Medical")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "MED"
  );
}

export function createMedicalWorkspaceRuntimeRenderer(deps = {}) {
  const getWorkspace = typeof deps.getWorkspace === "function" ? deps.getWorkspace : () => null;
  const ensureState = typeof deps.ensureState === "function" ? deps.ensureState : () => {};
  const escapeHtml = typeof deps.escapeHtml === "function" ? deps.escapeHtml : (value) => String(value ?? "");
  const getHeroTeamName = typeof deps.getHeroTeamName === "function" ? deps.getHeroTeamName : () => "";
  const getHeroTeamLogoUrl =
    typeof deps.getHeroTeamLogoUrl === "function" ? deps.getHeroTeamLogoUrl : () => "";
  const getAccessLabel = typeof deps.getAccessLabel === "function" ? deps.getAccessLabel : () => "";
  const canViewPrivateDetails =
    typeof deps.canViewPrivateDetails === "function" ? deps.canViewPrivateDetails : () => false;
  const normalizeOperationsTab =
    typeof deps.normalizeOperationsTab === "function" ? deps.normalizeOperationsTab : (value) => value || "availability";
  const getOperationsTab = typeof deps.getOperationsTab === "function" ? deps.getOperationsTab : () => "availability";
  const setOperationsTab = typeof deps.setOperationsTab === "function" ? deps.setOperationsTab : () => {};
  const renderOperationsTopMenu =
    typeof deps.renderOperationsTopMenu === "function" ? deps.renderOperationsTopMenu : () => "";
  const renderOperationsSystem =
    typeof deps.renderOperationsSystem === "function" ? deps.renderOperationsSystem : () => "";
  const rosterRenderer = deps.rosterRenderer ?? { renderAvailabilityWorkspace: () => "" };
  const playerModalRenderer = deps.playerModalRenderer ?? { renderPlayerModal: () => "" };
  const withEnsuredState =
    typeof deps.withEnsuredState === "function"
      ? deps.withEnsuredState
      : (callback) => {
          ensureState();
          return callback();
        };

  function renderMedicalTeamWorkspace(message = "", options = {}) {
    const workspace = getWorkspace();
    if (!workspace) {
      return;
    }
    return withEnsuredState(() => {
      const teamName = getHeroTeamName();
      const teamLogoUrl = getHeroTeamLogoUrl();
      const accessLabel = getAccessLabel();
      const operationsTab = normalizeOperationsTab(getOperationsTab());
      setOperationsTab(operationsTab);
      const showAvailabilityWorkspace = !canViewPrivateDetails() || operationsTab === "availability";
      workspace.innerHTML = `
<div class="medical-shell">
<header class="medical-hero">
<div class="medical-hero-lockup">
<span class="medical-team-mark${teamLogoUrl ? " has-logo" : " is-initials"}" role="img" aria-label="${escapeHtml(`${teamName} logo`)}">
${teamLogoUrl
  ? `<img src="${escapeHtml(teamLogoUrl)}" alt="">`
  : `<strong aria-hidden="true">${escapeHtml(getTeamInitials(teamName))}</strong>`}
</span>
<div class="medical-hero-copy">
<p>Medical</p>
<h1>Medical Room</h1>
<span class="medical-team-name">${escapeHtml(teamName)}</span>
</div>
</div>
${accessLabel ? `<div class="medical-access-chip">${escapeHtml(accessLabel)}</div>` : ""}
</header>
${renderOperationsTopMenu()}
${
  showAvailabilityWorkspace
    ? rosterRenderer.renderAvailabilityWorkspace(message)
    : `${message ? `<div class="medical-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</div>` : ""}${renderOperationsSystem()}`
}
${playerModalRenderer.renderPlayerModal(options)}
</div>
`;
      if (options.focusRosterSearch) {
        const searchInput = workspace.querySelector("[data-medical-roster-search]");
        if (searchInput) {
          searchInput.focus({ preventScroll: true });
          const valueLength = searchInput.value.length;
          const selectionStart = Math.min(Number(options.searchSelectionStart ?? valueLength), valueLength);
          const selectionEnd = Math.min(Number(options.searchSelectionEnd ?? selectionStart), valueLength);
          if (typeof searchInput.setSelectionRange === "function") {
            searchInput.setSelectionRange(selectionStart, selectionEnd);
          }
        }
      }
      if (options.focusMedicalRtpPlan) {
        const focusTarget = workspace.querySelector("[data-medical-rtp-focus-target]") ?? workspace.querySelector("[data-medical-rtp-focus-row]");
        if (focusTarget) {
          focusTarget.scrollIntoView?.({ block: "center", behavior: "smooth" });
          focusTarget.focus?.({ preventScroll: true });
        }
      }
    });
  }

  return {
    renderMedicalTeamWorkspace,
  };
}
