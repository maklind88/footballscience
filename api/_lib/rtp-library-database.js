const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");

const RTP_LIBRARY_SCHEMA = "footballscience-rtp-library-v1";
const RTP_LIBRARY_WRITES_ENABLED = false;
const MAX_LIBRARY_LIMIT = 250;
const MAX_EXERCISE_LIMIT = 120;
const READ_ROLES = new Set(["admin", "club-admin", "team-admin", "medical", "performance"]);

let fallbackLibraryPromise = null;

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeId(value, maxLength = 120) {
  return normalizeText(value, maxLength).toLowerCase();
}

function normalizeArray(value = []) {
  return (Array.isArray(value) ? value : [value]).map((item) => normalizeText(item, 160)).filter(Boolean);
}

function actorRole(actor = {}) {
  return normalizeText(actor.role || actor.appRole || "unknown", 40).toLowerCase();
}

function canReadRtpLibrary(actor = {}) {
  return READ_ROLES.has(actorRole(actor));
}

function asLimit(value, fallback = MAX_LIBRARY_LIMIT) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(limit, MAX_LIBRARY_LIMIT);
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return {
    url: `${url}/rest/v1`,
    serviceRoleKey,
  };
}

function restHeaders(serviceRoleKey, extra = {}) {
  return {
    ...buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
    ...extra,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function dbRequest(pathname, options = {}) {
  const base = restBaseUrl();
  if (!base || typeof fetch !== "function") {
    return { ok: false, status: 503, reason: "RTP Library database is not configured." };
  }
  const response = await fetch(`${base.url}${pathname}`, {
    method: options.method || "GET",
    headers: restHeaders(base.serviceRoleKey, options.headers || {}),
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(8000)
      : undefined,
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.hint || "RTP Library database request failed.",
      payload,
    };
  }
  return { ok: true, status: response.status, data: payload };
}

function fallbackModuleUrl(relativePath) {
  return pathToFileURL(path.join(process.cwd(), relativePath)).href;
}

async function loadFallbackLibrary() {
  fallbackLibraryPromise ??= Promise.all([
    import(fallbackModuleUrl("src/modules/medical/medical-rtp-library-data.mjs")),
    import(fallbackModuleUrl("src/modules/medical/medical-rtp-exercise-bank-data.mjs")),
  ]).then(([libraryData, exerciseData]) => ({
    profiles: libraryData.medicalRtpLibraryProfiles || [],
    getProfileById: libraryData.getMedicalRtpLibraryProfileById,
    filterOptions: libraryData.medicalRtpLibraryFilterOptions || {},
    clinicalSearchGroups: libraryData.getMedicalRtpLibraryClinicalSearchGroups,
    clinicalSearchText: libraryData.getMedicalRtpLibraryClinicalSearchText,
    starterDraft: libraryData.createMedicalRtpLibraryStarterDraft,
    exercises: exerciseData.medicalRtpExerciseBank || [],
    evidenceReferences: exerciseData.medicalRtpExerciseEvidenceReferences || {},
    getExercisesForProfile: exerciseData.getMedicalRtpExercisesForProfile,
    coverageMap: exerciseData.medicalRtpExerciseProfileCoverageMap,
  }));
  return fallbackLibraryPromise;
}

function profileListItem(profile = {}) {
  return {
    id: normalizeId(profile.id),
    name: normalizeText(profile.name, 180),
    system: normalizeText(profile.system, 80),
    bodyArea: normalizeText(profile.bodyArea || profile.body_area, 120),
    family: normalizeText(profile.family, 80),
    evidenceLevel: normalizeText(profile.evidenceLevel || profile.evidence_level, 120),
    summary: normalizeText(profile.summary, 900),
    evidence: normalizeText(profile.evidence || profile.evidenceSummary || profile.evidence_summary, 900),
    experience: normalizeText(profile.experience || profile.experienceSummary || profile.experience_summary, 900),
    symptoms: normalizeArray(profile.symptoms),
    positions: normalizeArray(profile.positions),
    movementPlanes: normalizeArray(profile.movementPlanes || profile.movement_planes),
    riskTags: normalizeArray(profile.riskTags || profile.risk_tags),
    season: normalizeArray(profile.season),
    sex: normalizeArray(profile.sex),
    level: normalizeArray(profile.level),
    researchAuditStatus: normalizeText(profile.researchAuditStatus || profile.research_audit_status, 80),
    researchAuditReviewedAt: normalizeText(profile.researchAuditReviewedAt || profile.reviewed_at, 80),
  };
}

function profileDetail(profile = {}) {
  return {
    ...profileListItem(profile),
    redFlags: normalizeArray(profile.redFlags || profile.red_flags),
    criteria: normalizeArray(profile.criteria),
    trainingChecklist: normalizeArray(profile.trainingChecklist || profile.training_checklist),
    matchChecklist: normalizeArray(profile.matchChecklist || profile.match_checklist),
    mistakes: normalizeArray(profile.mistakes),
    phases: normalizeArray(profile.phases),
    loadText: normalizeArray(profile.loadText || profile.load_text),
    starter: profile.starter && typeof profile.starter === "object" ? profile.starter : null,
    monitoring: normalizeArray(profile.monitoring),
    gpsBenchmarks: normalizeArray(profile.gpsBenchmarks || profile.gps_benchmarks),
    strengthBenchmarks: normalizeArray(profile.strengthBenchmarks || profile.strength_benchmarks),
    goldStandardSections: Array.isArray(profile.goldStandardSections || profile.gold_standard_sections)
      ? profile.goldStandardSections || profile.gold_standard_sections
      : [],
  };
}

function exerciseItem(exercise = {}) {
  const media = Array.isArray(exercise.media) ? exercise.media : [];
  const thumbnail = exercise.thumbnail && typeof exercise.thumbnail === "object" ? exercise.thumbnail : null;
  return {
    id: normalizeId(exercise.id),
    name: normalizeText(exercise.name, 180),
    family: normalizeText(exercise.family, 80),
    intent: normalizeText(exercise.intent, 500),
    tissueTypes: normalizeArray(exercise.tissueTypes || exercise.tissue_types),
    phases: normalizeArray(exercise.phases),
    movementPlanes: normalizeArray(exercise.movementPlanes || exercise.movement_planes),
    footballDemands: normalizeArray(exercise.footballDemands || exercise.football_demands),
    equipment: normalizeArray(exercise.equipment),
    riskLevel: normalizeText(exercise.riskLevel || exercise.risk_level, 40),
    evidenceLevel: normalizeText(exercise.evidenceLevel || exercise.evidence_level, 120),
    evidenceSummary: normalizeText(exercise.evidenceSummary || exercise.evidence_summary, 800),
    consensusNote: normalizeText(exercise.consensusNote || exercise.consensus_note, 800),
    dosage: normalizeText(exercise.dosage, 500),
    progression: normalizeText(exercise.progression, 500),
    regression: normalizeText(exercise.regression, 500),
    holdRules: normalizeArray(exercise.holdRules || exercise.hold_rules),
    medicalNotes: normalizeText(exercise.medicalNotes || exercise.medical_notes, 800),
    performanceNotes: normalizeText(exercise.performanceNotes || exercise.performance_notes, 800),
    coachSafeLabel: normalizeText(exercise.coachSafeLabel || exercise.coach_safe_label, 120),
    evidenceRefs: normalizeArray(exercise.evidenceRefs || exercise.evidence_refs),
    bodyRegions: normalizeArray(exercise.bodyRegions || exercise.body_regions),
    symptomTags: normalizeArray(exercise.symptomTags || exercise.symptom_tags),
    mechanismTags: normalizeArray(exercise.mechanismTags || exercise.mechanism_tags),
    positionDemands: normalizeArray(exercise.positionDemands || exercise.position_demands),
    clinicalTags: normalizeArray(exercise.clinicalTags || exercise.clinical_tags),
    setup: normalizeText(exercise.setup, 900),
    execution: normalizeText(exercise.execution, 900),
    coachingCues: normalizeArray(exercise.coachingCues || exercise.coaching_cues),
    qualityChecks: normalizeArray(exercise.qualityChecks || exercise.quality_checks),
    commonErrors: normalizeArray(exercise.commonErrors || exercise.common_errors),
    programBuilder:
      exercise.programBuilder && typeof exercise.programBuilder === "object"
        ? exercise.programBuilder
        : exercise.program_builder && typeof exercise.program_builder === "object"
          ? exercise.program_builder
          : {},
    mediaStatus: normalizeText(exercise.mediaStatus || exercise.media_status, 40) || "missing",
    thumbnail: thumbnail || {
      kind: exercise.thumbnail_storage_path || exercise.thumbnail_url ? "image" : exercise.diagram_key ? "diagram" : "",
      storagePath: normalizeText(exercise.thumbnailStoragePath || exercise.thumbnail_storage_path, 500),
      url: normalizeText(exercise.thumbnailUrl || exercise.thumbnail_url, 500),
      diagramKey: normalizeText(exercise.diagramKey || exercise.diagram_key, 160),
      altText: normalizeText(exercise.thumbnailAltText || `${exercise.name || "Exercise"} thumbnail`, 220),
      status: normalizeText(exercise.mediaStatus || exercise.media_status, 40) || "missing",
    },
    media,
    mediaSummary: {
      total: media.length,
      hasVideo: media.some((item) => item?.type === "video" || item?.mediaType === "video" || item?.media_type === "video"),
      hasImage: media.some((item) => item?.type === "image" || item?.mediaType === "image" || item?.media_type === "image"),
      hasDiagram: media.some((item) => item?.type === "diagram" || item?.mediaType === "diagram" || item?.media_type === "diagram") || Boolean(exercise.diagram_key),
    },
  };
}

function exerciseListItem(exercise = {}) {
  const item = exerciseItem(exercise);
  return {
    id: item.id,
    name: item.name,
    family: item.family,
    intent: item.intent,
    tissueTypes: item.tissueTypes,
    phases: item.phases,
    movementPlanes: item.movementPlanes,
    footballDemands: item.footballDemands,
    equipment: item.equipment,
    riskLevel: item.riskLevel,
    evidenceLevel: item.evidenceLevel,
    bodyRegions: item.bodyRegions,
    mechanismTags: item.mechanismTags,
    positionDemands: item.positionDemands,
    programBuilder: {
      phase: item.programBuilder?.phase || item.phases[0] || "",
      loadFocus: normalizeText(item.programBuilder?.loadFocus, 260),
      gateCriteria: normalizeArray(item.programBuilder?.gateCriteria).slice(0, 2),
      nextExposure: normalizeText(item.programBuilder?.nextExposure, 260),
      holdRules: normalizeArray(item.programBuilder?.holdRules).slice(0, 2),
    },
    mediaStatus: item.mediaStatus,
    thumbnail: item.thumbnail,
    mediaSummary: item.mediaSummary,
  };
}

function getProfileSearchText(profile = {}) {
  return [
    profile.id,
    profile.name,
    profile.system,
    profile.bodyArea,
    profile.family,
    profile.summary,
    profile.evidence,
    profile.experience,
    profile.symptoms,
    profile.positions,
    profile.movementPlanes,
    profile.riskTags,
    profile.redFlags,
    profile.criteria,
  ].flat().map((item) => normalizeText(item, 300).toLowerCase()).join(" ");
}

function filterProfiles(profiles = [], query = {}) {
  const search = normalizeText(query.q || query.search, 180).toLowerCase();
  const movement = normalizeText(query.movement || query.movementPlane || query.movement_plane, 80).toLowerCase();
  return profiles.filter((profile) => {
    if (search && !getProfileSearchText(profile).includes(search)) {
      return false;
    }
    if (movement && movement !== "all" && !profile.movementPlanes.some((item) => item.toLowerCase().includes(movement))) {
      return false;
    }
    return true;
  });
}

function summarizeExercises(exercises = []) {
  return {
    total: exercises.length,
    controlled: exercises.filter((item) => item.riskLevel === "controlled").length,
    moderate: exercises.filter((item) => item.riskLevel === "moderate").length,
    high: exercises.filter((item) => item.riskLevel === "high").length,
    phases: Array.from(new Set(exercises.flatMap((item) => item.phases))).sort(),
    footballDemands: Array.from(new Set(exercises.flatMap((item) => item.footballDemands))).sort(),
  };
}

function getExerciseSearchText(exercise = {}) {
  return [
    exercise.id,
    exercise.name,
    exercise.family,
    exercise.intent,
    exercise.tissueTypes || exercise.tissue_types,
    exercise.phases,
    exercise.movementPlanes || exercise.movement_planes,
    exercise.footballDemands || exercise.football_demands,
    exercise.equipment,
    exercise.riskLevel || exercise.risk_level,
    exercise.evidenceLevel || exercise.evidence_level,
    exercise.evidenceSummary || exercise.evidence_summary,
    exercise.consensusNote || exercise.consensus_note,
    exercise.bodyRegions || exercise.body_regions,
    exercise.symptomTags || exercise.symptom_tags,
    exercise.mechanismTags || exercise.mechanism_tags,
    exercise.positionDemands || exercise.position_demands,
    exercise.clinicalTags || exercise.clinical_tags,
    exercise.setup,
    exercise.execution,
    exercise.coachingCues || exercise.coaching_cues,
    exercise.qualityChecks || exercise.quality_checks,
    exercise.commonErrors || exercise.common_errors,
    exercise.programBuilder?.loadFocus || exercise.program_builder?.loadFocus,
    exercise.programBuilder?.gateCriteria || exercise.program_builder?.gateCriteria,
    exercise.programBuilder?.nextExposure || exercise.program_builder?.nextExposure,
    exercise.programBuilder?.holdRules || exercise.program_builder?.holdRules,
  ].flat().map((item) => normalizeText(item, 300).toLowerCase()).join(" ");
}

function filterExercises(exercises = [], query = {}) {
  const search = normalizeText(query.q || query.search, 180).toLowerCase();
  const phase = normalizeText(query.phase, 80).toLowerCase();
  const tissue = normalizeText(query.tissue || query.tissueType || query.tissue_type, 80).toLowerCase();
  const demand = normalizeText(query.demand || query.footballDemand || query.football_demand, 120).toLowerCase();
  const risk = normalizeText(query.risk || query.riskLevel || query.risk_level, 80).toLowerCase();
  return exercises.filter((exercise) => {
    if (search && !getExerciseSearchText(exercise).includes(search)) return false;
    if (phase && phase !== "all" && !normalizeArray(exercise.phases).some((item) => item.toLowerCase() === phase)) return false;
    if (tissue && tissue !== "all" && !normalizeArray(exercise.tissueTypes || exercise.tissue_types).some((item) => item.toLowerCase() === tissue)) return false;
    if (demand && demand !== "all" && !normalizeArray(exercise.footballDemands || exercise.football_demands).some((item) => item.toLowerCase().includes(demand))) return false;
    if (risk && risk !== "all" && normalizeText(exercise.riskLevel || exercise.risk_level, 80).toLowerCase() !== risk) return false;
    return true;
  });
}

function buildFallbackProfileListResponse(fallback, query = {}, reason = "") {
  const profiles = filterProfiles(fallback.profiles.map(profileListItem), query).slice(0, asLimit(query.limit));
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    view: "library-profiles",
    source: "module-fallback",
    sourceReason: reason,
    writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
    total: profiles.length,
    profiles,
    filterOptions: fallback.filterOptions,
  };
}

const PROFILE_LIST_SELECT = [
  "id",
  "profile_version",
  "status",
  "name",
  "system",
  "body_area",
  "family",
  "evidence_level",
  "summary",
  "evidence_summary",
  "experience_summary",
  "symptoms",
  "positions",
  "movement_planes",
  "risk_tags",
  "season",
  "sex",
  "level",
  "sort_order",
  "reviewed_at",
  "updated_at",
].join(",");

const PROFILE_DETAIL_SELECT = [
  PROFILE_LIST_SELECT,
  "content",
].join(",");

async function getDatabaseProfiles() {
  const result = await dbRequest(`/rtp_library_profiles?select=${encodeURIComponent(PROFILE_LIST_SELECT)}&status=eq.published&order=sort_order.asc,name.asc&limit=300`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, reason: result.reason || "RTP Library database is empty.", status: result.status };
  }
  return {
    ok: true,
    profiles: result.data.map((row) => profileListItem(row)),
  };
}

