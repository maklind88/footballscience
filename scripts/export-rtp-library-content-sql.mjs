import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { medicalRtpExerciseBank, medicalRtpExerciseProfileCoverageMap } from "../src/modules/medical/medical-rtp-exercise-bank-data.mjs";
import { medicalRtpLibraryProfiles } from "../src/modules/medical/medical-rtp-library-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function normalizeText(value = "", maxLength = 10000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeId(value = "") {
  return normalizeText(value, 160).toLowerCase();
}

function normalizeArray(value = []) {
  return (Array.isArray(value) ? value : [value]).map((item) => normalizeText(item, 400)).filter(Boolean);
}

function sqlText(value = "") {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlNullableText(value = "") {
  const normalized = normalizeText(value, 400);
  return normalized ? sqlText(normalized) : "null";
}

function sqlTextArray(value = []) {
  const items = normalizeArray(value);
  if (!items.length) {
    return "'{}'::text[]";
  }
  return `array[${items.map(sqlText).join(", ")}]::text[]`;
}

function stableJson(value) {
  return JSON.stringify(value, (_key, item) => (item === undefined ? null : item));
}

function sqlJsonb(value) {
  return `${sqlText(stableJson(value || {}))}::jsonb`;
}

function hashContent(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function profileRow(profile = {}, sortOrder = 1000) {
  const id = normalizeId(profile.id);
  const content = { ...profile };
  return [
    sqlText(id),
    "1",
    "'published'",
    sqlText(normalizeText(profile.name, 240)),
    sqlText(normalizeText(profile.system, 120)),
    sqlText(normalizeText(profile.bodyArea, 160)),
    sqlText(normalizeText(profile.family, 120)),
    sqlText(normalizeText(profile.evidenceLevel, 160)),
    sqlText(normalizeText(profile.summary, 2000)),
    sqlText(normalizeText(profile.evidence, 2000)),
    sqlText(normalizeText(profile.experience, 2000)),
    sqlTextArray(profile.symptoms),
    sqlTextArray(profile.positions),
    sqlTextArray(profile.movementPlanes),
    sqlTextArray(profile.riskTags),
    sqlTextArray(profile.season),
    sqlTextArray(profile.sex),
    sqlTextArray(profile.level),
    sqlJsonb(content),
    sqlText(hashContent(content)),
    String(sortOrder),
    sqlNullableText(profile.researchAuditReviewedAt),
    "now()",
  ];
}

function exerciseRow(exercise = {}, sortOrder = 1000) {
  const id = normalizeId(exercise.id);
  const content = { ...exercise };
  return [
    sqlText(id),
    "'published'",
    sqlText(normalizeText(exercise.name, 240)),
    sqlText(normalizeText(exercise.family, 120)),
    sqlText(normalizeText(exercise.intent, 1200)),
    sqlTextArray(exercise.tissueTypes),
    sqlTextArray(exercise.phases),
    sqlTextArray(exercise.movementPlanes),
    sqlTextArray(exercise.footballDemands),
    sqlTextArray(exercise.equipment),
    sqlText(normalizeText(exercise.riskLevel || "controlled", 80)),
    sqlText(normalizeText(exercise.evidenceLevel, 160)),
    sqlText(normalizeText(exercise.evidenceSummary, 2000)),
    sqlText(normalizeText(exercise.consensusNote, 2000)),
    sqlText(normalizeText(exercise.dosage, 1200)),
    sqlText(normalizeText(exercise.progression, 1200)),
    sqlText(normalizeText(exercise.regression, 1200)),
    sqlTextArray(exercise.holdRules),
    sqlText(normalizeText(exercise.medicalNotes, 2000)),
    sqlText(normalizeText(exercise.performanceNotes, 2000)),
    sqlText(normalizeText(exercise.coachSafeLabel || "Exercise starter", 240)),
    sqlTextArray(exercise.evidenceRefs),
    sqlJsonb(content),
    String(sortOrder),
  ];
}

function buildProfileExerciseMappings() {
  const profileIds = new Set(medicalRtpLibraryProfiles.map((profile) => normalizeId(profile.id)));
  const exerciseIds = new Set(medicalRtpExerciseBank.map((exercise) => normalizeId(exercise.id)));
  const mapped = new Map();

  for (const [profileId, exerciseList] of medicalRtpExerciseProfileCoverageMap.entries()) {
    const normalizedProfileId = normalizeId(profileId);
    if (!profileIds.has(normalizedProfileId)) continue;
    normalizeArray(exerciseList).forEach((exerciseId, index) => {
      const normalizedExerciseId = normalizeId(exerciseId);
      if (!exerciseIds.has(normalizedExerciseId)) return;
      mapped.set(`${normalizedProfileId}:${normalizedExerciseId}`, {
        profileId: normalizedProfileId,
        exerciseId: normalizedExerciseId,
        sortOrder: index + 1,
      });
    });
  }

  for (const exercise of medicalRtpExerciseBank) {
    const exerciseId = normalizeId(exercise.id);
    for (const profileId of normalizeArray(exercise.linkedProfiles)) {
      const normalizedProfileId = normalizeId(profileId);
      if (!profileIds.has(normalizedProfileId) || !exerciseIds.has(exerciseId)) continue;
      const key = `${normalizedProfileId}:${exerciseId}`;
      if (!mapped.has(key)) {
        mapped.set(key, {
          profileId: normalizedProfileId,
          exerciseId,
          sortOrder: 1000 + Number(exercise.priority || 3),
        });
      }
    }
  }

  return Array.from(mapped.values()).sort((first, second) =>
    first.profileId.localeCompare(second.profileId)
    || first.sortOrder - second.sortOrder
    || first.exerciseId.localeCompare(second.exerciseId)
  );
}

function valuesBlock(rows) {
  return rows.map((row) => `  (${row.join(", ")})`).join(",\n");
}

function buildSql() {
  const profiles = medicalRtpLibraryProfiles.map((profile, index) => profileRow(profile, index + 1));
  const exercises = medicalRtpExerciseBank.map((exercise, index) => exerciseRow(exercise, index + 1));
  const mappings = buildProfileExerciseMappings();
  const profileIds = medicalRtpLibraryProfiles.map((profile) => normalizeId(profile.id));

  return `-- Generated from Medical RTP Library module data.\n-- Club-neutral knowledge only. No player medical data is included.\n\nbegin;\n\ninsert into public.rtp_library_profiles\n  (id, profile_version, status, name, system, body_area, family, evidence_level, summary, evidence_summary, experience_summary, symptoms, positions, movement_planes, risk_tags, season, sex, level, content, source_profile_hash, sort_order, reviewed_at, published_at)\nvalues\n${valuesBlock(profiles)}\non conflict (id) do update set\n  profile_version = excluded.profile_version,\n  status = excluded.status,\n  name = excluded.name,\n  system = excluded.system,\n  body_area = excluded.body_area,\n  family = excluded.family,\n  evidence_level = excluded.evidence_level,\n  summary = excluded.summary,\n  evidence_summary = excluded.evidence_summary,\n  experience_summary = excluded.experience_summary,\n  symptoms = excluded.symptoms,\n  positions = excluded.positions,\n  movement_planes = excluded.movement_planes,\n  risk_tags = excluded.risk_tags,\n  season = excluded.season,\n  sex = excluded.sex,\n  level = excluded.level,\n  content = excluded.content,\n  source_profile_hash = excluded.source_profile_hash,\n  sort_order = excluded.sort_order,\n  reviewed_at = excluded.reviewed_at,\n  published_at = coalesce(public.rtp_library_profiles.published_at, excluded.published_at),\n  updated_at = now();\n\ninsert into public.rtp_library_exercises\n  (id, status, name, family, intent, tissue_types, phases, movement_planes, football_demands, equipment, risk_level, evidence_level, evidence_summary, consensus_note, dosage, progression, regression, hold_rules, medical_notes, performance_notes, coach_safe_label, evidence_refs, content, sort_order)\nvalues\n${valuesBlock(exercises)}\non conflict (id) do update set\n  status = excluded.status,\n  name = excluded.name,\n  family = excluded.family,\n  intent = excluded.intent,\n  tissue_types = excluded.tissue_types,\n  phases = excluded.phases,\n  movement_planes = excluded.movement_planes,\n  football_demands = excluded.football_demands,\n  equipment = excluded.equipment,\n  risk_level = excluded.risk_level,\n  evidence_level = excluded.evidence_level,\n  evidence_summary = excluded.evidence_summary,\n  consensus_note = excluded.consensus_note,\n  dosage = excluded.dosage,\n  progression = excluded.progression,\n  regression = excluded.regression,\n  hold_rules = excluded.hold_rules,\n  medical_notes = excluded.medical_notes,\n  performance_notes = excluded.performance_notes,\n  coach_safe_label = excluded.coach_safe_label,\n  evidence_refs = excluded.evidence_refs,\n  content = excluded.content,\n  sort_order = excluded.sort_order,\n  updated_at = now();\n\ndelete from public.rtp_library_profile_exercises\nwhere profile_id = any(${sqlTextArray(profileIds)});\n\ninsert into public.rtp_library_profile_exercises\n  (profile_id, exercise_id, sort_order)\nvalues\n${valuesBlock(mappings.map((mapping) => [sqlText(mapping.profileId), sqlText(mapping.exerciseId), String(mapping.sortOrder)]))}\non conflict (profile_id, exercise_id) do update set\n  sort_order = excluded.sort_order;\n\ncommit;\n`;
}

function profileUpsertSql(rows) {
  return `-- RTP Library profile import chunk.\n-- Club-neutral knowledge only. No player medical data is included.\n\nbegin;\n\ninsert into public.rtp_library_profiles\n  (id, profile_version, status, name, system, body_area, family, evidence_level, summary, evidence_summary, experience_summary, symptoms, positions, movement_planes, risk_tags, season, sex, level, content, source_profile_hash, sort_order, reviewed_at, published_at)\nvalues\n${valuesBlock(rows)}\non conflict (id) do update set\n  profile_version = excluded.profile_version,\n  status = excluded.status,\n  name = excluded.name,\n  system = excluded.system,\n  body_area = excluded.body_area,\n  family = excluded.family,\n  evidence_level = excluded.evidence_level,\n  summary = excluded.summary,\n  evidence_summary = excluded.evidence_summary,\n  experience_summary = excluded.experience_summary,\n  symptoms = excluded.symptoms,\n  positions = excluded.positions,\n  movement_planes = excluded.movement_planes,\n  risk_tags = excluded.risk_tags,\n  season = excluded.season,\n  sex = excluded.sex,\n  level = excluded.level,\n  content = excluded.content,\n  source_profile_hash = excluded.source_profile_hash,\n  sort_order = excluded.sort_order,\n  reviewed_at = excluded.reviewed_at,\n  published_at = coalesce(public.rtp_library_profiles.published_at, excluded.published_at),\n  updated_at = now();\n\ncommit;\n`;
}

function exerciseUpsertSql(rows) {
  return `-- RTP Library exercise import chunk.\n-- Club-neutral knowledge only. No player medical data is included.\n\nbegin;\n\ninsert into public.rtp_library_exercises\n  (id, status, name, family, intent, tissue_types, phases, movement_planes, football_demands, equipment, risk_level, evidence_level, evidence_summary, consensus_note, dosage, progression, regression, hold_rules, medical_notes, performance_notes, coach_safe_label, evidence_refs, content, sort_order)\nvalues\n${valuesBlock(rows)}\non conflict (id) do update set\n  status = excluded.status,\n  name = excluded.name,\n  family = excluded.family,\n  intent = excluded.intent,\n  tissue_types = excluded.tissue_types,\n  phases = excluded.phases,\n  movement_planes = excluded.movement_planes,\n  football_demands = excluded.football_demands,\n  equipment = excluded.equipment,\n  risk_level = excluded.risk_level,\n  evidence_level = excluded.evidence_level,\n  evidence_summary = excluded.evidence_summary,\n  consensus_note = excluded.consensus_note,\n  dosage = excluded.dosage,\n  progression = excluded.progression,\n  regression = excluded.regression,\n  hold_rules = excluded.hold_rules,\n  medical_notes = excluded.medical_notes,\n  performance_notes = excluded.performance_notes,\n  coach_safe_label = excluded.coach_safe_label,\n  evidence_refs = excluded.evidence_refs,\n  content = excluded.content,\n  sort_order = excluded.sort_order,\n  updated_at = now();\n\ncommit;\n`;
}

function mappingUpsertSql(rows, profileIds, resetMappings = false) {
  const resetSql = resetMappings
    ? `\ndelete from public.rtp_library_profile_exercises\nwhere profile_id = any(${sqlTextArray(profileIds)});\n`
    : "";
  return `-- RTP Library profile-exercise mapping import chunk.\n-- Club-neutral knowledge only. No player medical data is included.\n\nbegin;\n${resetSql}\ninsert into public.rtp_library_profile_exercises\n  (profile_id, exercise_id, sort_order)\nvalues\n${valuesBlock(rows)}\non conflict (profile_id, exercise_id) do update set\n  sort_order = excluded.sort_order;\n\ncommit;\n`;
}

function chunkItems(items = [], size = 25) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function numbered(value) {
  return String(value).padStart(3, "0");
}

function writeChunkedSql(outDir) {
  const targetDir = path.resolve(projectRoot, outDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const profiles = medicalRtpLibraryProfiles.map((profile, index) => profileRow(profile, index + 1));
  const exercises = medicalRtpExerciseBank.map((exercise, index) => exerciseRow(exercise, index + 1));
  const profileIds = medicalRtpLibraryProfiles.map((profile) => normalizeId(profile.id));
  const mappings = buildProfileExerciseMappings().map((mapping) => [
    sqlText(mapping.profileId),
    sqlText(mapping.exerciseId),
    String(mapping.sortOrder),
  ]);
  const files = [];
  let fileIndex = 1;
  const writeFile = (label, sql) => {
    const fileName = `${numbered(fileIndex)}_${label}.sql`;
    fileIndex += 1;
    fs.writeFileSync(path.join(targetDir, fileName), sql);
    files.push(fileName);
  };

  chunkItems(profiles, 5).forEach((rows, index) => writeFile(`profiles_${numbered(index + 1)}`, profileUpsertSql(rows)));
  chunkItems(exercises, 20).forEach((rows, index) => writeFile(`exercises_${numbered(index + 1)}`, exerciseUpsertSql(rows)));
  chunkItems(mappings, 200).forEach((rows, index) => writeFile(
    `profile_exercises_${numbered(index + 1)}`,
    mappingUpsertSql(rows, profileIds, index === 0)
  ));

  const manifest = {
    generatedFrom: "src/modules/medical RTP Library module data",
    profiles: medicalRtpLibraryProfiles.length,
    exercises: medicalRtpExerciseBank.length,
    mappings: mappings.length,
    files,
  };
  fs.writeFileSync(path.join(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, outDir: targetDir };
}

function parseArgs(argv = []) {
  const args = { out: "", outDir: "", check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") args.check = true;
    if (arg === "--out") {
      args.out = argv[index + 1] || "";
      index += 1;
    }
    if (arg === "--out-dir") {
      args.outDir = argv[index + 1] || "";
      index += 1;
    }
  }
  return args;
}

function validateSource() {
  const profileIds = new Set(medicalRtpLibraryProfiles.map((profile) => normalizeId(profile.id)));
  const exerciseIds = new Set(medicalRtpExerciseBank.map((exercise) => normalizeId(exercise.id)));
  const mappings = buildProfileExerciseMappings();

  if (medicalRtpLibraryProfiles.length !== 200) {
    throw new Error(`Expected 200 RTP profiles, found ${medicalRtpLibraryProfiles.length}.`);
  }
  if (medicalRtpExerciseBank.length !== 72) {
    throw new Error(`Expected 72 RTP exercises, found ${medicalRtpExerciseBank.length}.`);
  }
  if (profileIds.size !== medicalRtpLibraryProfiles.length) {
    throw new Error("RTP profile IDs must be unique.");
  }
  if (exerciseIds.size !== medicalRtpExerciseBank.length) {
    throw new Error("RTP exercise IDs must be unique.");
  }
  if (mappings.length < 1600) {
    throw new Error(`Expected at least 1600 profile-exercise mappings, found ${mappings.length}.`);
  }

  return { profiles: medicalRtpLibraryProfiles.length, exercises: medicalRtpExerciseBank.length, mappings: mappings.length };
}

const args = parseArgs(process.argv.slice(2));
const summary = validateSource();

if (args.check) {
  console.log(JSON.stringify(summary));
  process.exit(0);
}

if (args.outDir) {
  console.log(JSON.stringify(writeChunkedSql(args.outDir)));
  process.exit(0);
}

const sql = buildSql();
if (args.out) {
  const outPath = path.resolve(projectRoot, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sql);
  console.log(JSON.stringify({ ...summary, outPath }));
} else {
  process.stdout.write(sql);
}
