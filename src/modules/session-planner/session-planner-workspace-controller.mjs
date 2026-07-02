import { createSessionPlannerPlayerBoardTidyHelpers } from "./session-planner-player-board-tidy-helpers.mjs";

export function createSessionPlannerWorkspaceController(deps = {}) {
  const {
    assignSessionPlannerBlockFieldValue,
    assignSessionPlannerPlayerBoardAutoFormationTeams,
    assignSessionPlannerPlayerBoardFormationSlots,
    buildSessionPlannerSelectionAssistant,
    canEditSessionPlanner,
    clamp,
    cloneSessionPlannerLibraryExercise,
    cloneSessionPlannerTacticalElement,
    cloneSessionPlannerTacticalFrame,
    compareMedicalPlayers,
    createSessionPlannerBlock,
    createSessionPlannerDefaultState,
    createSessionPlannerEmptySession,
    createSessionPlannerLineElement,
    createSessionPlannerPlayerBoardAutoTeamFormationSlots,
    createSessionPlannerPlayerBoardFormationSlots,
    createSessionPlannerPlayerProfileContract,
    createSessionPlannerReviewNoteFromBlock,
    createSessionPlannerReviewNoteId,
    createSessionPlannerStableId,
    createSessionPlannerTacticalController,
    createSessionPlannerVisualUploadHelpers,
    ensurePeriodizationState,
    ensurePlayerProfilesState,
    escapeHtml,
    formatScheduleDateValue,
    formatSessionPlannerHistoryTimeFromModule,
    getDashboardSessionTotalMinutes,
    getDefaultTacticalColor,
    getDefaultTacticalLineStyle,
    getElement,
    getPeriodizationDay,
    getPeriodizationMatchDayLabel,
    getPlatformAuthStore,
    getPlayerProfileRoleFitScore,
    getPlayerRoleDnaDefinition,
    getScheduleSessionEventForDate,
    getScheduledSessionTitleForDate,
    getSessionPlannerExerciseLibrary,
    getSessionPlannerExerciseReviewNotes,
    getSessionPlannerHistoryActionLabelFromModule,
    getSessionPlannerHistoryActorLabelFromModule,
    getSessionPlannerLibraryEditExercise,
    getSessionPlannerLibraryFolderById,
    getSessionPlannerLibraryNow,
    getSessionPlannerLibraryUserId,
    getSessionPlannerPlayerBoardCareerPhasePriority,
    getSessionPlannerPlayerBoardDataObject,
    getSessionPlannerPlayerBoardDefaultPosition,
    getSessionPlannerPlayerBoardNumericPriorityValue,
    getSessionPlannerPlayerBoardPlayerRoleProfile,
    getSessionPlannerPlayerBoardPositionGroup,
    getSessionPlannerPlayerBoardSourceLabel,
    getSessionPlannerPlayerBoardSquadStatusPriority,
    isCurrentPlatformUserAdmin,
    isMedicalPlayerBlockedBySquadAvailability,
    isSessionPlannerLibraryExerciseArchived,
    isSessionPlannerLibraryFolderArchived,
    isSessionPlannerTacticalGoalType,
    isSessionPlannerTacticalPlayerType,
    isTemporaryPlayerProfile,
    markSessionPlannerBlockDeleted,
    markSessionPlannerBlockFieldsUpdated,
    medicalAvailabilitySelectors,
    normalizePlayerProfileRole,
    normalizeSessionPlannerLibraryFolderExerciseIds,
    normalizeSessionPlannerPlayerBoardAutoMode,
    normalizeSessionPlannerPlayerBoardColors,
    normalizeSessionPlannerPlayerBoardCustomPeople,
    normalizeSessionPlannerPlayerBoardFormationValue,
    normalizeSessionPlannerPlayerBoardPositions,
    normalizeSessionPlannerPlayerBoardProfileKey,
    normalizeSessionPlannerPlayerBoardTeamCount,
    normalizeSessionPlannerTacticalActiveFrameId,
    normalizeSessionPlannerTacticalFrames,
    normalizeSessionPlannerTacticalPitchMode,
    normalizeSessionPlannerTacticalPlayerBadge,
    normalizeTacticalColor,
    normalizeTacticalLineStyle,
    normalizeTacticalLineWidth,
    normalizeTacticalRotation,
    parseScheduleDateValue,
    parseSessionPlannerPlayerBoardFormation,
    playerProfileRoleOptions,
    queueCentralStateWrite,
    rawDataSafetySetItem,
    readSessionPlannerState,
    readSessionPlannerStatePreservingUiSelection,
    renderSessionPlannerToast,
    sessionPlannerAutosaveBoundary,
    sessionPlannerBlockMergeFields,
    sessionPlannerMedicalAvailabilitySelectors,
    sessionPlannerPlayerBoardAutoModeOptions,
    sessionPlannerPlayerBoardColorOptions,
    sessionPlannerPlayerBoardMaxTeamCount,
    sessionPlannerPrintPaperOptions,
    sessionPlannerPrintRenderer,
    sessionPlannerPrintSectionOptions,
    sessionPlannerStorageKey,
    sessionPlannerTacticalMaxFrames,
    sessionPlannerTacticalSnapStep,
    sessionPlannerVisualRenderer,
    sessionPlannerWorkspaceRenderer,
    setSessionPlannerExerciseLibrary = () => {},
    setPlatformAutosaveStatusForKey,
    showSessionPlannerToast,
    syncSessionPlannerBoardHistoryBaseline,
    ui,
    undoSessionPlannerBoardHistory,
    win,
    writeSessionPlannerExerciseLibraryToStorage,
    writeSessionPlannerState,
    getLocalState,
    getSessionPlannerPeriodizationBridge,
    setLocalState,
  } = deps;
  const local = new Proxy({}, {
    get(_target, property) {
      return getLocalState?.()?.[property];
    },
    set(_target, property, value) {
      setLocalState?.({ [property]: value });
      return true;
    },
  });
  const { getTidiedPlayerBoardPositions } = createSessionPlannerPlayerBoardTidyHelpers({ clamp });

function getSessionPlannerSelectedSession() {
if (!local.sessionPlannerState) {
local.sessionPlannerState = createSessionPlannerDefaultState();
}
return local.sessionPlannerState.sessions?.[local.sessionPlannerState.selectedDate] ??
createSessionPlannerEmptySession(local.sessionPlannerState.selectedDate);
}
function ensureSessionPlannerSelectedSession() {
if (!local.sessionPlannerState) {
local.sessionPlannerState = createSessionPlannerDefaultState();
}
if (!local.sessionPlannerState.sessions) {
local.sessionPlannerState.sessions = {};
}
if (!local.sessionPlannerState.sessions[local.sessionPlannerState.selectedDate]) {
local.sessionPlannerState.sessions[local.sessionPlannerState.selectedDate] = createSessionPlannerEmptySession(
local.sessionPlannerState.selectedDate
);
}
return local.sessionPlannerState.sessions[local.sessionPlannerState.selectedDate];
}
function getSessionPlannerSelectedBlock() {
const session = getSessionPlannerSelectedSession();
return session.blocks.find((block) => block.id === session.selectedBlockId) ?? session.blocks[0] ?? null;
}
function selectSessionPlannerDate(dateValue) {
if (!local.sessionPlannerState || !dateValue) {
return;
}
local.sessionPlannerState.selectedDate = dateValue;
getSessionPlannerPeriodizationBridge?.()?.close({ render: false });
local.sessionPlannerLibraryOpen = false;
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerVisualPreviewOpen = false;
local.sessionPlannerTacticalboardOpen = false;
local.sessionPlannerPlayerBoardOpen = false;
local.sessionPlannerPlayerBoardAssistantOpen = false;
local.sessionPlannerPlayerBoardSelectedPlayerId = "";
local.sessionPlannerPlayerBoardSelectedPlayerIds = [];
local.sessionPlannerPlayerBoardSelectionState = null;
local.sessionPlannerTacticalPendingPoint = null;
getSessionPlannerSelectedSession();
writeSessionPlannerState();
renderSessionPlannerWorkspace();
}
function selectSessionPlannerBlock(blockId) {
const session = getSessionPlannerSelectedSession();
if (!session.blocks.some((block) => block.id === blockId)) {
return;
}
session.selectedBlockId = blockId;
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerVisualPreviewOpen = false;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function addSessionPlannerBlock() {
if (!canEditSessionPlanner()) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const blockNumber = session.blocks.length + 1;
const block = createSessionPlannerBlock({
label: `Block ${blockNumber}`,
title: "New Exercise",
focus: "",
minutes: 15,
intensity: 3,
diagram: "empty",
tacticalElements: [],
});
session.blocks.push(block);
session.selectedBlockId = block.id;
local.sessionPlannerAddMenuOpen = false;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return block;
}
function renumberSessionPlannerExerciseBlocks(session) {
if (!session?.blocks?.length) {
return;
}
let exerciseNumber = 1;
session.blocks.forEach((block) => {
if (/^Block\s+\d+$/i.test(String(block.label || ""))) {
const nextLabel = `Block ${exerciseNumber}`;
if (block.label !== nextLabel) {
block.label = nextLabel;
markSessionPlannerBlockFieldsUpdated(block, ["label"]);
}
exerciseNumber += 1;
}
});
}
function moveSessionPlannerBlock(blockId, direction) {
if (!canEditSessionPlanner() || !direction) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const currentIndex = session.blocks.findIndex((block) => block.id === blockId);
const nextIndex = currentIndex + direction;
if (currentIndex === -1 || nextIndex < 0 || nextIndex >= session.blocks.length) {
return;
}
const [block] = session.blocks.splice(currentIndex, 1);
session.blocks.splice(nextIndex, 0, block);
session.selectedBlockId = block.id;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function reorderSessionPlannerBlock(sourceBlockId, targetBlockId, placement = "before") {
if (!canEditSessionPlanner() || !sourceBlockId || !targetBlockId || sourceBlockId === targetBlockId) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const sourceIndex = session.blocks.findIndex((block) => block.id === sourceBlockId);
const targetBlock = session.blocks.find((block) => block.id === targetBlockId);
if (sourceIndex === -1 || !targetBlock) {
return;
}
const [block] = session.blocks.splice(sourceIndex, 1);
const targetIndex = session.blocks.findIndex((item) => item.id === targetBlock.id);
const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
session.blocks.splice(insertIndex, 0, block);
session.selectedBlockId = block.id;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function getSessionPlannerBlockDropPlacement(event, row) {
const rect = row.getBoundingClientRect();
return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}
function clearSessionPlannerBlockDragState() {
local.sessionPlannerDraggedBlockId = "";
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-block-row.is-dragging, .session-block-row.is-drop-before, .session-block-row.is-drop-after")
.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
}
function clearSessionPlannerLibraryDragState() {
local.sessionPlannerDraggedLibraryExerciseId = "";
local.sessionPlannerLibraryPointerDrag = null;
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-library-item.is-dragging, .session-library-folder-card.is-drop-target")
.forEach((element) => element.classList.remove("is-dragging", "is-drop-target"));
}
function updateSessionPlannerLibraryPointerDropTarget(clientX, clientY) {
const target = document.elementFromPoint(clientX, clientY)?.closest?.("[data-session-library-folder-drop]");
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-library-folder-card.is-drop-target")
.forEach((folderCard) => {
if (folderCard !== target) {
folderCard.classList.remove("is-drop-target");
}
});
target?.classList.add("is-drop-target");
return target || null;
}
function startSessionPlannerLibraryPointerDrag(event) {
const item = event.target.closest?.("[data-session-library-drag-exercise]");
if (!item || !canEditSessionPlanner() || event.button !== 0 || event.target.closest(".session-library-actions")) {
return false;
}
local.sessionPlannerLibraryPointerDrag = {
exerciseId: item.dataset.sessionLibraryDragExercise,
startX: event.clientX,
startY: event.clientY,
active: false,
};
return true;
}
function updateSessionPlannerLibraryPointerDrag(event) {
if (!local.sessionPlannerLibraryPointerDrag?.exerciseId) {
return false;
}
const deltaX = Math.abs(event.clientX - local.sessionPlannerLibraryPointerDrag.startX);
const deltaY = Math.abs(event.clientY - local.sessionPlannerLibraryPointerDrag.startY);
if (!local.sessionPlannerLibraryPointerDrag.active && deltaX + deltaY < 10) {
return true;
}
local.sessionPlannerLibraryPointerDrag.active = true;
local.sessionPlannerDraggedLibraryExerciseId = local.sessionPlannerLibraryPointerDrag.exerciseId;
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-library-drag-exercise]")
.forEach((item) => {
if (item.dataset.sessionLibraryDragExercise === local.sessionPlannerDraggedLibraryExerciseId) {
item.classList.add("is-dragging");
}
});
updateSessionPlannerLibraryPointerDropTarget(event.clientX, event.clientY);
event.preventDefault();
return true;
}
function finishSessionPlannerLibraryPointerDrag(event) {
if (!local.sessionPlannerLibraryPointerDrag?.exerciseId) {
return false;
}
const dragState = local.sessionPlannerLibraryPointerDrag;
const shouldDrop = Boolean(dragState.active);
const folderDropTarget = shouldDrop ? updateSessionPlannerLibraryPointerDropTarget(event.clientX, event.clientY) : null;
if (folderDropTarget) {
local.sessionPlannerLibrarySuppressNextClick = true;
addSessionPlannerExerciseToLibraryFolder(
dragState.exerciseId,
folderDropTarget.dataset.sessionLibraryFolderDrop
);
}
clearSessionPlannerLibraryDragState();
return shouldDrop;
}
function deleteSessionPlannerBlock(blockId) {
if (!canEditSessionPlanner()) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const blockIndex = session.blocks.findIndex((block) => block.id === blockId);
if (blockIndex === -1) {
return;
}
const block = session.blocks[blockIndex];
const exerciseName = block?.title || block?.label || "this exercise";
const shouldDelete = win.confirm(`Are you sure you want to delete "${exerciseName}" from this session?`);
if (!shouldDelete) {
return;
}
session.blocks.splice(blockIndex, 1);
markSessionPlannerBlockDeleted(session.date, blockId);
if (session.selectedBlockId === blockId) {
session.selectedBlockId = session.blocks[Math.min(blockIndex, session.blocks.length - 1)]?.id ?? "";
}
if (!session.blocks.length) {
session.title = getScheduledSessionTitleForDate(session.date) || "Session";
}
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerLibraryOpen(isOpen) {
local.sessionPlannerLibraryOpen = Boolean(isOpen);
if (local.sessionPlannerLibraryOpen) {
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerPlayerBoardOpen = false;
local.sessionPlannerPrintOverlayOpen = false;
} else {
local.sessionPlannerLibraryFilterOpen = "";
local.sessionPlannerLibraryEditExerciseId = "";
local.sessionPlannerLibraryViewExerciseId = "";
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerLibrary() {
const editExercise = getSessionPlannerLibraryEditExercise();
if (
editExercise &&
hasSessionPlannerLibraryExerciseEditChanges(editExercise) &&
!win.confirm("Discard unsaved exercise edits?")
) {
return;
}
setSessionPlannerLibraryOpen(false);
}
function setSessionPlannerAddMenuOpen(isOpen) {
local.sessionPlannerAddMenuOpen = Boolean(isOpen);
if (local.sessionPlannerAddMenuOpen) {
local.sessionPlannerLibraryOpen = false;
local.sessionPlannerPrintOverlayOpen = false;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerVisualPreviewOpen(isOpen) {
local.sessionPlannerVisualPreviewOpen = Boolean(isOpen);
if (local.sessionPlannerVisualPreviewOpen) {
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerPlayerBoardOpen = false;
local.sessionPlannerPrintOverlayOpen = false;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function syncSessionPlannerPrintModeClass() {
document.body?.classList.toggle("is-session-printing", Boolean(local.sessionPlannerPrintOverlayOpen));
}
function setSessionPlannerPrintOverlayOpen(isOpen) {
local.sessionPlannerPrintOverlayOpen = Boolean(isOpen);
if (local.sessionPlannerPrintOverlayOpen) {
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerLibraryOpen = false;
local.sessionPlannerVisualPreviewOpen = false;
local.sessionPlannerTacticalboardOpen = false;
local.sessionPlannerPlayerBoardOpen = false;
local.sessionPlannerPlayerBoardAssistantOpen = false;
ensureSessionPlannerPrintPageStyle();
}
syncSessionPlannerPrintModeClass();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerTacticalboardOpen(isOpen) {
local.sessionPlannerTacticalboardOpen = Boolean(isOpen);
if (local.sessionPlannerTacticalboardOpen) {
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerVisualPreviewOpen = false;
local.sessionPlannerPlayerBoardOpen = false;
local.sessionPlannerPlayerBoardAssistantOpen = false;
local.sessionPlannerPrintOverlayOpen = false;
syncSessionPlannerBoardHistoryBaseline("tactical", getSessionPlannerSelectedBlock());
}
local.sessionPlannerTacticalPendingPoint = null;
local.sessionPlannerTacticalDraftLineState = null;
local.sessionPlannerTacticalSelectionState = null;
local.sessionPlannerTacticalNumberPickerElementId = "";
setSessionPlannerTacticalClickSuppression(false);
clearSessionPlannerTacticalSelection();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerPlayerBoardOpen(isOpen) {
local.sessionPlannerPlayerBoardOpen = Boolean(isOpen);
local.sessionPlannerPlayerBoardAssistantOpen = false;
local.sessionPlannerPlayerBoardCustomPersonEditor = null;
if (local.sessionPlannerPlayerBoardOpen) {
local.sessionPlannerAddMenuOpen = false;
local.sessionPlannerLibraryOpen = false;
local.sessionPlannerVisualPreviewOpen = false;
local.sessionPlannerTacticalboardOpen = false;
local.sessionPlannerPrintOverlayOpen = false;
syncSessionPlannerPlayerBoardSelection(getSessionPlannerSelectedBlock());
syncSessionPlannerBoardHistoryBaseline("player", getSessionPlannerSelectedBlock());
} else {
local.sessionPlannerPlayerBoardDragState = null;
local.sessionPlannerPlayerBoardSelectionState = null;
local.sessionPlannerPlayerBoardSelectedPlayerId = "";
local.sessionPlannerPlayerBoardSelectedPlayerIds = [];
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function openSessionPlannerPlayerBoardProfile(playerId) {
if (!playerId) {
return;
}
const isVisiblePlayer = getSessionPlannerPlayerBoardPlayers().some((item) => item.player.id === playerId);
if (!isVisiblePlayer) {
return;
}
local.sessionPlannerPlayerBoardSelectedPlayerId = playerId;
local.sessionPlannerPlayerBoardAssistantOpen = false;
local.sessionPlannerPlayerBoardCustomPersonEditor = null;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerPlayerBoardProfile() {
local.sessionPlannerPlayerBoardSelectedPlayerId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function getSessionPlannerPlayerBoardVisiblePlayerIds(block = getSessionPlannerSelectedBlock()) {
return new Set(getSessionPlannerPlayerBoardPlayers(block).map((item) => item.player.id));
}
function normalizeSessionPlannerPlayerBoardSelectedIds(playerIds = [], block = getSessionPlannerSelectedBlock()) {
const visibleIds = getSessionPlannerPlayerBoardVisiblePlayerIds(block);
const selectedIds = [];
playerIds.forEach((playerId) => {
if (visibleIds.has(playerId) && !selectedIds.includes(playerId)) {
selectedIds.push(playerId);
}
});
return selectedIds;
}
function setSessionPlannerPlayerBoardSelectedPlayers(playerIds = [], options = {}) {
local.sessionPlannerPlayerBoardSelectedPlayerIds = normalizeSessionPlannerPlayerBoardSelectedIds(playerIds);
if (options.render) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
syncSessionPlannerPlayerBoardSelectionUi();
}
function toggleSessionPlannerPlayerBoardSelectedPlayer(playerId, options = {}) {
if (!playerId) {
return;
}
const currentIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds);
const nextIds = currentIds.includes(playerId)
? currentIds.filter((selectedId) => selectedId !== playerId)
: [...currentIds, playerId];
setSessionPlannerPlayerBoardSelectedPlayers(nextIds, options);
}
function syncSessionPlannerPlayerBoardSelectionUi() {
const selectedIds = new Set(normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds));
const selectedCount = selectedIds.size;
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-player-board-token]")
.forEach((token) => {
token.classList.toggle("is-selected", selectedIds.has(token.dataset.sessionPlayerBoardToken));
});
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-player-board-selected-count]")
.forEach((item) => {
item.textContent = `${selectedCount} selected`;
});
ui.sessionPlannerWorkspace
?.querySelectorAll(
[
"[data-session-player-board-color]",
"[data-session-player-board-color-select]",
"[data-session-player-board-clear-colors]",
"[data-session-player-board-apply-formation]",
"[data-session-player-board-prioritize]",
"[data-session-player-board-tidy-selected]",
].join(", ")
)
.forEach((button) => {
button.disabled = button.matches("[data-session-player-board-tidy-selected]")
? selectedCount < 2
: selectedCount === 0;
});
}
function getSessionPlannerPlayerBoardSelectedColorIds() {
return normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds);
}
function updateSessionPlannerPlayerBoardSelectedColor(colorValue) {
const block = getSessionPlannerSelectedBlock();
const selectedIds = getSessionPlannerPlayerBoardSelectedColorIds();
if (!block || !selectedIds.length) {
return;
}
const color = colorValue ? normalizeTacticalColor(colorValue, "") : "";
if (!block.playerBoardColors || typeof block.playerBoardColors !== "object") {
block.playerBoardColors = {};
}
selectedIds.forEach((playerId) => {
if (color) {
block.playerBoardColors[playerId] = color;
} else {
delete block.playerBoardColors[playerId];
}
});
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function clearSessionPlannerPlayerBoardSelectedColors() {
const selectedIds = getSessionPlannerPlayerBoardSelectedColorIds();
if (!selectedIds.length) {
showSessionPlannerToast("Select players before clearing colours.", "error");
return;
}
updateSessionPlannerPlayerBoardSelectedColor("");
showSessionPlannerToast(`Colour cleared for ${selectedIds.length} player${selectedIds.length === 1 ? "" : "s"}.`);
}
function tidySelectedSessionPlannerPlayerBoardPlayers() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (selectedIds.length < 2) {
showSessionPlannerToast("Select at least two players to tidy.", "error");
return;
}
const selectedIdSet = new Set(selectedIds);
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const spacing = getSessionPlannerPlayerBoardReadableSpacing(boardPlayers.length, "preview");
const selectedEntries = [];
const fixedEntries = [];
boardPlayers.forEach((item, index) => {
const playerId = item?.player?.id;
if (!playerId) {
return;
}
const position = getSessionPlannerPlayerBoardPosition(block, item, index, boardPlayers);
const entry = {
id: playerId,
order: index,
x: clamp(Number(position.x) || 50, 4, 96),
y: clamp(Number(position.y) || 50, 7, 93),
};
if (selectedIdSet.has(playerId)) {
selectedEntries.push(entry);
} else {
fixedEntries.push(entry);
}
});
const arrangedEntries = getTidiedPlayerBoardPositions(selectedEntries, fixedEntries, {
minX: spacing.minX,
minY: spacing.minY,
minBoundsX: 4,
maxBoundsX: 96,
minBoundsY: 7,
maxBoundsY: 93,
});
if (!arrangedEntries.length) {
return;
}
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
arrangedEntries.forEach((entry) => {
block.playerBoardPositions[entry.id] = {
x: Number(entry.x.toFixed(2)),
y: Number(entry.y.toFixed(2)),
};
});
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`Tidied ${arrangedEntries.length} selected player${arrangedEntries.length === 1 ? "" : "s"}.`);
}
function getSessionPlannerPlayerBoardContextPosition(event, board) {
const rect = board?.getBoundingClientRect?.();
if (!rect?.width || !rect?.height) {
return { x: 50, y: 50 };
}
return {
x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98),
y: clamp(((event.clientY - rect.top) / rect.height) * 100, 4, 96),
};
}
function normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(value, limit = 72) {
return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}
function getSessionPlannerPlayerBoardCustomPersonKind(role, name) {
const text = `${role || ""} ${name || ""}`.toLowerCase();
return /staff|coach|leader|ledare|tr[aä]nare|assistent/.test(text) ? "staff" : "player";
}
function removeSessionPlannerPlayerBoardCustomPerson(playerId) {
const block = getSessionPlannerSelectedBlock();
if (!block || !playerId) {
return;
}
const people = getSessionPlannerPlayerBoardCustomPeople(block);
const person = people.find((item) => item.id === playerId);
if (!person) {
return;
}
const shouldRemove = win.confirm(`Remove ${person.name} from this player board?`);
if (!shouldRemove) {
return;
}
block.playerBoardCustomPeople = people.filter((item) => item.id !== playerId);
if (block.playerBoardPositions && typeof block.playerBoardPositions === "object") {
delete block.playerBoardPositions[playerId];
}
if (block.playerBoardColors && typeof block.playerBoardColors === "object") {
delete block.playerBoardColors[playerId];
}
setSessionPlannerPlayerBoardSelectedPlayers(
local.sessionPlannerPlayerBoardSelectedPlayerIds.filter((selectedId) => selectedId !== playerId)
);
markSessionPlannerBlockFieldsUpdated(block, [
"playerBoardCustomPeople",
"playerBoardPositions",
"playerBoardColors",
]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${person.name} removed from this player board.`);
}
function openSessionPlannerPlayerBoardCustomPersonEditor(editor = {}) {
local.sessionPlannerPlayerBoardCustomPersonEditor = {
mode: editor.mode === "edit" ? "edit" : "add",
personId: String(editor.personId || ""),
position: editor.position || null,
};
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerPlayerBoardCustomPersonEditor() {
local.sessionPlannerPlayerBoardCustomPersonEditor = null;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function saveSessionPlannerPlayerBoardCustomPersonFromForm(form) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
const editor = local.sessionPlannerPlayerBoardCustomPersonEditor;
if (!block || !editor) {
return;
}
const formData = new FormData(form);
const name = normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(formData.get("name"));
if (!name) {
showSessionPlannerToast("Add a name first.", "error");
return;
}
const role = normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(formData.get("role"), 36);
const kindInput = String(formData.get("kind") || "").trim();
const kind = kindInput === "staff" ? "staff" : getSessionPlannerPlayerBoardCustomPersonKind(role, name);
const people = getSessionPlannerPlayerBoardCustomPeople(block);
if (editor.mode === "edit" && editor.personId) {
const personIndex = people.findIndex((person) => person.id === editor.personId);
if (personIndex < 0) {
return;
}
people[personIndex] = {
...people[personIndex],
name,
role,
kind,
};
block.playerBoardCustomPeople = people;
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardCustomPeople"]);
local.sessionPlannerPlayerBoardCustomPersonEditor = null;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${name} updated.`);
return;
}
const person = {
id: createSessionPlannerStableId("player-board-person"),
name,
role,
kind,
createdAt: new Date().toISOString(),
};
block.playerBoardCustomPeople = [...people, person];
block.playerBoardLayoutMode = "manual";
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardPositions[person.id] = editor.position || { x: 50, y: 50 };
markSessionPlannerBlockFieldsUpdated(block, [
"playerBoardCustomPeople",
"playerBoardLayoutMode",
"playerBoardPositions",
]);
local.sessionPlannerPlayerBoardCustomPersonEditor = null;
setSessionPlannerPlayerBoardSelectedPlayers([person.id]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${name} added to this player board.`);
}
function handleSessionPlannerPlayerBoardContextMenu(event) {
if (event.target.closest?.("[data-session-player-board-person-editor]")) {
return;
}
const board = event.target.closest?.("[data-session-player-board]");
if (!board || !local.sessionPlannerPlayerBoardOpen) {
return;
}
event.preventDefault();
const token = event.target.closest?.("[data-session-player-board-token]");
const playerId = token?.dataset?.sessionPlayerBoardToken || "";
if (playerId && isSessionPlannerPlayerBoardCustomPersonId(playerId)) {
openSessionPlannerPlayerBoardCustomPersonEditor({ mode: "edit", personId: playerId });
return;
}
if (playerId) {
openSessionPlannerPlayerBoardProfile(playerId);
return;
}
openSessionPlannerPlayerBoardCustomPersonEditor({
mode: "add",
position: getSessionPlannerPlayerBoardContextPosition(event, board),
});
}
function resetSessionPlannerPlayerBoardPositions() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const shouldReset = win.confirm(
"Reset player board? This will move the players back to their starting positions and restore the player buttons."
);
if (!shouldReset) {
return;
}
block.playerBoardLayoutMode = "auto";
block.playerBoardPositions = {};
block.playerBoardColors = {};
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions", "playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Players reset to starting positions and default buttons.");
}
function getSessionPlannerTacticalFrames(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return [];
}
const frames = normalizeSessionPlannerTacticalFrames(block.tacticalFrames);
block.tacticalFrames = frames;
block.tacticalActiveFrameId = normalizeSessionPlannerTacticalActiveFrameId(block.tacticalActiveFrameId, frames);
return frames;
}
function getSessionPlannerTacticalActiveFrameId(block = getSessionPlannerSelectedBlock()) {
return normalizeSessionPlannerTacticalActiveFrameId(block?.tacticalActiveFrameId, getSessionPlannerTacticalFrames(block));
}
function ensureSessionPlannerTacticalFrames(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return [];
}
const frames = getSessionPlannerTacticalFrames(block);
if (frames.length) {
return frames;
}
const firstFrame = cloneSessionPlannerTacticalFrame(
{
label: "Frame 1",
elements: Array.isArray(block.tacticalElements) ? block.tacticalElements : [],
},
0
);
block.tacticalFrames = [firstFrame];
block.tacticalActiveFrameId = firstFrame.id;
return block.tacticalFrames;
}
function syncSessionPlannerTacticalActiveFrame(block = getSessionPlannerSelectedBlock()) {
const frames = ensureSessionPlannerTacticalFrames(block);
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeFrame = frames.find((frame) => frame.id === activeFrameId);
if (activeFrame) {
activeFrame.elements = Array.isArray(block.tacticalElements)
? block.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [];
}
return frames;
}
function persistSessionPlannerTacticalElements(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return;
}
const fields = ["tacticalElements"];
if (Array.isArray(block.tacticalFrames) && block.tacticalFrames.length) {
syncSessionPlannerTacticalActiveFrame(block);
fields.push("tacticalFrames", "tacticalActiveFrameId");
}
markSessionPlannerBlockFieldsUpdated(block, fields);
writeSessionPlannerState();
}
function commitSessionPlannerTacticalFrames(block, frames, activeFrameId) {
if (!block || !Array.isArray(frames) || !frames.length) {
return false;
}
const normalizedFrames = normalizeSessionPlannerTacticalFrames(frames);
const nextActiveFrameId = normalizeSessionPlannerTacticalActiveFrameId(activeFrameId, normalizedFrames);
const activeFrame = normalizedFrames.find((frame) => frame.id === nextActiveFrameId) ?? normalizedFrames[0];
block.tacticalFrames = normalizedFrames;
block.tacticalActiveFrameId = activeFrame.id;
block.tacticalElements = activeFrame.elements.map(cloneSessionPlannerTacticalElement);
local.sessionPlannerTacticalPendingPoint = null;
local.sessionPlannerTacticalDraftLineState = null;
local.sessionPlannerTacticalSelectionState = null;
clearSessionPlannerTacticalSelection();
markSessionPlannerBlockFieldsUpdated(block, ["tacticalElements", "tacticalFrames", "tacticalActiveFrameId"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return true;
}
function addSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length >= sessionPlannerTacticalMaxFrames) {
showSessionPlannerToast(`Max ${sessionPlannerTacticalMaxFrames} frames per board.`, "warning");
return;
}
const nextFrame = cloneSessionPlannerTacticalFrame(
{
label: `Frame ${frames.length + 1}`,
elements: block.tacticalElements,
},
frames.length
);
commitSessionPlannerTacticalFrames(block, [...frames, nextFrame], nextFrame.id);
}
function selectSessionPlannerTacticalFrame(frameId) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
const targetFrame = frames.find((frame) => frame.id === frameId);
if (!targetFrame || targetFrame.id === block.tacticalActiveFrameId) {
return;
}
commitSessionPlannerTacticalFrames(block, frames, targetFrame.id);
}
function duplicateSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length >= sessionPlannerTacticalMaxFrames) {
showSessionPlannerToast(`Max ${sessionPlannerTacticalMaxFrames} frames per board.`, "warning");
return;
}
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));
const sourceFrame = frames[activeIndex] ?? frames[0];
const duplicateFrame = cloneSessionPlannerTacticalFrame(
{
label: `Frame ${frames.length + 1}`,
elements: sourceFrame.elements,
},
frames.length
);
const nextFrames = [...frames];
nextFrames.splice(activeIndex + 1, 0, duplicateFrame);
commitSessionPlannerTacticalFrames(block, nextFrames, duplicateFrame.id);
}
function deleteSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length <= 1) {
showSessionPlannerToast("Keep at least one frame on the board.", "warning");
return;
}
if (!win.confirm("Delete this tactical board frame?")) {
return;
}
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));
const nextFrames = frames.filter((frame) => frame.id !== activeFrameId);
const nextFrame = nextFrames[Math.min(activeIndex, nextFrames.length - 1)] ?? nextFrames[0];
commitSessionPlannerTacticalFrames(block, nextFrames, nextFrame.id);
}
const sessionPlannerTacticalController = createSessionPlannerTacticalController({
  canEditSessionPlanner: (...args) => canEditSessionPlanner(...args),
  clamp,
  cloneSessionPlannerTacticalElement,
  createSessionPlannerLineElement,
  createSessionPlannerStableId,
  getDefaultTacticalColor,
  getDefaultTacticalLineStyle,
  getSessionPlannerSelectedBlock: (...args) => getSessionPlannerSelectedBlock(...args),
  getSessionPlannerTacticalEndpointCoordinates,
  isSessionPlannerTacticalGoalType,
  isSessionPlannerTacticalPlayerType,
  markSessionPlannerBlockFieldsUpdated: (...args) => markSessionPlannerBlockFieldsUpdated(...args),
  normalizeSessionPlannerTacticalPitchMode,
  normalizeSessionPlannerTacticalPlayerBadge,
  normalizeTacticalColor,
  normalizeTacticalLineStyle,
  normalizeTacticalLineWidth,
  normalizeTacticalRotation,
  persistSessionPlannerTacticalElements: (...args) => persistSessionPlannerTacticalElements(...args),
  renderSessionPlannerExerciseVisual: (...args) => renderSessionPlannerExerciseVisual(...args),
  renderSessionPlannerWorkspace: (...args) => renderSessionPlannerWorkspace(...args),
  sessionPlannerTacticalSnapStep,
  showSessionPlannerToast: (...args) => showSessionPlannerToast(...args),
  ui,
  undoSessionPlannerBoardHistory: (...args) => undoSessionPlannerBoardHistory(...args),
  win,
  writeSessionPlannerState: (...args) => writeSessionPlannerState(...args),
  getLocalState: () => ({
    sessionPlannerTacticalboardOpen: local.sessionPlannerTacticalboardOpen,
    sessionPlannerTacticalTool: local.sessionPlannerTacticalTool,
    sessionPlannerTacticalColor: local.sessionPlannerTacticalColor,
    sessionPlannerTacticalLineWidth: local.sessionPlannerTacticalLineWidth,
    sessionPlannerTacticalLineStyle: local.sessionPlannerTacticalLineStyle,
    sessionPlannerTacticalSnapEnabled: local.sessionPlannerTacticalSnapEnabled,
    sessionPlannerTacticalPendingPoint: local.sessionPlannerTacticalPendingPoint,
    sessionPlannerTacticalSelectedElementId: local.sessionPlannerTacticalSelectedElementId,
    sessionPlannerTacticalSelectedElementIds: local.sessionPlannerTacticalSelectedElementIds,
    sessionPlannerTacticalDragState: local.sessionPlannerTacticalDragState,
    sessionPlannerTacticalDraftLineState: local.sessionPlannerTacticalDraftLineState,
    sessionPlannerTacticalFreehandState: local.sessionPlannerTacticalFreehandState,
    sessionPlannerTacticalSelectionState: local.sessionPlannerTacticalSelectionState,
    sessionPlannerTacticalSuppressNextClick: local.sessionPlannerTacticalSuppressNextClick,
    sessionPlannerTacticalSuppressNextClickAt: local.sessionPlannerTacticalSuppressNextClickAt,
    sessionPlannerTacticalLastPlacementClick: local.sessionPlannerTacticalLastPlacementClick,
    sessionPlannerTacticalLastPlacement: local.sessionPlannerTacticalLastPlacement,
    sessionPlannerTacticalClipboard: local.sessionPlannerTacticalClipboard,
    sessionPlannerTacticalClipboardPasteCount: local.sessionPlannerTacticalClipboardPasteCount,
    sessionPlannerTacticalNumberPickerElementId: local.sessionPlannerTacticalNumberPickerElementId,
  }),
  setLocalState: (patch = {}) => {
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalboardOpen")) local.sessionPlannerTacticalboardOpen = patch.sessionPlannerTacticalboardOpen;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalTool")) local.sessionPlannerTacticalTool = patch.sessionPlannerTacticalTool;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalColor")) local.sessionPlannerTacticalColor = patch.sessionPlannerTacticalColor;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLineWidth")) local.sessionPlannerTacticalLineWidth = patch.sessionPlannerTacticalLineWidth;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLineStyle")) local.sessionPlannerTacticalLineStyle = patch.sessionPlannerTacticalLineStyle;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSnapEnabled")) local.sessionPlannerTacticalSnapEnabled = patch.sessionPlannerTacticalSnapEnabled;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalPendingPoint")) local.sessionPlannerTacticalPendingPoint = patch.sessionPlannerTacticalPendingPoint;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectedElementId")) local.sessionPlannerTacticalSelectedElementId = patch.sessionPlannerTacticalSelectedElementId;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectedElementIds")) local.sessionPlannerTacticalSelectedElementIds = patch.sessionPlannerTacticalSelectedElementIds;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalDragState")) local.sessionPlannerTacticalDragState = patch.sessionPlannerTacticalDragState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalDraftLineState")) local.sessionPlannerTacticalDraftLineState = patch.sessionPlannerTacticalDraftLineState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalFreehandState")) local.sessionPlannerTacticalFreehandState = patch.sessionPlannerTacticalFreehandState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectionState")) local.sessionPlannerTacticalSelectionState = patch.sessionPlannerTacticalSelectionState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSuppressNextClick")) local.sessionPlannerTacticalSuppressNextClick = patch.sessionPlannerTacticalSuppressNextClick;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSuppressNextClickAt")) local.sessionPlannerTacticalSuppressNextClickAt = patch.sessionPlannerTacticalSuppressNextClickAt;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLastPlacementClick")) local.sessionPlannerTacticalLastPlacementClick = patch.sessionPlannerTacticalLastPlacementClick;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLastPlacement")) local.sessionPlannerTacticalLastPlacement = patch.sessionPlannerTacticalLastPlacement;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalClipboard")) local.sessionPlannerTacticalClipboard = patch.sessionPlannerTacticalClipboard;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalClipboardPasteCount")) local.sessionPlannerTacticalClipboardPasteCount = patch.sessionPlannerTacticalClipboardPasteCount;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalNumberPickerElementId")) local.sessionPlannerTacticalNumberPickerElementId = patch.sessionPlannerTacticalNumberPickerElementId;
  },
});
function refreshSessionPlannerTacticalboardCanvas(...args) {
return sessionPlannerTacticalController.refreshSessionPlannerTacticalboardCanvas(...args);
}
function isSessionPlannerTacticalLineTool(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalLineTool(...args);
}
function isSessionPlannerTacticalStrokeElement(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalStrokeElement(...args);
}
function isSessionPlannerTacticalPlacementTool(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalPlacementTool(...args);
}
function uniqueValues(...args) {
return sessionPlannerTacticalController.uniqueValues(...args);
}
function getSessionPlannerTacticalSelectedElementIds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalSelectedElementIds(...args);
}
function setSessionPlannerTacticalSelectedElements(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalSelectedElements(...args);
}
function isSessionPlannerTacticalSelectionToggleModifier(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalSelectionToggleModifier(...args);
}
function toggleSessionPlannerTacticalElementSelection(...args) {
return sessionPlannerTacticalController.toggleSessionPlannerTacticalElementSelection(...args);
}
function clearSessionPlannerTacticalSelection(...args) {
return sessionPlannerTacticalController.clearSessionPlannerTacticalSelection(...args);
}
function setSessionPlannerTacticalClickSuppression(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalClickSuppression(...args);
}
function setSessionPlannerTacticalPitchMode(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalPitchMode(...args);
}
function openSessionPlannerTacticalNumberPicker(...args) {
return sessionPlannerTacticalController.openSessionPlannerTacticalNumberPicker(...args);
}
function updateSessionPlannerTacticalPlayerNumber(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalPlayerNumber(...args);
}
function updateSelectedSessionPlannerTacticalPlayerBadges(...args) {
return sessionPlannerTacticalController.updateSelectedSessionPlannerTacticalPlayerBadges(...args);
}
function isSessionPlannerTacticalElementSelected(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalElementSelected(...args);
}
function shouldDragSessionPlannerTacticalSelectionGroup(...args) {
return sessionPlannerTacticalController.shouldDragSessionPlannerTacticalSelectionGroup(...args);
}
function getSessionPlannerTacticalDragElementIds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalDragElementIds(...args);
}
function setSessionPlannerTacticalTool(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalTool(...args);
}
function clearSelectedSessionPlannerTacticalBoard(...args) {
return sessionPlannerTacticalController.clearSelectedSessionPlannerTacticalBoard(...args);
}
function undoSelectedSessionPlannerTacticalBoardAction(...args) {
return sessionPlannerTacticalController.undoSelectedSessionPlannerTacticalBoardAction(...args);
}
function removeSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.removeSessionPlannerTacticalElement(...args);
}
function removeSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.removeSelectedSessionPlannerTacticalElement(...args);
}
function addSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.addSessionPlannerTacticalElement(...args);
}
function snapSessionPlannerTacticalValue(...args) {
return sessionPlannerTacticalController.snapSessionPlannerTacticalValue(...args);
}
function snapSessionPlannerTacticalPoint(...args) {
return sessionPlannerTacticalController.snapSessionPlannerTacticalPoint(...args);
}
function shouldSnapSessionPlannerTacticalEvent(...args) {
return sessionPlannerTacticalController.shouldSnapSessionPlannerTacticalEvent(...args);
}
function getSessionPlannerTacticalCanvasPoint(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalCanvasPoint(...args);
}
function getSessionPlannerTacticalPointFromRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalPointFromRect(...args);
}
function getSessionPlannerTacticalElementById(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementById(...args);
}
function getSessionPlannerTacticalSelectionRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalSelectionRect(...args);
}
function getSessionPlannerTacticalElementBounds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementBounds(...args);
}
function isSessionPlannerTacticalPointInRect(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalPointInRect(...args);
}
function getSessionPlannerTacticalElementSelectionPoints(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementSelectionPoints(...args);
}
function isSessionPlannerTacticalElementInSelectionRect(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalElementInSelectionRect(...args);
}
function getSessionPlannerTacticalElementsInRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementsInRect(...args);
}
function renderSessionPlannerTacticalSelectionBox(...args) {
return sessionPlannerTacticalController.renderSessionPlannerTacticalSelectionBox(...args);
}
function getSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.getSelectedSessionPlannerTacticalElement(...args);
}
function getSelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.getSelectedSessionPlannerTacticalElements(...args);
}
function syncSessionPlannerTacticalboardInspector(...args) {
return sessionPlannerTacticalController.syncSessionPlannerTacticalboardInspector(...args);
}
function updateSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.updateSelectedSessionPlannerTacticalElement(...args);
}
function updateSessionPlannerTacticalLineStyle(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalLineStyle(...args);
}
function clampMovedTacticalPoint(...args) {
return sessionPlannerTacticalController.clampMovedTacticalPoint(...args);
}
function moveSessionPlannerTacticalElementFromInitial(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementFromInitial(...args);
}
function moveSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElements(...args);
}
function moveSessionPlannerTacticalElementByDelta(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementByDelta(...args);
}
function getSessionPlannerTacticalBoundsCollection(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalBoundsCollection(...args);
}
function getSessionPlannerTacticalArrangeSpacing(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalArrangeSpacing(...args);
}
function moveSessionPlannerTacticalElementCenterTo(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementCenterTo(...args);
}
function arrangeSelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.arrangeSelectedSessionPlannerTacticalElements(...args);
}
function copySelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.copySelectedSessionPlannerTacticalElements(...args);
}
function pasteSessionPlannerTacticalClipboard(...args) {
return sessionPlannerTacticalController.pasteSessionPlannerTacticalClipboard(...args);
}
function isSessionPlannerTacticalEndpointElement(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalEndpointElement(...args);
}
function updateSessionPlannerTacticalElementHandle(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalElementHandle(...args);
}
function getSessionPlannerTacticalRotationFromEvent(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalRotationFromEvent(...args);
}
function shouldPlaceSessionPlannerTacticalDoubleClick(...args) {
return sessionPlannerTacticalController.shouldPlaceSessionPlannerTacticalDoubleClick(...args);
}
function shouldSkipRepeatedSessionPlannerTacticalPlacement(...args) {
return sessionPlannerTacticalController.shouldSkipRepeatedSessionPlannerTacticalPlacement(...args);
}
function addSessionPlannerTacticalPlacementElement(...args) {
return sessionPlannerTacticalController.addSessionPlannerTacticalPlacementElement(...args);
}
function handleSessionPlannerTacticalCanvasClick(...args) {
return sessionPlannerTacticalController.handleSessionPlannerTacticalCanvasClick(...args);
}
function handleSessionPlannerTacticalCanvasDoubleClick(...args) {
return sessionPlannerTacticalController.handleSessionPlannerTacticalCanvasDoubleClick(...args);
}
function startSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.startSessionPlannerTacticalDrag(...args);
}
function updateSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalDrag(...args);
}
function finishSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.finishSessionPlannerTacticalDrag(...args);
}
function startSessionPlannerPlayerBoardDrag(event) {
if (!canEditSessionPlanner()) {
return false;
}
if (event.button !== 0) {
return false;
}
const token = event.target.closest?.("[data-session-player-board-token]");
const board = token?.closest?.("[data-session-player-board]");
const block = getSessionPlannerSelectedBlock();
if (!token || !board || !block) {
return false;
}
const playerId = token.dataset.sessionPlayerBoardToken;
if (!playerId) {
return false;
}
const currentSelectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (event.shiftKey || event.metaKey || event.ctrlKey) {
toggleSessionPlannerPlayerBoardSelectedPlayer(playerId);
} else if (!currentSelectedIds.includes(playerId)) {
setSessionPlannerPlayerBoardSelectedPlayers([playerId]);
}
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds, block);
const dragPlayerIds = selectedIds.includes(playerId) ? selectedIds : [playerId];
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const startPositions = dragPlayerIds.reduce((positions, selectedPlayerId) => {
positions[selectedPlayerId] = getSessionPlannerPlayerBoardPositionById(block, selectedPlayerId, boardPlayers);
return positions;
}, {});
const tokenRect = token.getBoundingClientRect();
local.sessionPlannerPlayerBoardDragState = {
blockId: block.id,
playerId,
playerIds: dragPlayerIds,
board,
token,
pointerId: event.pointerId,
startX: event.clientX,
startY: event.clientY,
startPositions,
anchorStartPosition: startPositions[playerId] ?? getSessionPlannerPlayerBoardPositionById(block, playerId, boardPlayers),
pointerOffsetX: event.clientX - (tokenRect.left + tokenRect.width / 2),
pointerOffsetY: event.clientY - (tokenRect.top + tokenRect.height / 2),
moved: false,
};
event.preventDefault();
token.classList.add("is-dragging");
token.setPointerCapture?.(event.pointerId);
return true;
}
function updateSessionPlannerPlayerBoardDrag(event) {
if (!local.sessionPlannerPlayerBoardDragState) {
return false;
}
const block = getSessionPlannerSelectedBlock();
const dragState = local.sessionPlannerPlayerBoardDragState;
if (!block || block.id !== dragState.blockId) {
local.sessionPlannerPlayerBoardDragState = null;
return false;
}
const boardRect = dragState.board.getBoundingClientRect();
const moveDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
if (!dragState.moved && moveDistance < 8) {
return true;
}
const x = clamp(((event.clientX - boardRect.left - dragState.pointerOffsetX) / boardRect.width) * 100, 0, 100);
const y = clamp(((event.clientY - boardRect.top - dragState.pointerOffsetY) / boardRect.height) * 100, 0, 100);
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
const anchorStartPosition = dragState.anchorStartPosition ?? { x, y };
const deltaX = x - anchorStartPosition.x;
const deltaY = y - anchorStartPosition.y;
const movingPlayerIds = Array.isArray(dragState.playerIds) && dragState.playerIds.length
? dragState.playerIds
: [dragState.playerId];
movingPlayerIds.forEach((playerId) => {
const startPosition = dragState.startPositions?.[playerId] ?? anchorStartPosition;
const nextPosition = {
x: clamp(startPosition.x + deltaX, 0, 100),
y: clamp(startPosition.y + deltaY, 0, 100),
};
block.playerBoardPositions[playerId] = nextPosition;
const playerToken = Array.from(dragState.board.querySelectorAll("[data-session-player-board-token]"))
.find((candidate) => candidate.dataset.sessionPlayerBoardToken === playerId);
if (playerToken) {
playerToken.style.left = `${nextPosition.x}%`;
playerToken.style.top = `${nextPosition.y}%`;
}
});
dragState.moved = true;
return true;
}
function finishSessionPlannerPlayerBoardDrag() {
if (!local.sessionPlannerPlayerBoardDragState) {
return false;
}
const { token, moved, pointerId } = local.sessionPlannerPlayerBoardDragState;
token?.classList.remove("is-dragging");
token?.releasePointerCapture?.(pointerId);
local.sessionPlannerPlayerBoardDragState = null;
if (moved) {
const block = getSessionPlannerSelectedBlock();
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions"]);
writeSessionPlannerState();
}
return true;
}
function getSessionPlannerPlayerBoardEventPoint(event, board) {
const rect = board.getBoundingClientRect();
return {
x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
};
}
function getSessionPlannerPlayerBoardSelectionRect(selection) {
if (!selection) {
return null;
}
return {
left: Math.min(selection.startPoint.x, selection.currentPoint.x),
top: Math.min(selection.startPoint.y, selection.currentPoint.y),
width: Math.abs(selection.currentPoint.x - selection.startPoint.x),
height: Math.abs(selection.currentPoint.y - selection.startPoint.y),
};
}
function syncSessionPlannerPlayerBoardSelectionBox() {
const selection = local.sessionPlannerPlayerBoardSelectionState;
const box = selection?.board?.querySelector("[data-session-player-board-selection-box]");
if (!box) {
return;
}
const rect = getSessionPlannerPlayerBoardSelectionRect(selection);
if (!selection?.moved || !rect) {
box.style.display = "none";
return;
}
box.style.display = "block";
box.style.left = `${rect.left}%`;
box.style.top = `${rect.top}%`;
box.style.width = `${rect.width}%`;
box.style.height = `${rect.height}%`;
}
function startSessionPlannerPlayerBoardSelection(event) {
if (!canEditSessionPlanner()) {
return false;
}
if (event.button !== 0) {
return false;
}
const board = event.target.closest?.("[data-session-player-board]");
if (
!board ||
event.target.closest?.("[data-session-player-board-token]") ||
event.target.closest?.("[data-session-player-board-person-editor]")
) {
return false;
}
const startPoint = getSessionPlannerPlayerBoardEventPoint(event, board);
local.sessionPlannerPlayerBoardSelectionState = {
board,
pointerId: event.pointerId,
startClientX: event.clientX,
startClientY: event.clientY,
startPoint,
currentPoint: startPoint,
additive: event.shiftKey || event.metaKey || event.ctrlKey,
moved: false,
};
event.preventDefault();
board.setPointerCapture?.(event.pointerId);
return true;
}
function updateSessionPlannerPlayerBoardSelection(event) {
if (!local.sessionPlannerPlayerBoardSelectionState) {
return false;
}
const selection = local.sessionPlannerPlayerBoardSelectionState;
const moveDistance = Math.hypot(event.clientX - selection.startClientX, event.clientY - selection.startClientY);
selection.currentPoint = getSessionPlannerPlayerBoardEventPoint(event, selection.board);
selection.moved = moveDistance >= 8;
syncSessionPlannerPlayerBoardSelectionBox();
return true;
}
function finishSessionPlannerPlayerBoardSelection() {
if (!local.sessionPlannerPlayerBoardSelectionState) {
return false;
}
const selection = local.sessionPlannerPlayerBoardSelectionState;
const rect = getSessionPlannerPlayerBoardSelectionRect(selection);
selection.board?.releasePointerCapture?.(selection.pointerId);
local.sessionPlannerPlayerBoardSelectionState = null;
selection.board?.querySelector("[data-session-player-board-selection-box]")?.removeAttribute("style");
if (!selection.moved || !rect) {
if (!selection.additive) {
setSessionPlannerPlayerBoardSelectedPlayers([]);
}
return true;
}
const selectedIds = Array.from(selection.board.querySelectorAll("[data-session-player-board-token]"))
.filter((token) => {
const x = Number.parseFloat(token.style.left);
const y = Number.parseFloat(token.style.top);
return (
Number.isFinite(x) &&
Number.isFinite(y) &&
x >= rect.left &&
x <= rect.left + rect.width &&
y >= rect.top &&
y <= rect.top + rect.height
);
})
.map((token) => token.dataset.sessionPlayerBoardToken)
.filter(Boolean);
const nextIds = selection.additive
? [...sessionPlannerPlayerBoardSelectedPlayerIds, ...selectedIds]
: selectedIds;
setSessionPlannerPlayerBoardSelectedPlayers(nextIds);
return true;
}
const sessionPlannerVisualUploadHelpers = createSessionPlannerVisualUploadHelpers();
function findSessionPlannerBlockById(blockId) {
const sessions = local.sessionPlannerState?.sessions || {};
for (const session of Object.values(sessions)) {
const block = Array.isArray(session?.blocks)
? session.blocks.find((candidate) => candidate.id === blockId)
: null;
if (block) {
return block;
}
}
return null;
}
async function normalizeSessionPlannerVisualUpload(file) {
return sessionPlannerVisualUploadHelpers.normalizeVisualUpload(file);
}
async function handleSessionPlannerVisualUpload(file) {
if (!canEditSessionPlanner() || !file) {
return;
}
if (!file.type.startsWith("image/")) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const blockId = block.id;
const previousVisualImage = block.visualImage || "";
try {
const visualImage = await normalizeSessionPlannerVisualUpload(file);
const targetBlock = findSessionPlannerBlockById(blockId);
if (!targetBlock) {
return;
}
targetBlock.visualImage = visualImage;
markSessionPlannerBlockFieldsUpdated(targetBlock, ["visualImage"]);
if (!writeSessionPlannerState()) {
targetBlock.visualImage = previousVisualImage;
markSessionPlannerBlockFieldsUpdated(targetBlock, ["visualImage"]);
writeSessionPlannerState();
showSessionPlannerToast("The image could not be saved. Try a smaller file.", "error");
return;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Uploaded image saved.");
} catch {
showSessionPlannerToast("The image could not be uploaded.", "error");
}
}
function syncSessionPlannerPostSessionNotesToLibrary(block = getSessionPlannerSelectedBlock()) {
if (!block?.libraryExerciseId || !canEditSessionPlanner()) {
return false;
}
const library = getSessionPlannerExerciseLibrary().map(cloneSessionPlannerLibraryExercise);
const exerciseIndex = library.findIndex((exercise) => exercise.id === block.libraryExerciseId);
if (exerciseIndex < 0) {
return false;
}
const exercise = library[exerciseIndex];
const noteId = createSessionPlannerReviewNoteId(local.sessionPlannerState?.selectedDate || "", block.id || "");
const existingReviewNotes = getSessionPlannerExerciseReviewNotes(exercise);
const existingNote = existingReviewNotes.find((note) => note.id === noteId) || null;
const nextNote = createSessionPlannerReviewNoteFromBlock(block, { existingNote });
const nextReviewNotes = nextNote
? [nextNote, ...existingReviewNotes.filter((note) => note.id !== noteId)]
: existingReviewNotes.filter((note) => note.id !== noteId);
if (JSON.stringify(existingReviewNotes) === JSON.stringify(nextReviewNotes)) {
return true;
}
const now = getSessionPlannerLibraryNow();
const nextExercise = cloneSessionPlannerLibraryExercise({
...exercise,
reviewNotes: nextReviewNotes,
updatedAt: now,
updatedBy: getSessionPlannerLibraryUserId(),
});
library[exerciseIndex] = nextExercise;
const writeResult = writeSessionPlannerExerciseLibraryToStorage(library);
if (!writeResult.saved) {
showSessionPlannerToast("Post-session note saved on the block, but not in the exercise library.", "warning");
return false;
}
	setSessionPlannerExerciseLibrary(writeResult.exercises);
	return true;
	}
function applySessionPlannerExercise(exerciseId) {
if (!canEditSessionPlanner()) {
return;
}
const exercise = getSessionPlannerExerciseLibrary().find((item) => item.id === exerciseId);
const block = getSessionPlannerSelectedBlock();
if (!exercise || !block) {
return;
}
if (isSessionPlannerLibraryExerciseArchived(exercise)) {
showSessionPlannerToast("Restore the exercise before using it in a session.", "warning");
return;
}
const {
archivedAt,
archivedBy,
createdAt,
createdBy,
source,
tags,
updatedAt,
updatedBy,
versions,
reviewNotes,
postSessionNotes,
...exerciseContent
} = exercise;
Object.assign(block, {
...exerciseContent,
id: block.id,
label: block.label,
libraryExerciseId: exercise.id,
postSessionNotes: block.postSessionNotes || "",
visualImage: exercise.visualImage || "",
playerBoardPositions: normalizeSessionPlannerPlayerBoardPositions(exercise.playerBoardPositions),
playerBoardColors: normalizeSessionPlannerPlayerBoardColors(exercise.playerBoardColors),
playerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople(exercise.playerBoardCustomPeople),
tacticalFrames: normalizeSessionPlannerTacticalFrames(exercise.tacticalFrames),
tacticalActiveFrameId: exercise.tacticalActiveFrameId || "",
tacticalElements: Array.isArray(exercise.tacticalElements)
? exercise.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [],
});
markSessionPlannerBlockFieldsUpdated(block, sessionPlannerBlockMergeFields);
local.sessionPlannerLibraryOpen = false;
local.sessionPlannerAddMenuOpen = false;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSelectedSessionPlannerBlockField(field, rawValue, options = {}) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
const previousValue = block?.[field];
if (!assignSessionPlannerBlockFieldValue(block, field, rawValue)) {
return;
}
if (block[field] !== previousValue) {
markSessionPlannerBlockFieldsUpdated(block, [field]);
}
const saved = writeSessionPlannerState();
if (saved && field === "postSessionNotes" && options.syncExerciseReview) {
syncSessionPlannerPostSessionNotesToLibrary(block);
}
}
function getSessionPlannerDateLabel(dateValue, options = {}) {
return new Intl.DateTimeFormat("en-GB", options).format(parseScheduleDateValue(dateValue));
}
function syncSessionPlannerDateStripState(dateControls = ui.sessionPlannerWorkspace?.querySelector(".session-date-controls")) {
const dateStrip = dateControls?.querySelector(".session-date-strip");
if (!dateStrip || !local.sessionPlannerState) {
return;
}
dateStrip.querySelectorAll("[data-session-date]").forEach((dateButton) => {
const dateValue = dateButton.dataset.sessionDate;
const isSelected = dateValue === local.sessionPlannerState.selectedDate;
const hasSession =
Boolean(local.sessionPlannerState.sessions?.[dateValue]?.blocks?.length) ||
Boolean(getScheduleSessionEventForDate(dateValue));
dateButton.classList.toggle("is-active", isSelected);
dateButton.classList.toggle("has-session", hasSession);
});
}
function scrollSessionPlannerSelectedDateIntoView(options = {}) {
const selectedDateButton = ui.sessionPlannerWorkspace?.querySelector(".session-date-pill.is-active");
selectedDateButton?.scrollIntoView({
behavior: options.behavior || "auto",
block: "nearest",
inline: "center",
});
}
function getSessionPlannerTacticalEndpointCoordinates(element) {
return sessionPlannerVisualRenderer.getTacticalEndpointCoordinates(element);
}
function renderSessionPlannerExerciseVisual(block, options = {}) {
return sessionPlannerVisualRenderer.renderExerciseVisual(block, options);
}
function renderSessionPlannerActionIcon(name) {
return sessionPlannerVisualRenderer.renderActionIcon(name);
}
function resizeSessionPlannerTextarea(textarea) {
if (!textarea || textarea.tagName !== "TEXTAREA") {
return;
}
textarea.style.height = "auto";
textarea.style.height = `${textarea.scrollHeight}px`;
}
function resizeSessionPlannerTextareas() {
ui.sessionPlannerWorkspace
?.querySelectorAll("textarea[data-session-field]")
.forEach((textarea) => resizeSessionPlannerTextarea(textarea));
}
function scrollSessionPlannerDateStrip(direction) {
const dateStrip = ui.sessionPlannerWorkspace?.querySelector(".session-date-strip");
if (!dateStrip) {
return;
}
const datePill = dateStrip.querySelector(".session-date-pill");
const pillGap = 8;
const pillWidth = datePill?.getBoundingClientRect().width ?? 52;
const scrollDistance = (pillWidth + pillGap) * 7;
const targetLeft = Math.max(0, dateStrip.scrollLeft + direction * scrollDistance);
const prefersReducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
dateStrip.scrollTo({
left: targetLeft,
behavior: prefersReducedMotion ? "auto" : "smooth",
});
}
function jumpSessionPlannerToToday() {
selectSessionPlannerDate(formatScheduleDateValue(new Date()));
}
function canRemoveSessionPlannerLibraryExerciseFromSelectedFolder(exercise = {}) {
const selectedFolder = getSessionPlannerLibraryFolderById(local.sessionPlannerLibrarySelectedFolderId);
return Boolean(
canEditSessionPlanner() &&
exercise.id &&
!isSessionPlannerLibraryExerciseArchived(exercise) &&
selectedFolder &&
!isSessionPlannerLibraryFolderArchived(selectedFolder) &&
normalizeSessionPlannerLibraryFolderExerciseIds(selectedFolder.exerciseIds).includes(exercise.id)
);
}
function renderSessionPlannerCentralSyncConflictOverlay() {
if (!local.sessionPlannerCentralSyncConflict) {
return "";
}
return `
    <div class="session-library-overlay session-save-conflict-overlay" data-session-central-conflict-overlay>
      <section class="session-library-modal session-save-conflict-modal session-central-conflict-modal" role="dialog" aria-modal="true" aria-label="Session sync conflict">
        <header class="session-library-modal-head">
          <div>
            <span>Autosave</span>
            <h2>Someone saved this session first</h2>
          </div>
          <button
            type="button"
            class="session-library-close-button"
            data-session-central-conflict-action="keep-central"
            aria-label="Keep synced version"
          >
            Keep synced
          </button>
        </header>
        <div class="session-save-conflict-copy">
          <strong>Sync issue</strong>
          <p>${escapeHtml(local.sessionPlannerCentralSyncConflict.reason || "The central version changed while you were editing.")}</p>
          <p>Choose the synced version, or save your local board changes again if you want them to replace the latest version.</p>
        </div>
        <div class="session-save-conflict-actions">
          <button type="button" class="session-save-conflict-secondary" data-session-central-conflict-action="keep-central">
            Use synced version
          </button>
          <button type="button" class="session-save-conflict-primary" data-session-central-conflict-action="save-local">
            Save my version
          </button>
        </div>
      </section>
    </div>
  `;
}
function resolveSessionPlannerCentralSyncConflict(action = "keep-central") {
if (!local.sessionPlannerCentralSyncConflict) {
return;
}
const conflict = local.sessionPlannerCentralSyncConflict;
local.sessionPlannerCentralSyncConflict = null;
sessionPlannerAutosaveBoundary.markSessionPlannerWrite();
if (action === "save-local" && conflict.localValue) {
win.__footballScienceCentralHydrating = true;
try {
rawDataSafetySetItem(sessionPlannerStorageKey, conflict.localValue);
} finally {
win.__footballScienceCentralHydrating = false;
}
local.sessionPlannerState = readSessionPlannerStatePreservingUiSelection();
queueCentralStateWrite(sessionPlannerStorageKey, conflict.localValue);
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saving", "Saving");
} else if (conflict.centralValue) {
win.__footballScienceCentralHydrating = true;
try {
rawDataSafetySetItem(sessionPlannerStorageKey, conflict.centralValue);
} finally {
win.__footballScienceCentralHydrating = false;
}
local.sessionPlannerState = readSessionPlannerStatePreservingUiSelection();
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saved", "Saved");
} else {
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saved", "Saved");
}
if (hubState?.activeWorkspaceId === "session-planner") {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
}
function getSessionPlannerBlockNumber(block = getSessionPlannerSelectedBlock()) {
const session = getSessionPlannerSelectedSession();
const index = session?.blocks?.findIndex((candidate) => candidate.id === block?.id) ?? -1;
return index >= 0 ? index + 1 : 1;
}
function getSessionPlannerPlayerBoardRule(block = getSessionPlannerSelectedBlock()) {
const blockNumber = getSessionPlannerBlockNumber(block);
if (blockNumber <= 1) {
return { blockNumber, label: "Block 1", valueLabel: "10%+", min: 10 };
}
if (blockNumber === 2) {
return { blockNumber, label: "Block 2", valueLabel: "25%+", min: 25 };
}
if (blockNumber === 3) {
return { blockNumber, label: "Block 3", valueLabel: "50%+", min: 50 };
}
return { blockNumber, label: `Block ${blockNumber}`, valueLabel: "75%+", min: 75 };
}
function getSessionPlannerPlayerBoardProfileState() {
try {
return ensurePlayerProfilesState();
} catch {
return playerProfilesState;
}
}
function getSessionPlannerPlayerBoardProfileForPlayer(player = {}) {
const profileState = getSessionPlannerPlayerBoardProfileState();
const profiles = Array.isArray(profileState?.players) ? profileState.players : [];
if (!profiles.length) {
return null;
}
const playerIds = [player.id, player.playerId, player.profileId, player.medicalPlayerId]
.map((value) => String(value ?? "").trim())
.filter(Boolean);
const idMatch = profiles.find((profile) =>
[profile.id, profile.playerId, profile.medicalPlayerId, profile.sourceId]
.map((value) => String(value ?? "").trim())
.filter(Boolean)
.some((value) => playerIds.includes(value))
);
if (idMatch) {
return idMatch;
}
const nameKey = normalizeSessionPlannerPlayerBoardProfileKey(player.name);
if (nameKey) {
const nameMatch = profiles.find((profile) => normalizeSessionPlannerPlayerBoardProfileKey(profile.name) === nameKey);
if (nameMatch) {
return nameMatch;
}
}
const numberKey = String(player.number ?? "").trim();
if (numberKey) {
const numberMatches = profiles.filter((profile) => String(profile.number ?? "").trim() === numberKey);
if (numberMatches.length === 1) {
return numberMatches[0];
}
}
return null;
}
function getSessionPlannerPlayerBoardProfileRoleFitMap(profile = {}) {
if (!profile) {
return {};
}
if (profile.roleFit && typeof profile.roleFit === "object" && !Array.isArray(profile.roleFit)) {
return profile.roleFit;
}
try {
return Object.fromEntries(playerProfileRoleOptions.map((role) => [role, getPlayerProfileRoleFitScore(profile, role)]));
} catch {
return {};
}
}
function getSessionPlannerPlayerBoardFutureMinutesValue(source) {
if (!source) {
return null;
}
if (typeof source === "number") {
return Number.isFinite(source) ? source : null;
}
if (Array.isArray(source)) {
const total = source.reduce((sum, item) => {
const value =
getSessionPlannerPlayerBoardNumericPriorityValue(item?.minutes) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.played) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.value) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.total) ??
0;
return sum + value;
}, 0);
return total > 0 ? total : null;
}
if (typeof source === "object") {
const directValue =
getSessionPlannerPlayerBoardNumericPriorityValue(source.minutes) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.played) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.value) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.total);
if (directValue !== null) {
return directValue;
}
}
return null;
}
function getSessionPlannerPlayerBoardSyncedPlayer(player = {}) {
  const profile = getSessionPlannerPlayerBoardProfileForPlayer(player);
  if (!profile) {
    return player;
  }
  const roleFit = getSessionPlannerPlayerBoardProfileRoleFitMap(profile);
  const futureMinutes = getSessionPlannerPlayerBoardFutureMinutesValue(profile.futureData?.minutes);
  const squadStatusPriority = getSessionPlannerPlayerBoardSquadStatusPriority(profile.squadStatus);
  const careerPhasePriority = getSessionPlannerPlayerBoardCareerPhasePriority(profile.careerPhase);
  return {
    ...player,
    status: profile.status || player.status,
    availabilityStatus: profile.status || player.availabilityStatus,
    availability_status: profile.status || player.availability_status,
    number: profile.number || player.number,
    name: profile.name || player.name,
    position: profile.position || player.position,
    photoUrl: profile.photoUrl || player.photoUrl,
    sourceUrl: profile.sourceUrl || player.sourceUrl,
    rosterOrder: Number.isFinite(Number(profile.rosterOrder)) ? Number(profile.rosterOrder) : player.rosterOrder,
    profileId: profile.id,
    medicalPlayerId: player.id,
    squadStatus: profile.squadStatus,
    careerPhase: profile.careerPhase,
    rosterType: profile.rosterType,
    countsInSquad: profile.countsInSquad,
    temporaryGroup: profile.temporaryGroup,
    temporaryFrom: profile.temporaryFrom,
    temporaryTo: profile.temporaryTo,
    primaryRole: profile.primaryRole,
    secondaryRoles: Array.isArray(profile.secondaryRoles) ? [...profile.secondaryRoles] : [],
    preferredSide: profile.preferredSide,
    roleGroup: profile.roleGroup,
    attributeRatings: profile.attributeRatings,
    idp: profile.idp,
    futureData: profile.futureData,
    coachNotes: profile.coachNotes,
    roleFit,
    rolePriority: roleFit,
    positionPriority: roleFit,
    squadImportance: squadStatusPriority,
    careerPhasePriority,
    seasonMinutes: futureMinutes ?? player.seasonMinutes,
  };
}
function getSessionPlannerPlayerBoardBridgeContract(player = {}) {
const profile = getSessionPlannerPlayerBoardProfileForPlayer(player);
if (!profile) {
return null;
}
return createSessionPlannerPlayerProfileContract(profile, local.sessionPlannerState?.selectedDate);
}
function getSessionPlannerPlayerBoardBridgeRoleLabel(player = {}) {
const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
if (primaryRole) {
return primaryRole;
}
const roleFit = player.roleFit && typeof player.roleFit === "object" && !Array.isArray(player.roleFit)
? player.roleFit
: {};
const bestRole = Object.entries(roleFit)
.filter(([role, score]) => playerProfileRoleOptions.includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))[0]?.[0];
return bestRole || "";
}
function getSessionPlannerPlayerBoardBridgeBestMatches(player = {}, limit = 3) {
const roleFit = player.roleFit && typeof player.roleFit === "object" && !Array.isArray(player.roleFit)
? player.roleFit
: {};
return Object.entries(roleFit)
.filter(([role, score]) => playerProfileRoleOptions.includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))
.slice(0, limit)
.map(([role, score]) => ({
role,
score: Math.round(Number(score)),
definition: getPlayerRoleDnaDefinition(role),
}));
}
function getSessionPlannerPlayerBoardBridgeSummary(boardPlayers = []) {
const linkedItems = boardPlayers.filter((item) => item.player?.profileId);
const roleDnaItems = linkedItems.filter((item) => Object.keys(item.player?.roleFit || {}).length > 0);
const temporaryItems = boardPlayers.filter((item) => isTemporaryPlayerProfile(item.player));
const roleCounts = linkedItems.reduce((counts, item) => {
const role = getSessionPlannerPlayerBoardBridgeRoleLabel(item.player) || "Unset";
counts[role] = (counts[role] || 0) + 1;
return counts;
}, {});
const roleSummary = Object.entries(roleCounts)
.sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
.slice(0, 4)
.map(([role, count]) => `${role} ${count}`)
.join(" / ");
return {
linkedCount: linkedItems.length,
roleDnaCount: roleDnaItems.length,
totalCount: boardPlayers.length,
temporaryCount: temporaryItems.length,
roleSummary,
linkedItems,
};
}
function applySessionPlannerSelectionAssistant() {
const block = getSessionPlannerSelectedBlock();
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const assistant = buildSessionPlannerSelectionAssistant(block, boardPlayers);
const playerIds = assistant.suggestions.map((suggestion) => suggestion.item.player.id);
if (!playerIds.length) {
showSessionPlannerToast("No suggested players available for this block.", "error");
return;
}
local.sessionPlannerPlayerBoardAssistantOpen = false;
setSessionPlannerPlayerBoardSelectedPlayers(playerIds, { render: true });
showSessionPlannerToast(`Selection Assistant selected ${playerIds.length} player${playerIds.length === 1 ? "" : "s"}.`);
}
function compareSessionPlannerPlayerBoardItems(first, second) {
const firstGroup = getSessionPlannerPlayerBoardPositionGroup(first?.player);
const secondGroup = getSessionPlannerPlayerBoardPositionGroup(second?.player);
const groupComparison = firstGroup.order - secondGroup.order;
if (groupComparison !== 0) {
return groupComparison;
}
return compareMedicalPlayers(first.player, second.player);
}
function isSessionPlannerPlayerVisibleForBoard(participation, rule) {
if (participation === null || participation === undefined || participation <= 0) {
return false;
}
return participation >= rule.min;
}
function isSessionPlannerPlayerBoardCustomPersonId(playerId = "") {
return String(playerId || "").startsWith("player-board-person-");
}
function getSessionPlannerPlayerBoardCustomPeople(block = getSessionPlannerSelectedBlock()) {
return normalizeSessionPlannerPlayerBoardCustomPeople(block?.playerBoardCustomPeople);
}
function getSessionPlannerPlayerBoardCustomPerson(block, personId) {
return getSessionPlannerPlayerBoardCustomPeople(block).find((person) => person.id === personId) || null;
}
function createSessionPlannerPlayerBoardCustomItem(person = {}) {
const kind = person.kind === "staff" ? "staff" : "player";
const roleLabel = person.role || (kind === "staff" ? "Staff" : "Guest");
return {
player: {
id: person.id,
name: person.name,
position: roleLabel,
role: roleLabel,
roleGroup: kind === "staff" ? "midfielder" : "",
rosterType: "guest",
countsInSquad: false,
temporaryGroup: kind === "staff" ? "Staff" : "Manual board",
playerBoardCustom: true,
playerBoardKind: kind,
playerBoardRoleLabel: roleLabel,
},
record: null,
planningOnly: true,
participation: 100,
status: { label: kind === "staff" ? "Staff added" : "Added manually" },
};
}
function getSessionPlannerPlayerBoardPlayers(block = getSessionPlannerSelectedBlock()) {
const rule = getSessionPlannerPlayerBoardRule(block);
const availabilityItems = getSessionPlannerAvailabilityItems(local.sessionPlannerState?.selectedDate)
.filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player))
.filter((item) => (item.record || item.planningOnly) && isSessionPlannerPlayerVisibleForBoard(item.participation, rule))
.map((item) => ({
...item,
player: getSessionPlannerPlayerBoardSyncedPlayer(item.player),
}));
const customItems = getSessionPlannerPlayerBoardCustomPeople(block).map(createSessionPlannerPlayerBoardCustomItem);
return [...availabilityItems, ...customItems].sort(compareSessionPlannerPlayerBoardItems);
}
function getSessionPlannerPlayerBoardSummary(block = getSessionPlannerSelectedBlock()) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const availabilityItems = getSessionPlannerAvailabilityItems(local.sessionPlannerState?.selectedDate);
const rule = getSessionPlannerPlayerBoardRule(block);
const temporaryBoardCount = boardPlayers.filter((item) => isTemporaryPlayerProfile(item.player)).length;
return {
boardPlayers,
rule,
temporaryBoardCount,
belowLimitCount: availabilityItems.filter(
(item) => item.record && item.participation > 0 && item.participation < rule.min
).length,
hiddenZeroCount: availabilityItems.filter((item) => item.record && item.participation === 0).length,
unconfirmedCount: availabilityItems.filter((item) => !item.record && !item.planningOnly).length,
};
}
function getSessionPlannerPlayerBoardWarnings(block = getSessionPlannerSelectedBlock(), dateValue = local.sessionPlannerState?.selectedDate) {
const rule = getSessionPlannerPlayerBoardRule(block);
const availabilityItems = getSessionPlannerAvailabilityItems(dateValue);
const available = availabilityItems.filter((item) =>
(item.record || item.planningOnly) && isSessionPlannerPlayerVisibleForBoard(item.participation, rule)
);
const belowLimit = availabilityItems.filter((item) => item.record && item.participation > 0 && item.participation < rule.min);
const unavailable = availabilityItems.filter((item) => item.record && item.participation === 0);
const unconfirmed = availabilityItems.filter((item) => !item.record && !item.planningOnly);
return {
rule,
available,
belowLimit,
unavailable,
unconfirmed,
hasWarnings: Boolean(belowLimit.length || unavailable.length || unconfirmed.length),
};
}
function syncSessionPlannerPlayerBoardSelection(block = getSessionPlannerSelectedBlock()) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const visibleIds = new Set(boardPlayers.map((item) => item.player.id));
local.sessionPlannerPlayerBoardSelectedPlayerIds = local.sessionPlannerPlayerBoardSelectedPlayerIds.filter((playerId) =>
visibleIds.has(playerId)
);
if (!boardPlayers.length || !local.sessionPlannerPlayerBoardSelectedPlayerId) {
local.sessionPlannerPlayerBoardSelectedPlayerId = "";
return null;
}
const selectedItem = boardPlayers.find((item) => item.player.id === local.sessionPlannerPlayerBoardSelectedPlayerId) ?? null;
if (!selectedItem) {
local.sessionPlannerPlayerBoardSelectedPlayerId = "";
}
return selectedItem;
}
function getSessionPlannerPlayerBoardAutoTargetItems(block) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (!selectedIds.length) {
return boardPlayers;
}
const selectedIdSet = new Set(selectedIds);
return boardPlayers.filter((item) => selectedIdSet.has(item.player.id));
}
function getSessionPlannerPlayerBoardAutoSelectFormation() {
let formationValue = normalizeSessionPlannerPlayerBoardFormationValue(local.sessionPlannerPlayerBoardFormationInput);
if (!parseSessionPlannerPlayerBoardFormation(formationValue).length) {
const promptValue = win.prompt("Set formation for Auto Select", formationValue || "3-3-1");
if (promptValue === null) {
return null;
}
formationValue = normalizeSessionPlannerPlayerBoardFormationValue(promptValue);
}
const formation = parseSessionPlannerPlayerBoardFormation(formationValue);
if (!formation.length) {
showSessionPlannerToast("Enter a formation, for example 3-3-1.", "error");
return null;
}
local.sessionPlannerPlayerBoardFormationInput = formationValue;
return formation;
}
function applySessionPlannerPlayerBoardAutoTeamFormation(block, targetItems, assignments, formation) {
if (assignments.some((assignment) => assignment?.position)) {
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardPositions[item.player.id];
}
});
assignments.forEach((assignment) => {
if (assignment?.playerId && assignment.position) {
block.playerBoardPositions[assignment.playerId] = assignment.position;
}
});
return;
}
const itemsById = new Map(targetItems.map((item) => [item.player.id, item]));
const teams = Array.from({ length: local.sessionPlannerPlayerBoardTeamCount }, () => []);
assignments.forEach((assignment) => {
const item = itemsById.get(assignment.playerId);
if (item && teams[assignment.teamIndex]) {
teams[assignment.teamIndex].push(item);
}
});
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardPositions[item.player.id];
}
});
teams.forEach((teamItems, teamIndex) => {
if (!teamItems.length) {
return;
}
const slots = createSessionPlannerPlayerBoardAutoTeamFormationSlots(
teamItems,
formation,
teamIndex,
local.sessionPlannerPlayerBoardTeamCount
);
const positionAssignments = assignSessionPlannerPlayerBoardFormationSlots(teamItems, slots, {
prioritize: local.sessionPlannerPlayerBoardAutoMode === "best-xi",
});
positionAssignments.forEach((assignment) => {
block.playerBoardPositions[assignment.playerId] = assignment.position;
});
});
}
function applySessionPlannerPlayerBoardAutoSelect() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
local.sessionPlannerPlayerBoardTeamCount = normalizeSessionPlannerPlayerBoardTeamCount(local.sessionPlannerPlayerBoardTeamCount);
local.sessionPlannerPlayerBoardAutoMode = normalizeSessionPlannerPlayerBoardAutoMode(local.sessionPlannerPlayerBoardAutoMode);
const targetItems = getSessionPlannerPlayerBoardAutoTargetItems(block);
if (!targetItems.length) {
showSessionPlannerToast("No available players to auto-select.", "error");
return;
}
const formation = getSessionPlannerPlayerBoardAutoSelectFormation();
if (!formation) {
return;
}
const assignments = assignSessionPlannerPlayerBoardAutoFormationTeams(
targetItems,
local.sessionPlannerPlayerBoardTeamCount,
local.sessionPlannerPlayerBoardAutoMode,
block,
formation
);
if (!assignments.length) {
showSessionPlannerToast("Auto Select could not find any players to colour.", "error");
return;
}
if (!block.playerBoardColors || typeof block.playerBoardColors !== "object") {
block.playerBoardColors = {};
}
const assignedIds = new Set(assignments.map((assignment) => assignment.playerId));
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardColors[item.player.id];
}
});
assignments.forEach((assignment) => {
const color = sessionPlannerPlayerBoardColorOptions[assignment.teamIndex % sessionPlannerPlayerBoardColorOptions.length]?.value;
if (color && assignedIds.has(assignment.playerId)) {
block.playerBoardColors[assignment.playerId] = color;
}
});
applySessionPlannerPlayerBoardAutoTeamFormation(block, targetItems, assignments, formation);
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions", "playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
const modeLabel =
sessionPlannerPlayerBoardAutoModeOptions.find((option) => option.key === local.sessionPlannerPlayerBoardAutoMode)?.label ??
"Auto Select";
showSessionPlannerToast(
`${modeLabel}: ${assignments.length} player${assignments.length === 1 ? "" : "s"} assigned across ${local.sessionPlannerPlayerBoardTeamCount} team${local.sessionPlannerPlayerBoardTeamCount === 1 ? "" : "s"} in ${formation.join("-")}.`
);
}
function applySessionPlannerPlayerBoardFormation(options = {}) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(local.sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (!selectedIds.length) {
showSessionPlannerToast("Select players first.", "error");
return;
}
const formation = parseSessionPlannerPlayerBoardFormation(local.sessionPlannerPlayerBoardFormationInput);
const outfieldSlotCount = formation.reduce((total, count) => total + count, 0);
if (!outfieldSlotCount) {
showSessionPlannerToast("Enter a formation, for example 3-3-1.", "error");
return;
}
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const selectedItems = selectedIds
.map((playerId) => boardPlayers.find((item) => item.player.id === playerId))
.filter(Boolean);
const hasGoalkeeper = selectedItems.some(
(item) => getSessionPlannerPlayerBoardPlayerRoleProfile(item.player).roleKey === "goalkeeper"
);
const hasGoalkeeperSlot = hasGoalkeeper && selectedItems.length === outfieldSlotCount + 1;
const expectedCount = outfieldSlotCount + (hasGoalkeeperSlot ? 1 : 0);
if (selectedItems.length < expectedCount || (!options.prioritize && selectedItems.length !== expectedCount)) {
const expectedLabel = hasGoalkeeper
? `${outfieldSlotCount} or ${outfieldSlotCount + 1} with goalkeeper`
: String(outfieldSlotCount);
showSessionPlannerToast(
`The formation needs ${expectedLabel} players. You selected ${selectedItems.length}.`,
"error"
);
return;
}
const slots = createSessionPlannerPlayerBoardFormationSlots(formation, hasGoalkeeperSlot);
const assignments = assignSessionPlannerPlayerBoardFormationSlots(selectedItems, slots, options);
if (!assignments.length) {
return;
}
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
assignments.forEach((assignment) => {
block.playerBoardPositions[assignment.playerId] = assignment.position;
});
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(
`${options.prioritize ? "Prioritized formation" : "Formation"} ${formation.join("-")} placed for ${assignments.length} player${assignments.length === 1 ? "" : "s"}.`
);
}
function getSessionPlannerPlayerBoardPosition(block, item, index, boardPlayers = []) {
const playerId = typeof item === "string" ? item : item?.player?.id;
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
const savedPosition = block.playerBoardPositions[playerId];
if (block.playerBoardLayoutMode === "manual" && savedPosition) {
return {
x: clamp(Number(savedPosition.x) || 50, 0, 100),
y: clamp(Number(savedPosition.y) || 50, 0, 100),
};
}
return getSessionPlannerPlayerBoardDefaultPosition(item, index, boardPlayers);
}
function getSessionPlannerPlayerBoardPositionById(block, playerId, boardPlayers = getSessionPlannerPlayerBoardPlayers(block)) {
const index = boardPlayers.findIndex((item) => item.player.id === playerId);
const item = boardPlayers[index] ?? { player: { id: playerId, position: "" } };
return getSessionPlannerPlayerBoardPosition(block, item, Math.max(index, 0), boardPlayers);
}
function getSessionPlannerPlayerBoardReadableSpacing(playerCount, mode = "preview") {
const count = Math.max(0, Number(playerCount) || 0);
const compact = count > 28;
const dense = count > 20;
if (mode === "print") {
return {
minX: compact ? 6.4 : dense ? 7.2 : 8,
minY: compact ? 5.7 : dense ? 6.35 : 7,
};
}
return {
minX: compact ? 7 : dense ? 7.8 : 8.8,
minY: compact ? 6.05 : dense ? 6.7 : 7.4,
};
}
function getSessionPlannerReadablePlayerBoardPositions(block, boardPlayers = [], options = {}) {
const items = Array.isArray(boardPlayers) ? boardPlayers : [];
const minX = Number.isFinite(Number(options.minX)) ? Number(options.minX) : 8;
const minY = Number.isFinite(Number(options.minY)) ? Number(options.minY) : 6.5;
const minBoundsX = Number.isFinite(Number(options.minBoundsX)) ? Number(options.minBoundsX) : 5;
const maxBoundsX = Number.isFinite(Number(options.maxBoundsX)) ? Number(options.maxBoundsX) : 95;
const minBoundsY = Number.isFinite(Number(options.minBoundsY)) ? Number(options.minBoundsY) : 8;
const maxBoundsY = Number.isFinite(Number(options.maxBoundsY)) ? Number(options.maxBoundsY) : 92;
const entries = items
.map((item, index) => {
const playerId = item?.player?.id;
if (!playerId) {
return null;
}
const position = getSessionPlannerPlayerBoardPosition(block, item, index, items);
return {
id: playerId,
index,
x: clamp(Number(position.x) || 50, minBoundsX, maxBoundsX),
y: clamp(Number(position.y) || 50, minBoundsY, maxBoundsY),
};
})
.filter(Boolean);
for (let iteration = 0; iteration < 72; iteration += 1) {
let moved = false;
for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
const first = entries[firstIndex];
const second = entries[secondIndex];
const dx = second.x - first.x;
const dy = second.y - first.y;
const overlapX = minX - Math.abs(dx);
const overlapY = minY - Math.abs(dy);
if (overlapX <= 0 || overlapY <= 0) {
continue;
}
const separateOnX = Math.abs(dx) > 0.01 && (overlapX < overlapY || Math.abs(dy) <= 0.01);
if (separateOnX) {
const direction = Math.sign(dx) || (first.index < second.index ? 1 : -1);
const correction = (overlapX + 0.12) / 2;
first.x = clamp(first.x - direction * correction, minBoundsX, maxBoundsX);
second.x = clamp(second.x + direction * correction, minBoundsX, maxBoundsX);
} else {
const direction = Math.sign(dy) || (first.index < second.index ? 1 : -1);
const correction = (overlapY + 0.12) / 2;
first.y = clamp(first.y - direction * correction, minBoundsY, maxBoundsY);
second.y = clamp(second.y + direction * correction, minBoundsY, maxBoundsY);
}
moved = true;
}
}
if (!moved) {
break;
}
}
return new Map(entries.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
}
function copySessionPlannerPlayerBoardTeamsFromBlock(sourceBlockId) {
if (!canEditSessionPlanner()) {
return;
}
const session = getSessionPlannerSelectedSession();
const targetBlock = getSessionPlannerSelectedBlock();
if (!session || !targetBlock || !sourceBlockId) {
showSessionPlannerToast("Choose a block to copy teams from.", "error");
return;
}
const blocks = Array.isArray(session.blocks) ? session.blocks : [];
const sourceEntry = blocks
.map((block, index) => ({ block, index }))
.find(({ block }) => block?.id === sourceBlockId);
const sourceBlock = sourceEntry?.block;
if (!sourceBlock || sourceBlock.id === targetBlock.id) {
showSessionPlannerToast("Choose another block from this session.", "error");
return;
}
const targetPlayers = getSessionPlannerPlayerBoardPlayers(targetBlock);
const visibleIds = new Set(targetPlayers.map((item) => item.player.id));
if (!visibleIds.size) {
showSessionPlannerToast("No visible players in this block yet.", "error");
return;
}
const sourceColors = getSessionPlannerPlayerBoardDataObject(sourceBlock.playerBoardColors);
const sourcePositions = getSessionPlannerPlayerBoardDataObject(sourceBlock.playerBoardPositions);
const sourceColorIds = Object.keys(sourceColors);
const sourcePositionIds = Object.keys(sourcePositions);
const shouldCopyColors = sourceColorIds.length > 0;
const shouldCopyPositions = sourcePositionIds.length > 0;
if (!shouldCopyColors && !shouldCopyPositions) {
showSessionPlannerToast("That block has no team setup to copy yet.", "error");
return;
}
const sourcePlayerIds = new Set([...sourceColorIds, ...sourcePositionIds]);
const nextColors = { ...getSessionPlannerPlayerBoardDataObject(targetBlock.playerBoardColors) };
const nextPositions = { ...getSessionPlannerPlayerBoardDataObject(targetBlock.playerBoardPositions) };
if (shouldCopyColors) {
visibleIds.forEach((playerId) => delete nextColors[playerId]);
}
if (shouldCopyPositions) {
visibleIds.forEach((playerId) => delete nextPositions[playerId]);
}
const copiedPlayerIds = new Set();
let copiedColors = 0;
let copiedPositions = 0;
let skippedPlayers = 0;
sourcePlayerIds.forEach((playerId) => {
if (!visibleIds.has(playerId)) {
skippedPlayers += 1;
return;
}
let copiedForPlayer = false;
const sourceColor = shouldCopyColors ? normalizeTacticalColor(sourceColors[playerId], "") : "";
if (sourceColor) {
nextColors[playerId] = sourceColor;
copiedColors += 1;
copiedForPlayer = true;
}
const sourcePosition = shouldCopyPositions ? sourcePositions[playerId] : null;
const x = Number(sourcePosition?.x);
const y = Number(sourcePosition?.y);
if (Number.isFinite(x) && Number.isFinite(y)) {
nextPositions[playerId] = {
x: clamp(x, 0, 100),
y: clamp(y, 0, 100),
};
copiedPositions += 1;
copiedForPlayer = true;
}
if (copiedForPlayer) {
copiedPlayerIds.add(playerId);
}
});
if (!copiedPlayerIds.size) {
showSessionPlannerToast("No matching players found in this block.", "error");
return;
}
const changedFields = [];
if (shouldCopyColors) {
targetBlock.playerBoardColors = nextColors;
changedFields.push("playerBoardColors");
}
if (shouldCopyPositions) {
targetBlock.playerBoardPositions = nextPositions;
if (copiedPositions) {
targetBlock.playerBoardLayoutMode = "manual";
changedFields.push("playerBoardLayoutMode");
}
changedFields.push("playerBoardPositions");
}
markSessionPlannerBlockFieldsUpdated(targetBlock, changedFields);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
const sourceLabel = getSessionPlannerPlayerBoardSourceLabel(sourceBlock, sourceEntry.index);
const copiedDetails = [
copiedColors ? `${copiedColors} colour${copiedColors === 1 ? "" : "s"}` : "",
copiedPositions ? `${copiedPositions} position${copiedPositions === 1 ? "" : "s"}` : "",
].filter(Boolean).join(" and ");
showSessionPlannerToast(
`Copied ${copiedDetails || `${copiedPlayerIds.size} player${copiedPlayerIds.size === 1 ? "" : "s"}`} from ${sourceLabel}${skippedPlayers ? ` (${skippedPlayers} not visible here)` : ""}.`
);
}
function formatSessionPlannerHistoryTime(value) {
return formatSessionPlannerHistoryTimeFromModule(value);
}
function getSessionPlannerHistoryActorLabel(entry = {}) {
return getSessionPlannerHistoryActorLabelFromModule(entry);
}
function getSessionPlannerHistoryActionLabel(action = "") {
return getSessionPlannerHistoryActionLabelFromModule(action);
}
function getSessionPlannerHistoryPanelContext() {
const dateValue = local.sessionPlannerState?.selectedDate || "";
return {
entries: local.sessionPlannerHistoryEntries,
isAdmin: isCurrentPlatformUserAdmin(),
isLoading: local.sessionPlannerHistoryLoading,
loadedDate: local.sessionPlannerHistoryLoadedDate,
loadError: local.sessionPlannerHistoryLoadError,
open: local.sessionPlannerHistoryOpen,
selectedDate: dateValue,
formatHistoryTime: formatSessionPlannerHistoryTime,
getHistoryActionLabel: getSessionPlannerHistoryActionLabel,
getHistoryActorLabel: getSessionPlannerHistoryActorLabel,
};
}
async function loadSessionPlannerHistory(dateValue = local.sessionPlannerState?.selectedDate, options = {}) {
const cleanDate = String(dateValue || "").trim();
if (!cleanDate || local.sessionPlannerHistoryLoading || !isCurrentPlatformUserAdmin()) {
return;
}
if (!options.force && local.sessionPlannerHistoryLoadedDate === cleanDate) {
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.getSessionHistory) {
local.sessionPlannerHistoryLoadError = "Session history is not ready yet.";
local.sessionPlannerHistoryLoadedDate = cleanDate;
return;
}
local.sessionPlannerHistoryLoading = true;
local.sessionPlannerHistoryLoadError = "";
try {
const result = await authStore.getSessionHistory(cleanDate, 50);
if (!result?.ok) {
local.sessionPlannerHistoryLoadError = result?.reason || "Session history could not be loaded.";
local.sessionPlannerHistoryLoadedDate = cleanDate;
return;
}
local.sessionPlannerHistoryEntries = Array.isArray(result.entries) ? result.entries : [];
local.sessionPlannerHistoryLoadedDate = cleanDate;
} catch (error) {
local.sessionPlannerHistoryLoadError = error?.message || "Session history could not be loaded.";
local.sessionPlannerHistoryLoadedDate = cleanDate;
} finally {
local.sessionPlannerHistoryLoading = false;
if (hubState?.activeWorkspaceId === "session-planner" && local.sessionPlannerState?.selectedDate === cleanDate) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
}
}
async function restoreSessionPlannerHistoryEntry(entryId) {
if (!canEditSessionPlanner()) {
showSessionPlannerToast("You do not have edit access for Session Planner.", "error");
return;
}
const historyEntry = local.sessionPlannerHistoryEntries.find((entry) => entry.id === entryId);
if (!historyEntry) {
showSessionPlannerToast("History entry could not be found.", "error");
return;
}
const willRemoveSession = !historyEntry.beforeSession;
const confirmed = win.confirm(
willRemoveSession
? `Undo the session created at ${formatSessionPlannerHistoryTime(historyEntry.createdAt)}?\n\nThis will remove the current session for ${historyEntry.date}.`
: `Restore the previous version from ${formatSessionPlannerHistoryTime(historyEntry.createdAt)}?\n\nThis will replace the current session for ${historyEntry.date}.`
);
if (!confirmed) {
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.restoreSessionHistory) {
showSessionPlannerToast("Session history restore is not ready yet.", "error");
return;
}
try {
const result = await authStore.restoreSessionHistory(entryId, "before");
if (!result?.ok) {
showSessionPlannerToast(result?.reason || "Session could not be restored.", "error");
return;
}
if (result.value) {
win.__footballScienceCentralHydrating = true;
try {
win.localStorage.setItem(sessionPlannerStorageKey, result.value);
} finally {
win.__footballScienceCentralHydrating = false;
}
}
local.sessionPlannerState = readSessionPlannerState();
if (result.date) {
local.sessionPlannerState.selectedDate = result.date;
}
local.sessionPlannerHistoryLoadedDate = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
loadSessionPlannerHistory(local.sessionPlannerState.selectedDate, { force: true }).catch(() => {});
showSessionPlannerToast("Session restored from version history.");
} catch (error) {
showSessionPlannerToast(error?.message || "Session could not be restored.", "error");
}
}
function getMedicalAvailabilityItems(dateValue = medicalState?.selectedDate) {
return medicalAvailabilitySelectors.getMedicalAvailabilityItems(dateValue);
}
function getSessionPlannerAvailabilityItems(dateValue = medicalState?.selectedDate) {
  return sessionPlannerMedicalAvailabilitySelectors.getAvailabilityItems(dateValue);
}
function getSessionPlannerMedicalAvailability(dateValue) {
return sessionPlannerMedicalAvailabilitySelectors.getMedicalAvailability(dateValue);
}
function updateSessionPlannerPrintPaper(value) {
if (!sessionPlannerPrintPaperOptions[value]) {
return;
}
local.sessionPlannerPrintPaper = value;
ensureSessionPlannerPrintPageStyle();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSessionPlannerPrintSection(sectionKey, isEnabled) {
if (!sessionPlannerPrintSectionOptions.some((option) => option.key === sectionKey)) {
return;
}
local.sessionPlannerPrintSections = {
...sessionPlannerPrintSections,
[sectionKey]: Boolean(isEnabled),
};
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function ensureSessionPlannerPrintPageStyle() {
const paper = sessionPlannerPrintRenderer.getPaperOption(local.sessionPlannerPrintPaper);
let styleElement = getElement("sessionPlannerPrintPageStyle");
if (!styleElement) {
styleElement = document.createElement("style");
styleElement.id = "sessionPlannerPrintPageStyle";
document.head.appendChild(styleElement);
}
styleElement.textContent = `
@page { size: ${paper.pageSize}; margin: 0; }
@media print {
  body.is-session-printing .session-print-root,
  body.is-session-printing .session-print-root *,
  body.is-session-printing .session-print-document,
  body.is-session-printing .session-print-document * {
    visibility: visible !important;
  }
}`;
}
function removeSessionPlannerPrintRoot() {
document.querySelectorAll("[data-session-print-root]").forEach((element) => element.remove());
local.sessionPlannerPrintRootElement = null;
}
function prepareSessionPlannerPrintRoot() {
removeSessionPlannerPrintRoot();
const printDocument = document.querySelector("[data-session-print-document]");
if (!printDocument) {
return false;
}
local.sessionPlannerPrintRootElement = document.createElement("div");
local.sessionPlannerPrintRootElement.className = "session-print-root";
local.sessionPlannerPrintRootElement.dataset.sessionPrintRoot = "";
local.sessionPlannerPrintRootElement.appendChild(printDocument.cloneNode(true));
document.body.appendChild(local.sessionPlannerPrintRootElement);
return true;
}
function printSessionPlannerCurrentSession() {
if (!local.sessionPlannerPrintOverlayOpen) {
local.sessionPlannerPrintOverlayOpen = true;
syncSessionPlannerPrintModeClass();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
syncSessionPlannerPrintModeClass();
ensureSessionPlannerPrintPageStyle();
win.requestAnimationFrame(() => {
if (prepareSessionPlannerPrintRoot()) {
win.print();
}
});
}
function renderSessionPlannerWorkspace(options = {}) {
if (!ui.sessionPlannerWorkspace) {
return;
}
if (!local.sessionPlannerState) {
local.sessionPlannerState = readSessionPlannerState();
}
const previousDateControls = ui.sessionPlannerWorkspace.querySelector(".session-date-controls");
const previousRenderedSelectedDate =
previousDateControls?.querySelector(".session-date-pill.is-active")?.dataset.sessionDate ?? "";
const previousDateStripScrollLeft = previousDateControls?.querySelector(".session-date-strip")?.scrollLeft ?? 0;
const preserveDateStripScroll = options.preserveDateStripScroll ?? false;
const canReuseDateControls =
Boolean(previousDateControls) && previousRenderedSelectedDate === local.sessionPlannerState?.selectedDate;
const alignSelectedDate = options.alignSelectedDate ?? !canReuseDateControls;
ensurePeriodizationState();
const session = getSessionPlannerSelectedSession();
const block = getSessionPlannerSelectedBlock();
const isAdmin = canEditSessionPlanner();
const selectedDateLabel = getSessionPlannerDateLabel(local.sessionPlannerState.selectedDate, {
weekday: "long",
day: "numeric",
month: "long",
});
const sessionMatchDayLabel = getPeriodizationMatchDayLabel(getPeriodizationDay(local.sessionPlannerState.selectedDate).matchDay);
const sessionTitle =
session.title && session.title.toLowerCase() !== "no session planned"
? session.title
: getScheduledSessionTitleForDate(local.sessionPlannerState.selectedDate) || "Session";
const sessionTotalMinutes = getDashboardSessionTotalMinutes(session);
if (
isCurrentPlatformUserAdmin() &&
local.sessionPlannerHistoryOpen &&
local.sessionPlannerHistoryLoadedDate !== local.sessionPlannerState.selectedDate &&
!local.sessionPlannerHistoryLoading
) {
loadSessionPlannerHistory(local.sessionPlannerState.selectedDate).catch(() => {});
}
ui.sessionPlannerWorkspace.innerHTML = sessionPlannerWorkspaceRenderer.renderWorkspace({
addMenuOpen: local.sessionPlannerAddMenuOpen,
block,
historyContext: getSessionPlannerHistoryPanelContext(),
isAdmin,
selectedDate: local.sessionPlannerState.selectedDate,
selectedDateLabel,
session,
sessionMatchDayLabel,
sessionTitle,
sessionTotalMinutes,
});
if (canReuseDateControls) {
const nextDateControls = ui.sessionPlannerWorkspace.querySelector(".session-date-controls");
nextDateControls?.replaceWith(previousDateControls);
syncSessionPlannerDateStripState(previousDateControls);
const dateStrip = previousDateControls.querySelector(".session-date-strip");
if (dateStrip) {
dateStrip.scrollLeft = previousDateStripScrollLeft;
}
}
win.requestAnimationFrame(resizeSessionPlannerTextareas);
renderSessionPlannerToast();
if (preserveDateStripScroll && !canReuseDateControls) {
win.requestAnimationFrame(() => {
const dateStrip = ui.sessionPlannerWorkspace?.querySelector(".session-date-strip");
if (dateStrip) {
dateStrip.scrollLeft = previousDateStripScrollLeft;
}
});
} else if (alignSelectedDate && !canReuseDateControls) {
win.requestAnimationFrame(() => scrollSessionPlannerSelectedDateIntoView({ behavior: "auto" }));
}
}
let profileWorkspaceFlashMessage = "";
let profileWorkspaceFlashTimer = null;

  return {
    getSessionPlannerSelectedSession,
    ensureSessionPlannerSelectedSession,
    getSessionPlannerSelectedBlock,
    selectSessionPlannerDate,
    selectSessionPlannerBlock,
    addSessionPlannerBlock,
    renumberSessionPlannerExerciseBlocks,
    moveSessionPlannerBlock,
    reorderSessionPlannerBlock,
    getSessionPlannerBlockDropPlacement,
    clearSessionPlannerBlockDragState,
    clearSessionPlannerLibraryDragState,
    updateSessionPlannerLibraryPointerDropTarget,
    startSessionPlannerLibraryPointerDrag,
    updateSessionPlannerLibraryPointerDrag,
    finishSessionPlannerLibraryPointerDrag,
    deleteSessionPlannerBlock,
    setSessionPlannerLibraryOpen,
    closeSessionPlannerLibrary,
    setSessionPlannerAddMenuOpen,
    setSessionPlannerVisualPreviewOpen,
    syncSessionPlannerPrintModeClass,
    setSessionPlannerPrintOverlayOpen,
    setSessionPlannerTacticalboardOpen,
    setSessionPlannerPlayerBoardOpen,
    openSessionPlannerPlayerBoardProfile,
    closeSessionPlannerPlayerBoardProfile,
    getSessionPlannerPlayerBoardVisiblePlayerIds,
    normalizeSessionPlannerPlayerBoardSelectedIds,
    setSessionPlannerPlayerBoardSelectedPlayers,
    toggleSessionPlannerPlayerBoardSelectedPlayer,
    syncSessionPlannerPlayerBoardSelectionUi,
    getSessionPlannerPlayerBoardSelectedColorIds,
    updateSessionPlannerPlayerBoardSelectedColor,
    clearSessionPlannerPlayerBoardSelectedColors,
    getSessionPlannerPlayerBoardContextPosition,
    normalizeSessionPlannerPlayerBoardCustomPersonPromptValue,
    getSessionPlannerPlayerBoardCustomPersonKind,
    removeSessionPlannerPlayerBoardCustomPerson,
    openSessionPlannerPlayerBoardCustomPersonEditor,
    closeSessionPlannerPlayerBoardCustomPersonEditor,
    saveSessionPlannerPlayerBoardCustomPersonFromForm,
    handleSessionPlannerPlayerBoardContextMenu,
    resetSessionPlannerPlayerBoardPositions,
    getSessionPlannerTacticalFrames,
    getSessionPlannerTacticalActiveFrameId,
    ensureSessionPlannerTacticalFrames,
    syncSessionPlannerTacticalActiveFrame,
    persistSessionPlannerTacticalElements,
    commitSessionPlannerTacticalFrames,
    addSessionPlannerTacticalFrame,
    selectSessionPlannerTacticalFrame,
    duplicateSessionPlannerTacticalFrame,
    deleteSessionPlannerTacticalFrame,
    refreshSessionPlannerTacticalboardCanvas,
    isSessionPlannerTacticalLineTool,
    isSessionPlannerTacticalStrokeElement,
    isSessionPlannerTacticalPlacementTool,
    uniqueValues,
    getSessionPlannerTacticalSelectedElementIds,
    setSessionPlannerTacticalSelectedElements,
    isSessionPlannerTacticalSelectionToggleModifier,
    toggleSessionPlannerTacticalElementSelection,
    clearSessionPlannerTacticalSelection,
    setSessionPlannerTacticalClickSuppression,
    setSessionPlannerTacticalPitchMode,
    openSessionPlannerTacticalNumberPicker,
    updateSessionPlannerTacticalPlayerNumber,
    updateSelectedSessionPlannerTacticalPlayerBadges,
    isSessionPlannerTacticalElementSelected,
    shouldDragSessionPlannerTacticalSelectionGroup,
    getSessionPlannerTacticalDragElementIds,
    setSessionPlannerTacticalTool,
    clearSelectedSessionPlannerTacticalBoard,
    undoSelectedSessionPlannerTacticalBoardAction,
    removeSessionPlannerTacticalElement,
    removeSelectedSessionPlannerTacticalElement,
    addSessionPlannerTacticalElement,
    snapSessionPlannerTacticalValue,
    snapSessionPlannerTacticalPoint,
    shouldSnapSessionPlannerTacticalEvent,
    getSessionPlannerTacticalCanvasPoint,
    getSessionPlannerTacticalPointFromRect,
    getSessionPlannerTacticalElementById,
    getSessionPlannerTacticalSelectionRect,
    getSessionPlannerTacticalElementBounds,
    isSessionPlannerTacticalPointInRect,
    getSessionPlannerTacticalElementSelectionPoints,
    isSessionPlannerTacticalElementInSelectionRect,
    getSessionPlannerTacticalElementsInRect,
    renderSessionPlannerTacticalSelectionBox,
    getSelectedSessionPlannerTacticalElement,
    getSelectedSessionPlannerTacticalElements,
    syncSessionPlannerTacticalboardInspector,
    updateSelectedSessionPlannerTacticalElement,
    updateSessionPlannerTacticalLineStyle,
    clampMovedTacticalPoint,
    moveSessionPlannerTacticalElementFromInitial,
    moveSessionPlannerTacticalElements,
    moveSessionPlannerTacticalElementByDelta,
    getSessionPlannerTacticalBoundsCollection,
    getSessionPlannerTacticalArrangeSpacing,
    moveSessionPlannerTacticalElementCenterTo,
    arrangeSelectedSessionPlannerTacticalElements,
    copySelectedSessionPlannerTacticalElements,
    pasteSessionPlannerTacticalClipboard,
    isSessionPlannerTacticalEndpointElement,
    updateSessionPlannerTacticalElementHandle,
    getSessionPlannerTacticalRotationFromEvent,
    shouldPlaceSessionPlannerTacticalDoubleClick,
    shouldSkipRepeatedSessionPlannerTacticalPlacement,
    addSessionPlannerTacticalPlacementElement,
    handleSessionPlannerTacticalCanvasClick,
    handleSessionPlannerTacticalCanvasDoubleClick,
    startSessionPlannerTacticalDrag,
    updateSessionPlannerTacticalDrag,
    finishSessionPlannerTacticalDrag,
    startSessionPlannerPlayerBoardDrag,
    updateSessionPlannerPlayerBoardDrag,
    finishSessionPlannerPlayerBoardDrag,
    getSessionPlannerPlayerBoardEventPoint,
    getSessionPlannerPlayerBoardSelectionRect,
    syncSessionPlannerPlayerBoardSelectionBox,
    startSessionPlannerPlayerBoardSelection,
    updateSessionPlannerPlayerBoardSelection,
    finishSessionPlannerPlayerBoardSelection,
    findSessionPlannerBlockById,
    normalizeSessionPlannerVisualUpload,
    handleSessionPlannerVisualUpload,
    syncSessionPlannerPostSessionNotesToLibrary,
    applySessionPlannerExercise,
    updateSelectedSessionPlannerBlockField,
    getSessionPlannerDateLabel,
    syncSessionPlannerDateStripState,
    scrollSessionPlannerSelectedDateIntoView,
    getSessionPlannerTacticalEndpointCoordinates,
    renderSessionPlannerExerciseVisual,
    renderSessionPlannerActionIcon,
    resizeSessionPlannerTextarea,
    resizeSessionPlannerTextareas,
    scrollSessionPlannerDateStrip,
    jumpSessionPlannerToToday,
    canRemoveSessionPlannerLibraryExerciseFromSelectedFolder,
    renderSessionPlannerCentralSyncConflictOverlay,
    resolveSessionPlannerCentralSyncConflict,
    getSessionPlannerBlockNumber,
    getSessionPlannerPlayerBoardRule,
    getSessionPlannerPlayerBoardProfileState,
    getSessionPlannerPlayerBoardProfileForPlayer,
    getSessionPlannerPlayerBoardProfileRoleFitMap,
    getSessionPlannerPlayerBoardFutureMinutesValue,
    getSessionPlannerPlayerBoardSyncedPlayer,
    getSessionPlannerPlayerBoardBridgeContract,
    getSessionPlannerPlayerBoardBridgeRoleLabel,
    getSessionPlannerPlayerBoardBridgeBestMatches,
    getSessionPlannerPlayerBoardBridgeSummary,
    applySessionPlannerSelectionAssistant,
    compareSessionPlannerPlayerBoardItems,
    isSessionPlannerPlayerVisibleForBoard,
    isSessionPlannerPlayerBoardCustomPersonId,
    getSessionPlannerPlayerBoardCustomPeople,
    getSessionPlannerPlayerBoardCustomPerson,
    createSessionPlannerPlayerBoardCustomItem,
    getSessionPlannerPlayerBoardPlayers,
    getSessionPlannerPlayerBoardSummary,
    getSessionPlannerPlayerBoardWarnings,
    syncSessionPlannerPlayerBoardSelection,
    getSessionPlannerPlayerBoardAutoTargetItems,
    getSessionPlannerPlayerBoardAutoSelectFormation,
    applySessionPlannerPlayerBoardAutoTeamFormation,
    applySessionPlannerPlayerBoardAutoSelect,
    applySessionPlannerPlayerBoardFormation,
    tidySelectedSessionPlannerPlayerBoardPlayers,
    getSessionPlannerPlayerBoardPosition,
    getSessionPlannerPlayerBoardPositionById,
    getSessionPlannerPlayerBoardReadableSpacing,
    getSessionPlannerReadablePlayerBoardPositions,
    copySessionPlannerPlayerBoardTeamsFromBlock,
    formatSessionPlannerHistoryTime,
    getSessionPlannerHistoryActorLabel,
    getSessionPlannerHistoryActionLabel,
    getSessionPlannerHistoryPanelContext,
    loadSessionPlannerHistory,
    restoreSessionPlannerHistoryEntry,
    getMedicalAvailabilityItems,
    getSessionPlannerAvailabilityItems,
    getSessionPlannerMedicalAvailability,
    updateSessionPlannerPrintPaper,
    updateSessionPlannerPrintSection,
    ensureSessionPlannerPrintPageStyle,
    removeSessionPlannerPrintRoot,
    prepareSessionPlannerPrintRoot,
    printSessionPlannerCurrentSession,
    renderSessionPlannerWorkspace,
  };
}