async function getDatabaseProfile(profileId = "") {
  const normalizedProfileId = normalizeId(profileId);
  if (!normalizedProfileId) {
    return { ok: false, reason: "profileId is required.", status: 400 };
  }
  const params = [
    `select=${encodeURIComponent(PROFILE_DETAIL_SELECT)}`,
    `id=eq.${encodeURIComponent(normalizedProfileId)}`,
    "status=eq.published",
    "limit=1",
  ].join("&");
  const result = await dbRequest(`/rtp_library_profiles?${params}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, reason: result.reason || "RTP Library profile was not found.", status: result.status };
  }
  return {
    ok: true,
    profile: profileDetail({ ...result.data[0].content, ...result.data[0] }),
  };
}

async function getDatabaseExercisesForProfile(profileId = "") {
  const normalizedProfileId = normalizeId(profileId);
  if (!normalizedProfileId) {
    return { ok: true, exercises: [] };
  }
  const mapping = await dbRequest(
    `/rtp_library_profile_exercises?select=profile_id,exercise_id,sort_order&profile_id=eq.${encodeURIComponent(normalizedProfileId)}&order=sort_order.asc`
  );
  if (!mapping.ok || !Array.isArray(mapping.data) || mapping.data.length === 0) {
    return { ok: false, exercises: [], reason: mapping.reason || "No mapped exercises." };
  }
  const ids = mapping.data.map((row) => normalizeId(row.exercise_id)).filter(Boolean);
  const exerciseResult = await dbRequest(
    `/rtp_library_exercises?select=*&id=in.(${ids.map(encodeURIComponent).join(",")})&status=eq.published`
  );
  if (!exerciseResult.ok || !Array.isArray(exerciseResult.data)) {
    return { ok: false, exercises: [], reason: exerciseResult.reason || "No exercises found." };
  }
  const byId = new Map(exerciseResult.data.map((row) => [normalizeId(row.id), exerciseItem({ ...row.content, ...row })]));
  return {
    ok: true,
    exercises: ids.map((id) => byId.get(id)).filter(Boolean),
  };
}

const EXERCISE_LIST_SELECT = [
  "id",
  "status",
  "name",
  "family",
  "intent",
  "tissue_types",
  "phases",
  "movement_planes",
  "football_demands",
  "equipment",
  "risk_level",
  "evidence_level",
  "body_regions",
  "mechanism_tags",
  "position_demands",
  "program_builder",
  "media_status",
  "thumbnail_storage_path",
  "thumbnail_url",
  "diagram_key",
  "sort_order",
].join(",");

async function getDatabaseExerciseCatalog(query = {}) {
  const result = await dbRequest(`/rtp_library_exercises?select=${encodeURIComponent(EXERCISE_LIST_SELECT)}&status=eq.published&order=sort_order.asc,name.asc&limit=${asLimit(query.limit, MAX_EXERCISE_LIMIT)}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, reason: result.reason || "RTP Exercise Bank database is empty.", status: result.status };
  }
  return {
    ok: true,
    exercises: filterExercises(result.data.map(exerciseListItem), query),
  };
}

