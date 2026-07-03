import { sessionPlannerDefaultExerciseLibrary } from "../exercise-library/exercise-library-selectors.mjs";

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim();
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

function initialsFromName(value = "Player", fallback = "P") {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : words[0]?.slice(0, 2) || fallback).toUpperCase();
}

function templateSearchBlob(template = {}) {
  return [
    template.title,
    template.focus,
    template.phase,
    template.subPhase,
    template.objective,
    template.why,
    template.organization,
    template.principles,
    template.tags,
  ].flatMap((item) => Array.isArray(item) ? item : [item]).map((item) => normalizeText(item).toLowerCase()).join(" ");
}

function templatePitchMode(template = {}, profile = {}) {
  const text = `${template.title || ""} ${template.focus || ""} ${template.phase || ""} ${template.subPhase || ""} ${template.pitchSize || ""}`.toLowerCase();
  if (template.tacticalPitchMode === "attacking-half" || template.tacticalPitchMode === "final-third") return "attacking-half";
  if (template.tacticalPitchMode === "defending-half") return "defending-half";
  if (template.tacticalPitchMode === "full-wide") return "full-wide";
  if (profile.position === "Goalkeeper" || profile.role === "GK" || text.includes("goalkeeper")) return "goalkeeper";
  if (text.includes("full width")) return "full-wide";
  if (text.includes("final third") || text.includes("build")) return "attacking-half";
  return "attacking-half";
}

function templateZoneLabel(template = {}, focus = {}) {
  return normalizeText(template.subPhase || template.phase || focus?.category, "Development zone");
}

function isArchivedTemplate(template = {}) {
  return Boolean(normalizeText(template.archivedAt, ""));
}

function sourceTemplateLibrary(sourceLibrary = []) {
  const savedTemplates = Array.isArray(sourceLibrary)
    ? sourceLibrary.filter((template) => template && typeof template === "object" && !Array.isArray(template) && !isArchivedTemplate(template))
    : [];
  return (savedTemplates.length ? savedTemplates : sessionPlannerDefaultExerciseLibrary).map((template) => ({
    ...template,
    sourceType: savedTemplates.length ? "saved-exercise-library" : "default-exercise-library",
    searchBlob: templateSearchBlob(template),
  }));
}

function normalizeElementPoint(element = {}, xKey = "x", yKey = "y", fallback = { x: 50, y: 50 }) {
  return {
    x: clampPercent(element[xKey], fallback.x),
    y: clampPercent(element[yKey], fallback.y),
  };
}

function tacticalElementsFromTemplate(template = {}) {
  const frames = Array.isArray(template.tacticalFrames) ? template.tacticalFrames : [];
  const frameElements = frames.find((frame) => Array.isArray(frame?.elements) && frame.elements.length)?.elements || [];
  const fallbackElements = Array.isArray(template.tacticalElements) ? template.tacticalElements : [];
  return frameElements.length ? frameElements : fallbackElements;
}

function isPlayerLikeTacticalElement(element = {}) {
  return ["blue-player", "red-player", "neutral-player", "coach"].includes(element?.type);
}

function mapTacticalReferencePlayers(elements = []) {
  return elements
    .filter((element) => isPlayerLikeTacticalElement(element))
    .slice(0, 4)
    .map((element, index) => ({
      id: normalizeText(element.id, `reference-${index + 1}`),
      label: normalizeText(element.playerNumber || element.label, element.type === "coach" ? "C" : `P${index + 1}`).slice(0, 3),
      name: normalizeText(element.label, element.type === "coach" ? "Coach" : "Reference"),
      ...normalizeElementPoint(element, "x", "y", { x: 48 + index * 6, y: 44 }),
    }));
}

function mapTacticalCones(elements = []) {
  return elements
    .filter((element) => ["cone", "mannequin", "pole", "gate", "mini-goal", "big-goal", "ball"].includes(element?.type))
    .slice(0, 6)
    .map((element, index) => ({
      id: normalizeText(element.id, `cone-${index + 1}`),
      ...normalizeElementPoint(element, "x", "y", { x: 40 + index * 5, y: 58 }),
    }));
}

function mapTacticalZones(elements = [], template = {}, focus = {}) {
  const zones = elements
    .filter((element) => ["zone", "dashed-zone", "ellipse"].includes(element?.type))
    .slice(0, 3)
    .map((element, index) => {
      const point = normalizeElementPoint(element, "x", "y", { x: 38, y: 28 });
      return {
        id: normalizeText(element.id, `zone-${index + 1}`),
        label: normalizeText(element.label, templateZoneLabel(template, focus)),
        x: point.x,
        y: point.y,
        width: clampPercent(element.width || element.w || 28, 28),
        height: clampPercent(element.height || element.h || 24, 24),
      };
    });
  return zones.length ? zones : null;
}

