import { normalizeExerciseLibraryMultiValue } from "./exercise-library-state.mjs";

export const sessionPlannerDefaultExerciseLibrary = Object.freeze([
  Object.freeze({
    id: "possession-block-defending-high-press",
    title: "Possession",
    focus: "Out of Possession Block defending & High Press",
    phase: "Out of Possession",
    subPhase: "Block Defending / High Press",
    minutes: 27,
    time: "10:18-10:45",
    intensity: 5,
    pitchSize: "55m x full width",
    material: "3 mini-goals, one big goal, balls, bibs.",
    objective:
      "We practice keeping possession within the team in our positional structure. We repeatedly work on fundamentals of in-possession positioning, breaking lines and scoring.",
    why:
      "We do this so we feel secure on the ball and can play with rhythm. When positioning is trusted, decisions become quicker and the opponent has to chase us.",
    organization:
      "Open big goal. Work on climbing or pumping the back line and finding the high-press moment on the offensive half.",
    principles:
      "Create and maintain passing options, stretch the opponent, play forward with rhythm, pass to away foot, open body shape, directional first touch, quick pass and immediate movement.",
    diagram: "possession-lanes",
  }),
  Object.freeze({
    id: "build-up-positional-rhythm",
    title: "Build-up Rhythm",
    focus: "Create width, depth and third-player options",
    phase: "In Possession",
    subPhase: "Build Up",
    minutes: 20,
    time: "",
    intensity: 3,
    pitchSize: "Half pitch",
    material: "Balls, bibs, mannequins, two mini-goals.",
    objective: "Connect the first and second line with tempo while keeping the team balanced behind the ball.",
    why: "The team learns to attract pressure, find the free player and arrive in the next space with control.",
    organization: "Start with goalkeeper and back line. Score by playing through pressure into mini-goals.",
    principles: "Scan early, create angles, play away from pressure, move after pass, protect central rest-defence.",
    diagram: "build-up",
  }),
  Object.freeze({
    id: "finishing-from-cutback-zone",
    title: "Cutback Finishing",
    focus: "Arrive in the box with timing and clear finishing roles",
    phase: "In Possession",
    subPhase: "Final Third",
    minutes: 18,
    time: "",
    intensity: 4,
    pitchSize: "Final third",
    material: "One big goal, wide balls, mannequins, bibs.",
    objective: "Create high-value finishes from wide entries, cutbacks and second-wave arrivals.",
    why: "The team needs repeatable spacing in the box so attacks end with control instead of random crosses.",
    organization: "Wide player receives, support runner overlaps or underlaps, two finishing lines attack different zones.",
    principles: "Attack front zone, penalty spot, far post and edge. Time runs late. Finish across goal when possible.",
    diagram: "final-third",
  }),
]);

function defaultNormalizeTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp ? new Date(timestamp).toISOString() : "";
}

export function createExerciseLibrarySelectors(dependencies = {}) {
  const {
    normalizeMultiValue = normalizeExerciseLibraryMultiValue,
    normalizeTimestamp = defaultNormalizeTimestamp,
    sortOptions = [],
  } = dependencies;

  function formatMultiValue(value) {
    return normalizeMultiValue(value).join(", ");
  }

  function getMultiValueSummary(value, fallback) {
    const values = normalizeMultiValue(value);
    return values.length ? values.join(", ") : fallback;
  }

  function normalizeFilterValues(value) {
    const values = Array.isArray(value) ? value : normalizeMultiValue(value);
    return Array.from(
      new Set(
        values
          .map((item) => String(item || "").trim())
          .filter((item) => item && item.toLowerCase() !== "all")
      )
    );
  }

  function exerciseMatchesFilterValue(exerciseValue, selectedValues = []) {
    if (!selectedValues.length) {
      return true;
    }
    const exerciseValues = normalizeMultiValue(exerciseValue);
    return selectedValues.some((value) => exerciseValues.includes(value));
  }

  function normalizeSortMode(value) {
    const sortValue = String(value || "").trim();
    return sortOptions.some((option) => option.value === sortValue) ? sortValue : "updated";
  }

  function getSortTimestamp(exercise = {}, key = "updated") {
    const value = key === "created" ? exercise.createdAt : exercise.updatedAt || exercise.createdAt;
    const timestamp = Date.parse(normalizeTimestamp(value) || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function compareExerciseTitles(a = {}, b = {}) {
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  }

  function compareExercises(a = {}, b = {}, sortModeValue = "updated") {
    const sortMode = normalizeSortMode(sortModeValue);
    if (sortMode === "created") {
      return getSortTimestamp(b, "created") - getSortTimestamp(a, "created") || compareExerciseTitles(a, b);
    }
    if (sortMode === "title") {
      return compareExerciseTitles(a, b);
    }
    if (sortMode === "phase") {
      return (
        `${a.phase || ""} ${a.subPhase || ""} ${a.title || ""}`.localeCompare(
          `${b.phase || ""} ${b.subPhase || ""} ${b.title || ""}`,
          undefined,
          { sensitivity: "base" }
        ) ||
        getSortTimestamp(b, "updated") - getSortTimestamp(a, "updated")
      );
    }
    return getSortTimestamp(b, "updated") - getSortTimestamp(a, "updated") || compareExerciseTitles(a, b);
  }

  return {
    compareExerciseTitles,
    compareExercises,
    exerciseMatchesFilterValue,
    formatMultiValue,
    getMultiValueSummary,
    getSortTimestamp,
    normalizeFilterValues,
    normalizeMultiValue,
    normalizeSortMode,
  };
}