async function getDatabaseExercise(exerciseId = "") {
  const normalizedExerciseId = normalizeId(exerciseId);
  if (!normalizedExerciseId) {
    return { ok: false, reason: "exerciseId is required.", status: 400 };
  }
  const result = await dbRequest(
    `/rtp_library_exercises?select=*&id=eq.${encodeURIComponent(normalizedExerciseId)}&status=eq.published&limit=1`
  );
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, reason: result.reason || "RTP exercise was not found.", status: result.status };
  }
  const media = await dbRequest(
    `/rtp_library_exercise_media?select=*&exercise_id=eq.${encodeURIComponent(normalizedExerciseId)}&status=eq.published&order=sort_order.asc`
  );
  const mediaItems = media.ok && Array.isArray(media.data)
    ? media.data.map((item) => ({
        id: normalizeText(item.id, 120),
        type: normalizeText(item.media_type, 40),
        title: normalizeText(item.title, 180),
        altText: normalizeText(item.alt_text, 240),
        storageBucket: normalizeText(item.storage_bucket, 160),
        storagePath: normalizeText(item.storage_path, 500),
        externalUrl: normalizeText(item.external_url, 500),
        posterStoragePath: normalizeText(item.poster_storage_path, 500),
        posterUrl: normalizeText(item.poster_url, 500),
        diagramKey: normalizeText(item.diagram_key, 160),
        mimeType: normalizeText(item.mime_type, 120),
        durationSeconds: Number.isFinite(Number(item.duration_seconds)) ? Number(item.duration_seconds) : null,
      }))
    : [];
  return {
    ok: true,
    exercise: exerciseItem({ ...result.data[0].content, ...result.data[0], media: mediaItems }),
  };
}