function mapTacticalArrows(elements = []) {
  return elements
    .filter((element) => (
      ["arrow", "pass", "run", "line", "dashed-line", "curve"].includes(element?.type)
      && Number.isFinite(Number(element.x2))
      && Number.isFinite(Number(element.y2))
    ))
    .slice(0, 4)
    .map((element, index) => {
      const type = element.type === "dashed-line" ? "line" : element.type;
      return {
        id: normalizeText(element.id, `arrow-${index + 1}`),
        type: type === "arrow" ? "run" : type,
        label: normalizeText(element.label, "Action path"),
        color: normalizeText(element.color, type === "pass" ? "#fbbf24" : "#38bdf8"),
        lineStyle: normalizeText(element.lineStyle, element.type === "dashed-line" ? "dashed" : type === "pass" ? "dotted" : "solid"),
        lineWidth: Number.isFinite(Number(element.lineWidth)) ? Number(element.lineWidth) : 2.5,
        from: normalizeElementPoint(element, "x", "y", { x: 50, y: 70 }),
        to: normalizeElementPoint(element, "x2", "y2", { x: 62, y: 42 }),
      };
    });
}

function mapTacticalNotes(elements = [], template = {}) {
  return elements
    .filter((element) => element?.type === "text" || (normalizeText(element?.label) && !isPlayerLikeTacticalElement(element)))
    .slice(0, 3)
    .map((element, index) => ({
      id: normalizeText(element.id, `note-${index + 1}`),
      ...normalizeElementPoint(element, "x", "y", { x: 12, y: 14 + index * 8 }),
      text: normalizeText(element.label, template.focus || template.title || "Coach note"),
    }));
}

function boardStateFromTacticalTemplate(template = {}, profile = {}, focus = {}) {
  const elements = tacticalElementsFromTemplate(template);
  if (!elements.length) return null;
  const fallback = generatedBoardStateFromTemplate(template, profile, focus);
  const references = mapTacticalReferencePlayers(elements);
  const cones = mapTacticalCones(elements);
  const zones = mapTacticalZones(elements, template, focus) || fallback.zones;
  const arrows = mapTacticalArrows(elements);
  const notes = mapTacticalNotes(elements, template);
  const frames = Array.isArray(template.tacticalFrames) && template.tacticalFrames.length
    ? template.tacticalFrames.slice(0, 8).map((frame, index) => {
      const frameElements = Array.isArray(frame?.elements) ? frame.elements : elements;
      const frameReferences = mapTacticalReferencePlayers(frameElements);
      const frameCones = mapTacticalCones(frameElements);
      const frameArrows = mapTacticalArrows(frameElements);
      const frameNotes = mapTacticalNotes(frameElements, template);
      return {
        id: normalizeText(frame?.id, `frame-${index + 1}`),
        label: normalizeText(frame?.label, index === 0 ? "Set the picture" : `Frame ${index + 1}`),
        player: fallback.player,
        referencePlayers: frameReferences.length ? frameReferences : references,
        cones: frameCones.length ? frameCones : cones,
        zones: mapTacticalZones(frameElements, template, focus) || zones,
        arrows: frameArrows.length ? frameArrows : arrows,
        notes: frameNotes.length ? frameNotes : notes,
        coachCue: normalizeText(template.organization, fallback.frames?.[0]?.coachCue || ""),
        playerCue: normalizeText(template.principles, fallback.frames?.[0]?.playerCue || ""),
      };
    })
    : fallback.frames;
  return {
    ...fallback,
    source: "exercise-library-template",
    sourceTemplateId: template.id,
    referencePlayers: references.length ? references : fallback.referencePlayers,
    cones: cones.length ? cones : fallback.cones,
    zones,
    arrows: arrows.length ? arrows : fallback.arrows,
    notes: notes.length ? notes : fallback.notes,
    frames,
  };
}

