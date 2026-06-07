import { getAdminActiveUserCount } from "./admin-user-renderer.mjs";

function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createAdminStructureRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getAssignableRolesForUser = typeof options.getAssignableRolesForUser === "function" ? options.getAssignableRolesForUser : () => [];
  const getRoleLabel = typeof options.getRoleLabel === "function" ? options.getRoleLabel : (role) => role || "Role";
  const getScopedClubs = typeof options.getScopedClubs === "function" ? options.getScopedClubs : () => [];
  const getScopedTeams = typeof options.getScopedTeams === "function" ? options.getScopedTeams : () => [];
  const getClubById = typeof options.getClubById === "function" ? options.getClubById : () => null;
  const getUsersForTeam = typeof options.getUsersForTeam === "function" ? options.getUsersForTeam : () => [];
  const getUserClubId = typeof options.getUserClubId === "function" ? options.getUserClubId : () => "";
  const getUserScopeLabel = typeof options.getUserScopeLabel === "function" ? options.getUserScopeLabel : () => "";
  const isPlatformAdminUser = typeof options.isPlatformAdminUser === "function" ? options.isPlatformAdminUser : () => false;
  const normalizePlatformRole = typeof options.normalizePlatformRole === "function" ? options.normalizePlatformRole : (role) => role || "";
  const hasWorkspaceScope = typeof options.hasWorkspaceScope === "function" ? options.hasWorkspaceScope : () => false;
  const isLegacyTeam = typeof options.isLegacyTeam === "function" ? options.isLegacyTeam : () => false;
  const isLegacyTeamPlaceholderName = typeof options.isLegacyTeamPlaceholderName === "function" ? options.isLegacyTeamPlaceholderName : () => false;
  const renderTeamLogoMark = typeof options.renderTeamLogoMark === "function" ? options.renderTeamLogoMark : () => "";
  const renderMiniUserStack = typeof options.renderMiniUserStack === "function" ? options.renderMiniUserStack : () => "";
  const defaultTeamId = String(options.defaultTeamId || "").trim();

  function renderRoleOptions(actor, selectedRole = "coach") {
    const allowedRoles = getAssignableRolesForUser(actor);
    const roles = allowedRoles.includes(selectedRole) ? allowedRoles : [selectedRole, ...allowedRoles].filter(Boolean);
    return Array.from(new Set(roles))
      .map((role) => `<option value="${escapeHtml(role)}" ${role === selectedRole ? "selected" : ""}>${escapeHtml(getRoleLabel(role))}</option>`)
      .join("");
  }

  function renderTeamOptions(actor, structure, selectedTeamId = "") {
    const teams = getScopedTeams(actor, structure);
    const selectedId = selectedTeamId || teams[0]?.id || defaultTeamId;
    return teams
      .map((team) => {
        const club = getClubById(team.clubId, structure);
        const label = club?.name && club.name !== team.name ? `${club.name} / ${team.name}` : team.name;
        return `<option value="${escapeHtml(team.id)}" ${team.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function renderStructurePanel(currentUser, structure, visibleUsers) {
    const scopedClubs = getScopedClubs(currentUser, structure);
    const scopedTeams = getScopedTeams(currentUser, structure).filter((team) => !isLegacyTeam(team) && !isLegacyTeamPlaceholderName(team.name));
    const platformScopedUsers = visibleUsers.filter((user) => hasWorkspaceScope(user));
    const platformScopedActiveCount = getAdminActiveUserCount(platformScopedUsers);
    const canCreateClub = isPlatformAdminUser(currentUser);
    const canCreateTeam = isPlatformAdminUser(currentUser) || normalizePlatformRole(currentUser?.role, "") === "club-admin";
    const clubOptions = scopedClubs.map((club) => `<option value="${escapeHtml(club.id)}">${escapeHtml(club.name)}</option>`).join("");
    const teamRows = scopedTeams
      .map((team) => {
        const club = getClubById(team.clubId, structure);
        const teamUsers = getUsersForTeam(visibleUsers, team.id, structure);
        const activeCount = getAdminActiveUserCount(teamUsers);
        return `
        <article class="admin-org-team-card">
          <div class="admin-org-team-head">${renderTeamLogoMark(team)}<div><strong>${escapeHtml(team.name)}</strong><span>${escapeHtml(club?.name || "Club")} · ${escapeHtml(team.level || "Team")} · ${escapeHtml(team.season || "Season")}</span></div></div>
          <div class="admin-org-team-metrics"><span>${teamUsers.length} users</span><span>${activeCount} active</span><span>${escapeHtml(team.status || "active")}</span></div>
          <div class="admin-org-team-users">${renderMiniUserStack(teamUsers)}<button type="button" class="admin-send-button admin-add-user-button" data-admin-open-create-user="${escapeHtml(team.id)}">Add user</button></div>
        </article>
      `;
      })
      .join("");
    const platformCard = platformScopedUsers.length
      ? `
        <article class="admin-org-platform-card">
          <header><div><span class="placeholder-tag">Platform</span><h3>Football Science Live</h3><p>System owner scope · not a club or team</p></div><div class="admin-org-club-stats"><span><strong>${platformScopedUsers.length}</strong> users</span><span><strong>${platformScopedActiveCount}</strong> active</span></div></header>
          <div class="admin-org-team-users">${renderMiniUserStack(platformScopedUsers)}</div>
        </article>
      `
      : "";
    const clubCards = scopedClubs
      .map((club) => {
        const clubTeams = scopedTeams.filter((team) => team.clubId === club.id);
        const clubUsers = visibleUsers.filter((user) => !hasWorkspaceScope(user) && getUserClubId(user, structure) === club.id);
        return `
        <article class="admin-org-club-card">
          <header><div><span class="placeholder-tag">Club</span><h3>${escapeHtml(club.name)}</h3><p>${escapeHtml(club.shortName || club.name)} · ${escapeHtml(club.status || "active")}</p></div><div class="admin-org-club-stats"><span><strong>${clubTeams.length}</strong> teams</span><span><strong>${clubUsers.length}</strong> users</span></div></header>
          <div class="admin-org-team-grid">
            ${
              clubTeams.length
                ? clubTeams
                    .map((team) => {
                      const teamUsers = getUsersForTeam(visibleUsers, team.id, structure);
                      return `<section class="admin-org-team-line"><div>${renderTeamLogoMark(team)}<span><strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(team.level || "Team")} · ${escapeHtml(team.season || "Season")}</small></span></div><div class="admin-org-team-users">${renderMiniUserStack(teamUsers)}<button type="button" class="admin-send-button admin-add-user-button" data-admin-open-create-user="${escapeHtml(team.id)}">Add user</button></div></section>`;
                    })
                    .join("")
                : `<p class="admin-org-empty">No teams in this club yet.</p>`
            }
          </div>
        </article>
      `;
      })
      .join("");
    return `
    <section class="admin-card admin-scope-card">
      <div class="staff-card-head"><div><h2>Club & Team Structure</h2><span>${escapeHtml(getRoleLabel(currentUser?.role))} · grouped by club, team and users</span></div></div>
      <div class="admin-scope-metrics">
        <div><span>Scope</span><strong>${escapeHtml(isPlatformAdminUser(currentUser) ? "Platform" : getUserScopeLabel(currentUser, structure))}</strong></div>
        <div><span>Clubs</span><strong>${scopedClubs.length}</strong></div>
        <div><span>Teams</span><strong>${scopedTeams.length}</strong></div>
        <div><span>Users</span><strong>${visibleUsers.length}</strong></div>
      </div>
      <div class="admin-scope-layout">
        <div class="admin-org-overview">${platformCard}${clubCards}</div>
        <div class="admin-scope-list">${teamRows}</div>
        ${
          canCreateClub || canCreateTeam
            ? `<div class="admin-scope-forms admin-org-create-panel">${
                canCreateClub
                  ? `<form id="adminClubForm" class="admin-scope-form admin-scope-create-card"><div class="admin-scope-create-copy"><span>Club setup</span><strong>Create club</strong><small>Add a new club organisation to the platform.</small></div><label><span>Club name</span><input name="clubName" placeholder="Club name" required /></label><button type="submit">Add club</button></form>`
                  : ""
              }${
                canCreateTeam
                  ? `<form id="adminTeamForm" class="admin-scope-form admin-scope-create-card"><div class="admin-scope-create-copy"><span>Team setup</span><strong>Create team</strong><small>Add a squad under the selected club.</small></div><label><span>Club</span><select name="clubId">${clubOptions}</select></label><label><span>Team name</span><input name="teamName" placeholder="Team name" required /></label><button type="submit">Add team</button></form>`
                  : ""
              }</div>`
            : ""
        }
      </div>
    </section>
  `;
  }

  return {
    renderRoleOptions,
    renderTeamOptions,
    renderStructurePanel,
  };
}
