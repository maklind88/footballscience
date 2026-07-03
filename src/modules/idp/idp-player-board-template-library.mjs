import { sessionPlannerDefaultExerciseLibrary } from "../exercise-library/exercise-library-selectors.mjs";

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim();
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
  if (profile.position === "Goalkeeper" || profile.role === "GK" || text.includes("goalkeeper")) return "goalkeeper";
  if (text.includes("full width")) return "full-wide";
  if (text.includes("final third") || text.includes("build")) return "attacking-half";
  return "attacking-half";
}

function templateZoneLabel(template = {}, focus = {}) {
  return normalizeText(template.subPhase || template.phase || focus?.category, "Development zone");
}

function boardStateFromTemplate(template = {}, profile = {}, focus = {}) {
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

function successCriteriaFromTemplate(template = {}) {
  return [
    normalizeText(template.objective, ""),
    normalizeText(template.principles, ""),
  ].filter(Boolean).slice(0, 2);
}

export function getIdpBoardTemplateLibrary() {
  return sessionPlannerDefaultExerciseLibrary.map((template) => ({
    ...template,
    searchBlob: templateSearchBlob(template),
  }));
}

export function filterIdpBoardTemplates(query = "") {
  const templates = getIdpBoardTemplateLibrary();
  const normalizedQuery = normalizeText(query).toLowerCase();
  return normalizedQuery ? templates.filter((template) => template.searchBlob.includes(normalizedQuery)) : templates;
}

export function idpBoardTemplateById(templateId = "") {
  const safeId = normalizeText(templateId);
  return getIdpBoardTemplateLibrary().find((template) => template.id === safeId) || null;
}

export function idpBoardTemplateIdFromInterventionId(interventionId = "") {
  const value = normalizeText(interventionId);
  return value.startsWith("__template:") ? value.slice("__template:".length) : "";
}

export function idpBoardTemplateInterventionId(templateId = "") {
  return `__template:${normalizeText(templateId)}`;
}

export function idpBoardTemplateDraft(templateId = "", profile = {}, focus = {}) {
  const template = idpBoardTemplateById(templateId);
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
