export function renderScoutingMyTeamWorkspace(deps = {}) {
  const state = deps.ensureState();
  const canEdit = deps.canEdit();
  const players = deps.getMyTeamPlayers();
  const myTeam = deps.getMyTeamState(state);
  const assignedIds = deps.getMyTeamAssignedIds(state);
  const roleModelCount = deps.getRoleModels(state).length;
  const benchPlayers = players.filter((player) => !assignedIds.has(deps.getMyTeamPlayerId(player)));
  const pitchHeightRem = deps.getUnifiedPitchHeightRem(
    deps.shadowSlots.map((slot) => deps.normalizeMyTeamSlotPlayerIds(myTeam.slots[slot.id]).length),
    assignedIds.size
  );
  return `
    <section class="scouting-shadow-layout scouting-my-team-layout">
      <div class="scouting-shadow-pitch scouting-my-team-pitch ${deps.escapeHtml(deps.getPitchFormationClass(myTeam.formation))}" style="--my-team-pitch-height:${pitchHeightRem}rem;" aria-label="My Team ${deps.escapeHtml(myTeam.formation)}">
        ${deps.renderPitchFormationToolbar(myTeam.formation, "data-scouting-my-team-formation", canEdit, { right: true })}
        <span class="scouting-pitch-line is-half"></span>
        <span class="scouting-pitch-line is-box-top"></span>
        <span class="scouting-pitch-line is-box-bottom"></span>
        ${deps.shadowSlots
          .map((slot) => {
            const pitchPosition = deps.getMyTeamSlotPitchPosition(slot, myTeam.formation);
            const slotPlayerIds = deps.normalizeMyTeamSlotPlayerIds(myTeam.slots[slot.id]);
            const slotPlayers = slotPlayerIds.map((playerId) => deps.getMyTeamPlayerById(playerId, players)).filter(Boolean);
            return `
              <article class="scouting-shadow-slot scouting-my-team-slot${slotPlayers.length ? " is-filled" : ""}${deps.selectedMyTeamPlayerId ? " is-ready-to-drop" : ""}" style="--x:${pitchPosition.x}%;--y:${pitchPosition.y}%;" data-my-team-slot-role="${deps.escapeHtml(slot.id)}" data-scouting-my-team-drop-slot="${deps.escapeHtml(slot.id)}" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}">
                <span class="scouting-my-team-slot-pin" draggable="false" data-scouting-drag-my-team-slot="${deps.escapeHtml(slot.id)}" aria-label="Move ${deps.escapeHtml(slot.label)} position"></span>
                ${
                  slotPlayers.length
                    ? `
                      <div class="scouting-my-team-slot-card">
                        <div class="scouting-my-team-slot-head">
                          <span class="scouting-my-team-slot-role">${deps.escapeHtml(slot.label)}</span>
                          <small>${slotPlayers.length} ${slotPlayers.length === 1 ? "player" : "players"}</small>
                        </div>
                        <div class="scouting-my-team-slot-stack">
                          ${slotPlayers
                            .map((player) => {
                              const playerId = deps.getMyTeamPlayerId(player);
                              return `
                                <div class="scouting-my-team-slot-entry" data-scouting-my-team-drop-slot="${deps.escapeHtml(slot.id)}" data-scouting-my-team-drop-before="${deps.escapeHtml(playerId)}">
                                  ${deps.renderMyTeamPlayerCard(player, { compact: true, slot })}
                                </div>
                              `;
                            })
                            .join("")}
                        </div>
                        ${canEdit ? `<button type="button" class="scouting-my-team-add-to-slot" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}">+ Add player</button>` : ""}
                      </div>
                    `
                    : `
                      <button type="button" class="scouting-my-team-drop-card" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}" aria-label="Drop squad player on ${deps.escapeHtml(slot.label)}">
                        <span>${deps.escapeHtml(slot.label)}</span>
                        <strong>Drop player</strong>
                      </button>
                    `
                }
              </article>
            `;
          })
          .join("")}
      </div>
      <aside class="scouting-shadow-side scouting-my-team-side">
        <div class="scouting-shadow-card scouting-my-team-tools">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Team baseline</p>
            <span>${roleModelCount}</span>
          </div>
          <button type="button" class="scouting-primary-button" data-open-scouting-role-models>${roleModelCount ? "Manage role models" : "Create role model"}</button>
        </div>
        <div class="scouting-shadow-card">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Squad players</p>
            <span>${players.length}</span>
          </div>
          <div class="scouting-my-team-player-list" data-scouting-my-team-bench-drop>
            ${
              benchPlayers.length
                ? benchPlayers.map((player) => deps.renderMyTeamPlayerCard(player)).join("")
                : players.length
                  ? `<p class="scouting-muted">All available players are placed on the pitch.</p>`
                  : `<p class="scouting-muted">No current squad players found in Player Profiles yet.</p>`
            }
          </div>
        </div>
      </aside>
    </section>
  `;
}
