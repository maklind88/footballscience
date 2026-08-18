import { getSetPieceAssignedSlot, getSetPieceAssignment } from "./assignments.mjs";

function setVariantOverride(variant, play, slotId, profileId) {
  const baseProfileId = play.assignments.find((assignment) => assignment.slotId === slotId)?.profileId || "";
  const overrides = variant.assignmentOverrides || (variant.assignmentOverrides = []);
  const index = overrides.findIndex((assignment) => assignment.slotId === slotId);
  if (profileId === baseProfileId) {
    if (index >= 0) overrides.splice(index, 1);
    return;
  }
  const override = { slotId, profileId };
  if (index >= 0) overrides[index] = override;
  else overrides.push(override);
}

export function createSetPieceAssignmentController(options = {}) {
  const ui = options.ui;

  function setScope(scope) {
    ui.assignmentScope = scope === "variant" ? "variant" : "play";
    options.render();
  }

  function showOverview(visible = true) {
    ui.showAssignments = Boolean(visible);
    if (visible) ui.inspectorCollapsed = false;
    ui.assignmentPickerSlotId = "";
    ui.selectedElementIds.clear();
    ui.selectedDrawingIds?.clear?.();
    ui.selectedDrawingId = "";
    options.render();
  }

  function selectSlot(slotId) {
    const { variant } = options.getContext();
    if (!variant) return;
    const targetPhase = variant.phases.find((phase) => phase.elements.some((element) => element.id === slotId));
    if (!targetPhase) return;
    variant.activePhaseId = targetPhase.id;
    ui.showAssignments = false;
    ui.inspectorCollapsed = false;
    ui.assignmentPickerSlotId = slotId;
    ui.selectedElementIds = new Set([slotId]);
    ui.selectedDrawingIds?.clear?.();
    ui.selectedDrawingId = "";
    options.render();
  }

  function assignPlayer(slotId, profileId) {
    const { play, variant } = options.getContext();
    if (!play || !variant) return;
    const assignment = play.assignments.find((item) => item.slotId === slotId);
    if (!assignment) return;
    const current = getSetPieceAssignment(play, variant, slotId);
    if (current.profileId === profileId) {
      ui.assignmentPickerSlotId = "";
      options.render();
      return;
    }
    options.commit(() => {
      const occupied = getSetPieceAssignedSlot(play, variant, profileId, slotId);
      if (ui.assignmentScope === "variant") {
        setVariantOverride(variant, play, slotId, profileId);
        if (occupied) setVariantOverride(variant, play, occupied.slotId, current.profileId);
      } else {
        const previousBaseProfileId = assignment.profileId;
        assignment.profileId = profileId;
        if (occupied) {
          const occupiedBase = play.assignments.find((item) => item.slotId === occupied.slotId);
          if (occupiedBase) occupiedBase.profileId = previousBaseProfileId;
        }
        const affectedSlots = new Set([slotId, occupied?.slotId].filter(Boolean));
        play.variants.forEach((item) => {
          item.assignmentOverrides = (item.assignmentOverrides || []).filter((override) => !affectedSlots.has(override.slotId));
        });
      }
      ui.assignmentPickerSlotId = "";
    });
  }

  function updateRole(slotId, role) {
    const { play } = options.getContext();
    const assignment = play?.assignments?.find((item) => item.slotId === slotId);
    if (!assignment) return;
    options.commit(() => {
      assignment.role = String(role || "Role").trim().slice(0, 80) || "Role";
    });
  }

  return Object.freeze({ assignPlayer, selectSlot, setScope, showOverview, updateRole });
}