function generatedBoardStateFromTemplate(template = {}, profile = {}, focus = {}) {
  const isGoalkeeper = profile.position === "Goalkeeper" || profile.role === "GK";
  const playerName = normalizeText(profile.playerName || profile.name, "Player");
  const pitchMode = templatePitchMode(template, profile);
  const basePlayer = { x: isGoalkeeper ? 50 : 44, y: isGoalkeeper ? 82 : 72, label: initialsFromName(playerName), name: playerName };
  const baseReference = { id: "reference-1", label: "REF", x: isGoalkeeper ? 50 : 58, y: isGoalkeeper ? 48 : 48 };
  const baseZone = { id: "zone-1", label: templateZoneLabel(template, focus), x: isGoalkeeper ? 34 : 40, y: isGoalkeeper ? 28 : 28, width: isGoalkeeper ? 32 : 28, height: isGoalkeeper ? 28 : 26 };
  const baseCones = [
    { id: "cone-1", x: isGoalkeeper ? 40 : 35, y: isGoalkeeper ? 58 : 62 },
    { id: "cone-2", x: isGoalkeeper ? 60 : 65, y: isGoalkeeper ? 58 : 62 },
    { id: "cone-3", x: isGoalkeeper ? 50 : 50, y: isGoalkeeper ? 38 : 38 },
  ];
  const baseArrow = {
    id: "arrow-1",
    type: template.diagram === "final-third" ? "run" : "pass",
    label: "Action path",
    color: template.diagram === "final-third" ? "#f97316" : "#38bdf8",
    lineStyle: template.diagram === "build-up" ? "dotted" : "dashed",
    lineWidth: 2.5,
    from: { x: basePlayer.x, y: basePlayer.y },
    to: { x: isGoalkeeper ? 62 : 68, y: isGoalkeeper ? 42 : 36 },
  };
  const setupCue = normalizeText(template.organization, "Set the player in the starting picture and clarify the first reference.");
  const playerCue = normalizeText(template.principles, template.objective || "Recognise the cue and execute the action.");
  return {
    schema: "idp-player-board-v2",
    source: "exercise-library-template",
    sourceTemplateId: template.id,
    player: basePlayer,
    referencePlayers: [baseReference],
    cones: baseCones,
    zones: [baseZone],
    arrows: [baseArrow],
    notes: [{ id: "note-1", x: 12, y: 14, text: normalizeText(template.focus, template.title) }],
    linkedClipIds: [],
    frames: [
      {
        id: "frame-1",
        label: "Set the picture",
        player: basePlayer,
        referencePlayers: [baseReference],
        cones: baseCones,
        zones: [baseZone],
        arrows: [baseArrow],
        notes: [{ id: "note-1", x: 12, y: 14, text: normalizeText(template.focus, template.title) }],
        coachCue: setupCue,
        playerCue,
      },
      {
        id: "frame-2",
        label: "Execute the action",
        player: { ...basePlayer, x: isGoalkeeper ? 52 : 56, y: isGoalkeeper ? 70 : 58 },
        referencePlayers: [{ ...baseReference, x: isGoalkeeper ? 58 : 68, y: isGoalkeeper ? 42 : 42 }],
        cones: baseCones,
        zones: [baseZone],
        arrows: [{ ...baseArrow, from: { x: isGoalkeeper ? 52 : 56, y: isGoalkeeper ? 70 : 58 }, to: { x: isGoalkeeper ? 64 : 74, y: isGoalkeeper ? 36 : 32 } }],
        notes: [{ id: "note-1", x: 12, y: 14, text: normalizeText(template.why, template.focus) }],
        coachCue: normalizeText(template.why, setupCue),
        playerCue: normalizeText(template.objective, playerCue),
      },
    ],
    activeFrameIndex: 0,
  };
}

function boardStateFromTemplate(template = {}, profile = {}, focus = {}) {
  return boardStateFromTacticalTemplate(template, profile, focus) || generatedBoardStateFromTemplate(template, profile, focus);
}

function successCriteriaFromTemplate(template = {}) {
  return [
    normalizeText(template.objective, ""),
    normalizeText(template.principles, ""),
  ].filter(Boolean).slice(0, 2);
}

export function getIdpBoardTemplateLibrary(sourceLibrary = []) {
  return sourceTemplateLibrary(sourceLibrary);
}

export function filterIdpBoardTemplates(query = "", sourceLibrary = []) {
  const templates = sourceTemplateLibrary(sourceLibrary);
  const normalizedQuery = normalizeText(query).toLowerCase();
  return normalizedQuery ? templates.filter((template) => template.searchBlob.includes(normalizedQuery)) : templates;
}

export function idpBoardTemplateById(templateId = "", sourceLibrary = []) {
  const safeId = normalizeText(templateId);
  return sourceTemplateLibrary(sourceLibrary).find((template) => template.id === safeId) || null;
}

export function idpBoardTemplateIdFromInterventionId(interventionId = "") {
  const value = normalizeText(interventionId);
  return value.startsWith("__template:") ? value.slice("__template:".length) : "";
}

export function idpBoardTemplateInterventionId(templateId = "") {
  return `__template:${normalizeText(templateId)}`;
}

export function idpBoardTemplateDraft(templateId = "", profile = {}, focus = {}, sourceLibrary = []) {
  const template = idpBoardTemplateById(templateId, sourceLibrary);
  if (!template) return null;
  return {
    id: "",
    sourceTemplateId: template.id,
    title: template.title || "Individual exercise",
    objective: template.objective || template.focus || focus?.description || "",
    coachingCue: template.principles || "",
    successCriteria: successCriteriaFromTemplate(template),
    pitchMode: templatePitchMode(template, profile),
    status: "draft",
    rowVersion: 1,
    boardState: boardStateFromTemplate(template, profile, focus),
  };
}