async function buildRtpLibraryProfilesResponse(actor = {}, query = {}) {
  if (!canReadRtpLibrary(actor)) {
    return {
      ok: false,
      status: 403,
      reason: "RTP Library is visible to Medical, Performance and platform administrators.",
    };
  }

  const database = await getDatabaseProfiles();
  if (database.ok) {
    const profiles = filterProfiles(database.profiles.map(profileListItem), query).slice(0, asLimit(query.limit));
    return {
      ok: true,
      schema: RTP_LIBRARY_SCHEMA,
      view: "library-profiles",
      source: "database",
      writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
      total: profiles.length,
      profiles,
    };
  }

  const fallback = await loadFallbackLibrary();
  return buildFallbackProfileListResponse(fallback, query, database.reason);
}

async function buildRtpLibraryProfileResponse(actor = {}, query = {}) {
  if (!canReadRtpLibrary(actor)) {
    return {
      ok: false,
      status: 403,
      reason: "RTP Library is visible to Medical, Performance and platform administrators.",
    };
  }

  const profileId = normalizeId(query.profileId || query.profile_id || query.id);
  if (!profileId) {
    return { ok: false, status: 400, reason: "profileId is required." };
  }

  const database = await getDatabaseProfile(profileId);
  if (database.ok) {
    const profile = database.profile;
    const exerciseResult = await getDatabaseExercisesForProfile(profileId);
    if (profile) {
      const exercises = exerciseResult.ok ? exerciseResult.exercises : [];
      return {
        ok: true,
        schema: RTP_LIBRARY_SCHEMA,
        view: "library-profile",
        source: "database",
        writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
        profile,
        exercises,
        exerciseSummary: summarizeExercises(exercises),
      };
    }
  }

  const fallback = await loadFallbackLibrary();
  const profile = profileDetail(fallback.getProfileById?.(profileId));
  if (!profile.id) {
    return { ok: false, status: 404, reason: "RTP Library profile was not found." };
  }
  const exercises = (fallback.getExercisesForProfile?.(profileId) || []).map(exerciseItem);
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    view: "library-profile",
    source: "module-fallback",
    sourceReason: database.reason,
    writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
    profile,
    exercises,
    exerciseSummary: summarizeExercises(exercises),
  };
}

