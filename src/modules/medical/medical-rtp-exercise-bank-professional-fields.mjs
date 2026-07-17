const normalizeArray = (value = []) =>
  (Array.isArray(value) ? value : [value]).map((item) => String(item ?? "").trim()).filter(Boolean);

const uniqueArray = (value = []) => Array.from(new Set(normalizeArray(value)));

const includesAny = (text = "", fragments = []) => fragments.some((fragment) => text.includes(fragment));

const compactText = (value = "", maxLength = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const FAMILY_VISUALS = Object.freeze({
  "posterior chain": "posterior-chain-bridge",
  "groin": "frontal-plane-adduction",
  "calf tendon": "calf-achilles-loading",
  "calf": "calf-achilles-loading",
  "plyometric": "energy-storage-contacts",
  "tendon plyometric": "energy-storage-contacts",
  "knee strength": "knee-dominant-loading",
  "deceleration": "braking-mechanics",
  "running": "field-running-exposure",
  "football exposure": "football-ball-exposure",
  "upper body": "upper-body-contact-control",
  "goalkeeper": "goalkeeper-save-landing",
  "medical": "medical-governed-exertion",
});

const FAMILY_VISUAL_RULES = Object.freeze([
  [["posterior", "strength"], "posterior-chain-bridge"],
  [["groin", "frontal"], "frontal-plane-adduction"],
  [["calf", "achilles", "ankle", "foot", "forefoot", "midfoot", "lower leg"], "calf-achilles-loading"],
  [["plyometric", "landing"], "energy-storage-contacts"],
  [["knee", "quadriceps", "patellar", "single-leg"], "knee-dominant-loading"],
  [["deceleration", "change of direction", "field exposure"], "braking-mechanics"],
  [["running", "conditioning", "respiratory", "recovery"], "field-running-exposure"],
  [["football exposure", "football integration"], "football-ball-exposure"],
  [["shoulder", "upper", "hand", "contact"], "upper-body-contact-control"],
  [["goalkeeper"], "goalkeeper-save-landing"],
  [["surgical", "fracture"], "surgical-re-entry"],
  [["medical", "concussion", "neck", "postpartum"], "medical-governed-exertion"],
]);

function getFamilyVisual(family = "") {
  if (FAMILY_VISUALS[family]) return FAMILY_VISUALS[family];
  return FAMILY_VISUAL_RULES.find(([fragments]) => fragments.some((fragment) => family.includes(fragment)))?.[1]
    || "medical-governed-exertion";
}

function inferBodyRegions(exercise = {}) {
  const text = `${exercise.name} ${exercise.family} ${exercise.intent} ${normalizeArray(exercise.footballDemands).join(" ")}`.toLowerCase();
  const regions = [];
  if (includesAny(text, ["hamstring", "posterior", "sprint", "hinge"])) regions.push("posterior thigh", "hip");
  if (includesAny(text, ["adductor", "groin", "copenhagen", "kicking"])) regions.push("groin", "hip");
  if (includesAny(text, ["calf", "achilles", "ankle", "pogo", "hop"])) regions.push("calf", "ankle", "foot");
  if (includesAny(text, ["knee", "quad", "patellar", "landing", "deceleration"])) regions.push("knee");
  if (includesAny(text, ["trunk", "spine", "lumbar", "rotation", "rib"])) regions.push("trunk", "spine");
  if (includesAny(text, ["shoulder", "wrist", "hand", "finger", "goalkeeper"])) regions.push("shoulder", "upper limb");
  return uniqueArray(regions.length ? regions : ["whole body"]);
}

function inferMechanismTags(exercise = {}) {
  const text = `${exercise.name} ${exercise.intent} ${normalizeArray(exercise.footballDemands).join(" ")}`.toLowerCase();
  const tags = [];
  if (includesAny(text, ["sprint", "max velocity", "high-speed", "acceleration"])) tags.push("sprint exposure");
  if (includesAny(text, ["deceleration", "braking", "landing", "snapdown"])) tags.push("deceleration / landing");
  if (includesAny(text, ["cut", "cod", "lateral", "shuffle", "adduction"])) tags.push("change of direction");
  if (includesAny(text, ["jump", "hop", "pogo", "plyometric"])) tags.push("jump / energy storage");
  if (includesAny(text, ["contact", "duel", "fall", "save"])) tags.push("contact / ground interaction");
  if (includesAny(text, ["run", "tempo", "exertion", "conditioning"])) tags.push("graded running load");
  return uniqueArray(tags.length ? tags : ["general capacity"]);
}

function inferPositionDemands(exercise = {}) {
  const text = `${exercise.name} ${exercise.intent} ${normalizeArray(exercise.footballDemands).join(" ")}`.toLowerCase();
  const demands = [];
  if (includesAny(text, ["sprint", "max velocity", "repeated sprint", "acceleration"])) demands.push("winger / full back / striker speed exposure");
  if (includesAny(text, ["deceleration", "braking", "cutting", "cod"])) demands.push("midfielder and defender braking/COD exposure");
  if (includesAny(text, ["kicking", "crossing", "shooting"])) demands.push("kicking and ball-striking roles");
  if (includesAny(text, ["contact", "duel", "landing"])) demands.push("defensive duel and aerial-contact roles");
  if (includesAny(text, ["goalkeeper", "save", "wrist", "shoulder"])) demands.push("goalkeeper save, dive and handling exposure");
  return uniqueArray(demands.length ? demands : ["position-specific football exposure"]);
}

function inferMedia(exercise = {}) {
  const family = compactText(exercise.family, 80).toLowerCase();
  const diagramKey = getFamilyVisual(family);
  const altText = `${exercise.name || "RTP exercise"} setup and movement diagram`;
  return {
    mediaStatus: "diagram",
    thumbnail: {
      kind: "diagram",
      diagramKey,
      altText,
      status: "diagram",
    },
    media: [
      {
        type: "diagram",
        title: `${exercise.name || "Exercise"} diagram`,
        diagramKey,
        altText,
        status: "diagram",
      },
    ],
  };
}

function buildProgramBuilder(exercise = {}) {
  const phase = normalizeArray(exercise.phases)[0] || "rehab";
  const demand = normalizeArray(exercise.footballDemands)[0] || "football exposure";
  const holdRule = normalizeArray(exercise.holdRules)[0] || "hold if symptoms or movement quality worsen";
  return {
    loadFocus: compactText(exercise.intent || `Build ${demand} capacity.`, 260),
    phase,
    gateCriteria: [
      `${exercise.name || "Exercise"} completed with stable symptoms and acceptable movement quality`,
      "24-hour response reviewed before progression",
    ],
    nextExposure: compactText(exercise.progression || `Progress ${demand} only after the current dose is stable.`, 260),
    holdRules: uniqueArray([holdRule, "regress or pause if next-day response is worse than baseline"]),
    warningPoints: uniqueArray(normalizeArray(exercise.holdRules).slice(0, 3)),
    medicalNotesPrompt: "Add player-specific pain response, contraindications, restrictions and clinical reasoning before saving to Medical Plan.",
  };
}

function buildProfessionalFields(exercise = {}) {
  const bodyRegions = inferBodyRegions(exercise);
  const mechanismTags = inferMechanismTags(exercise);
  const positionDemands = inferPositionDemands(exercise);
  const media = inferMedia(exercise);
  const coachingCues = uniqueArray([
    "quality before quantity",
    "stop if symptoms change movement strategy",
    normalizeArray(exercise.footballDemands)[0] ? `connect to ${normalizeArray(exercise.footballDemands)[0]}` : "",
  ]);
  return {
    bodyRegions,
    symptomTags: uniqueArray([...bodyRegions, ...normalizeArray(exercise.tissueTypes)]),
    mechanismTags,
    positionDemands,
    clinicalTags: uniqueArray([
      ...normalizeArray(exercise.tissueTypes),
      ...normalizeArray(exercise.phases),
      ...normalizeArray(exercise.movementPlanes),
      ...mechanismTags,
    ]),
    setup: "Set the environment, equipment and space so Medical can control dose, symptom response and movement quality.",
    execution: compactText(exercise.dosage || "Use the agreed dose and monitor response during and after the exposure.", 500),
    coachingCues,
    qualityChecks: uniqueArray([
      "no protective movement strategy",
      "stable symptom response during exposure",
      "next-day response reviewed before progression",
    ]),
    commonErrors: uniqueArray([
      "progressing load and complexity at the same time",
      "using gym completion as football clearance",
      "missing next-day symptom response",
    ]),
    programBuilder: buildProgramBuilder(exercise),
    mediaStatus: media.mediaStatus,
    thumbnail: media.thumbnail,
    media: media.media,
  };
}

export function enhanceMedicalRtpExerciseItem(exercise = {}) {
  const professional = buildProfessionalFields(exercise);
  return {
    ...exercise,
    ...professional,
  };
}

export function getMedicalRtpExerciseCatalogSearchText(exercise = {}) {
  return [
    exercise.name,
    exercise.family,
    exercise.intent,
    exercise.tissueTypes,
    exercise.phases,
    exercise.movementPlanes,
    exercise.footballDemands,
    exercise.equipment,
    exercise.riskLevel,
    exercise.evidenceLevel,
    exercise.evidenceSummary,
    exercise.consensusNote,
    exercise.bodyRegions,
    exercise.symptomTags,
    exercise.mechanismTags,
    exercise.positionDemands,
    exercise.clinicalTags,
    exercise.setup,
    exercise.execution,
    exercise.coachingCues,
    exercise.qualityChecks,
    exercise.programBuilder?.loadFocus,
    exercise.programBuilder?.gateCriteria,
    exercise.programBuilder?.nextExposure,
    exercise.programBuilder?.holdRules,
  ]
    .flat()
    .map((item) => compactText(item, 240).toLowerCase())
    .filter(Boolean)
    .join(" ");
}