async function buildRtpLibraryExercisesResponse(actor = {}, query = {}) {
  if (!canReadRtpLibrary(actor)) {
    return {
      ok: false,
      status: 403,
      reason: "RTP Library is visible to Medical, Performance and platform administrators.",
    };
  }

  const profileId = normalizeId(query.profileId || query.profile_id || query.id);
  const database = profileId ? await getDatabaseExercisesForProfile(profileId) : await getDatabaseExerciseCatalog(query);
  if (database.ok && database.exercises.length) {
    const exercises = filterExercises(database.exercises, query).slice(0, asLimit(query.limit, MAX_EXERCISE_LIMIT));
    return {
      ok: true,
      schema: RTP_LIBRARY_SCHEMA,
      view: "library-exercises",
      source: "database",
      writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
      profileId,
      total: exercises.length,
      exercises: exercises.map(exerciseListItem),
      exerciseSummary: summarizeExercises(exercises),
    };
  }

  const fallback = await loadFallbackLibrary();
  const exercises = filterExercises(
    (profileId ? fallback.getExercisesForProfile?.(profileId) : fallback.exercises || []).map(exerciseItem),
    query
  ).slice(0, asLimit(query.limit, MAX_EXERCISE_LIMIT));
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    view: "library-exercises",
    source: "module-fallback",
    sourceReason: database.reason || "RTP Library database is not populated.",
    writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
    profileId,
    total: exercises.length,
    exercises: exercises.map(exerciseListItem),
    exerciseSummary: summarizeExercises(exercises),
  };
}

async function buildRtpLibraryExerciseResponse(actor = {}, query = {}) {
  if (!canReadRtpLibrary(actor)) {
    return {
      ok: false,
      status: 403,
      reason: "RTP Library is visible to Medical, Performance and platform administrators.",
    };
  }

  const exerciseId = normalizeId(query.exerciseId || query.exercise_id || query.id);
  if (!exerciseId) {
    return { ok: false, status: 400, reason: "exerciseId is required." };
  }

  const database = await getDatabaseExercise(exerciseId);
  if (database.ok) {
    return {
      ok: true,
      schema: RTP_LIBRARY_SCHEMA,
      view: "library-exercise",
      source: "database",
      writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
      exercise: database.exercise,
    };
  }

  const fallback = await loadFallbackLibrary();
  const exercise = exerciseItem((fallback.exercises || []).find((item) => normalizeId(item.id) === exerciseId));
  if (!exercise.id) {
    return { ok: false, status: 404, reason: "RTP exercise was not found." };
  }
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    view: "library-exercise",
    source: "module-fallback",
    sourceReason: database.reason,
    writesEnabled: RTP_LIBRARY_WRITES_ENABLED,
    exercise,
  };
}

async function buildRtpLibraryReadResponse(actor = {}, query = {}) {
  const view = normalizeId(query.view, 80);
  if (view === "library" || view === "library-profiles" || view === "rtp-library") {
    return buildRtpLibraryProfilesResponse(actor, query);
  }
  if (view === "library-profile" || view === "rtp-library-profile") {
    return buildRtpLibraryProfileResponse(actor, query);
  }
  if (view === "library-exercises" || view === "rtp-library-exercises") {
    return buildRtpLibraryExercisesResponse(actor, query);
  }
  if (view === "library-exercise" || view === "rtp-library-exercise") {
    return buildRtpLibraryExerciseResponse(actor, query);
  }
  return null;
}

module.exports = {
  RTP_LIBRARY_SCHEMA,
  RTP_LIBRARY_WRITES_ENABLED,
  buildRtpLibraryExerciseResponse,
  buildRtpLibraryExercisesResponse,
  buildRtpLibraryProfileResponse,
  buildRtpLibraryProfilesResponse,
  buildRtpLibraryReadResponse,
  canReadRtpLibrary,
};
