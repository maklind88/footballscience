#!/usr/bin/env node

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const DEFAULT_REEP_PEOPLE_URL = "https://raw.githubusercontent.com/withqwerty/reep/main/data/people.csv";
const DEFAULT_BATCH_SIZE = 250;
const SOURCE_SYSTEM = "reep";

function envValue(primary, alternatives = []) {
  for (const key of [primary, ...alternatives]) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readConfig() {
  const projectRef = envValue("SUPABASE_PROJECT_REF", ["SUPABASE_PROJECT_ID"]);
  const urlByRef = projectRef ? `https://${projectRef}.supabase.co` : "";
  return {
    url: envValue("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]) || urlByRef,
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY", ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE"]),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceUrl: DEFAULT_REEP_PEOPLE_URL,
    batchSize: DEFAULT_BATCH_SIZE,
    limit: 0,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--source-url") {
      options.sourceUrl = argv[index + 1] || options.sourceUrl;
      index += 1;
    } else if (arg === "--batch-size") {
      options.batchSize = Math.max(1, Math.min(500, Number(argv[index + 1]) || DEFAULT_BATCH_SIZE));
      index += 1;
    } else if (arg === "--limit") {
      options.limit = Math.max(0, Number(argv[index + 1]) || 0);
      index += 1;
    }
  }

  return options;
}

function parseCsvLine(line = "") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeIdentityText(value = "", maxLength = 240) {
  return normalizeText(value, maxLength)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeSourceSystem(value = "") {
  return normalizeText(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function normalizeNumber(value, fallback = null) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function getNameTokens(value = "") {
  return normalizeText(value, 240).split(/\s+/).filter(Boolean);
}

function isNameInitialToken(token = "") {
  return /^[A-Za-z]$/.test(String(token || "").replace(/\./g, ""));
}

function isInitialOnlyName(value = "") {
  const raw = normalizeText(value, 240);
  if (!raw) return false;
  if (/^(?:[A-Za-z]\.\s*){1,4}\S+/.test(raw)) return true;
  const tokens = getNameTokens(raw.replace(/\./g, " "));
  if (tokens.length < 2) return false;
  return tokens.slice(0, -1).every(isNameInitialToken);
}

function isUsableFullName(value = "") {
  const tokens = getNameTokens(value);
  return tokens.length >= 2 && !isInitialOnlyName(value) && tokens.some((token) => token.replace(/[^A-Za-z]/g, "").length > 1);
}

function fsdbIdFromReepId(reepId = "") {
  const hash = crypto.createHash("sha1").update(reepId || `${Date.now()}-${Math.random()}`).digest("hex").slice(0, 16);
  return `fsdb_p${hash}`;
}

function positionGroupFromPosition(position = "") {
  const normalized = normalizeText(position, 120).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("goalkeeper")) return "GK";
  if (normalized.includes("back") || normalized.includes("defender")) return "DEF";
  if (normalized.includes("midfield")) return "MID";
  if (normalized.includes("winger")) return "WING";
  if (normalized.includes("forward") || normalized.includes("striker")) return "FW";
  return "";
}

function sourceLinksFromRow(row = {}) {
  const links = [];
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("key_")) continue;
    const sourceEntityId = normalizeText(value, 180);
    if (!sourceEntityId) continue;
    links.push({
      source_system: normalizeSourceSystem(key.replace(/^key_/, "")),
      source_entity_id: sourceEntityId,
      confidence: key === "key_wikidata" ? 90 : 100,
      verified_status: "linked",
      metadata: { importedFrom: SOURCE_SYSTEM },
    });
  }
  return links;
}

function playerFromReepRow(row = {}) {
  if (normalizeText(row.type, 20) !== "player") {
    return null;
  }
  const reepId = normalizeText(row.reep_id, 80);
  const canonicalName = normalizeText(row.name, 180);
  if (!reepId || !canonicalName) {
    return null;
  }
  const sourceLinks = sourceLinksFromRow(row);
  const hasSoccerdonna = sourceLinks.some((link) => link.source_system === "soccerdonna");
  const dateOfBirth = normalizeText(row.date_of_birth, 40);
  const birthYear = /^\d{4}/.test(dateOfBirth) ? Number(dateOfBirth.slice(0, 4)) : null;

  return {
    fsdb_id: fsdbIdFromReepId(reepId),
    canonical_name: canonicalName,
    full_name: normalizeText(row.full_name, 240) || null,
    sort_name: canonicalName.toLowerCase(),
    display_name: canonicalName,
    date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth : null,
    birth_year: birthYear,
    gender_segment: hasSoccerdonna ? "women" : "unknown",
    nationality: normalizeText(row.nationality, 120) || null,
    primary_position: normalizeText(row.position, 80) || null,
    position_group: positionGroupFromPosition(row.position) || null,
    position_detail: normalizeText(row.position_detail, 160) || null,
    height_cm: normalizeNumber(row.height_cm, null),
    source_priority: SOURCE_SYSTEM,
    source_confidence: 90,
    identity_status: "linked",
    active_status: "unknown",
    metadata: {
      reepId,
      source: SOURCE_SYSTEM,
      sourceLinkCount: sourceLinks.length,
      importedGenderInference: hasSoccerdonna ? "soccerdonna-link" : "unknown",
    },
    sourceLinks,
  };
}

function getBestDryRunName(player = {}) {
  return normalizeText(player.full_name, 240) || normalizeText(player.canonical_name, 180) || normalizeText(player.display_name, 180);
}

function buildDryRunDedupeKey(player = {}) {
  const name = getBestDryRunName(player);
  const dateOfBirth = normalizeText(player.date_of_birth, 40);
  const nationality = normalizeText(player.nationality, 120);
  const gender = normalizeText(player.gender_segment, 20) || "unknown";
  if (!isUsableFullName(name) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !nationality) {
    return "";
  }
  return [
    `name:${normalizeIdentityText(name)}`,
    `dob:${dateOfBirth}`,
    `country:${normalizeIdentityText(nationality, 120)}`,
    `gender:${gender}`,
  ].join("|");
}

function pct(part, total) {
  return total ? Math.round((Math.max(0, part) / total) * 100) : 0;
}

function samplePlayer(player = {}) {
  return {
    fsdbId: normalizeText(player.fsdb_id, 80),
    name: getBestDryRunName(player),
    team: normalizeText(player.current_team_name, 180),
    nationality: normalizeText(player.nationality, 120),
    genderSegment: normalizeText(player.gender_segment, 20) || "unknown",
    dateOfBirth: normalizeText(player.date_of_birth, 40),
    sourceLinks: Array.isArray(player.sourceLinks) ? player.sourceLinks.length : 0,
  };
}

function buildDryRunReport(players = []) {
  const fsdbIds = new Map();
  const dedupeKeys = new Map();
  const sourceSystems = new Map();
  const report = {
    players: players.length,
    womenTagged: 0,
    menTagged: 0,
    unknownGender: 0,
    fullNames: 0,
    initialNames: 0,
    birthDateKnown: 0,
    nationalityKnown: 0,
    positionKnown: 0,
    sourceLinkedPlayers: 0,
    sourceLinks: 0,
    dedupeReady: 0,
    duplicateFsdbIds: 0,
    duplicateStrongDedupeKeys: 0,
    sourceSystems: {},
    coverage: {},
    review: {
      initialNames: [],
      weakIdentity: [],
      duplicateCandidates: [],
    },
  };

  players.forEach((player) => {
    const gender = normalizeText(player.gender_segment, 20);
    if (gender === "women") report.womenTagged += 1;
    else if (gender === "men") report.menTagged += 1;
    else report.unknownGender += 1;

    const name = getBestDryRunName(player);
    if (isUsableFullName(name)) report.fullNames += 1;
    if (isInitialOnlyName(name)) {
      report.initialNames += 1;
      if (report.review.initialNames.length < 8) report.review.initialNames.push(samplePlayer(player));
    }
    if (normalizeText(player.date_of_birth, 40)) report.birthDateKnown += 1;
    if (normalizeText(player.nationality, 120)) report.nationalityKnown += 1;
    if (normalizeText(player.position_group || player.primary_position, 120)) report.positionKnown += 1;

    const sourceLinks = Array.isArray(player.sourceLinks) ? player.sourceLinks : [];
    if (sourceLinks.length) report.sourceLinkedPlayers += 1;
    report.sourceLinks += sourceLinks.length;
    sourceLinks.forEach((link) => {
      const source = normalizeSourceSystem(link.source_system);
      if (source) sourceSystems.set(source, (sourceSystems.get(source) || 0) + 1);
    });

    const fsdbId = normalizeText(player.fsdb_id, 80);
    if (fsdbId) fsdbIds.set(fsdbId, (fsdbIds.get(fsdbId) || 0) + 1);

    const dedupeKey = buildDryRunDedupeKey(player);
    if (dedupeKey) {
      report.dedupeReady += 1;
      const entries = dedupeKeys.get(dedupeKey) || [];
      entries.push(player);
      dedupeKeys.set(dedupeKey, entries);
    } else if (report.review.weakIdentity.length < 8) {
      report.review.weakIdentity.push(samplePlayer(player));
    }
  });

  report.duplicateFsdbIds = [...fsdbIds.values()].filter((count) => count > 1).length;
  const duplicateDedupeGroups = [...dedupeKeys.entries()].filter(([, entries]) => entries.length > 1);
  report.duplicateStrongDedupeKeys = duplicateDedupeGroups.length;
  report.review.duplicateCandidates = duplicateDedupeGroups.slice(0, 8).map(([key, entries]) => ({
    key,
    count: entries.length,
    players: entries.slice(0, 4).map(samplePlayer),
  }));
  report.sourceSystems = Object.fromEntries([...sourceSystems.entries()].sort((a, b) => b[1] - a[1]));
  report.coverage = {
    fullNamePct: pct(report.fullNames, report.players),
    dedupeReadyPct: pct(report.dedupeReady, report.players),
    birthDatePct: pct(report.birthDateKnown, report.players),
    nationalityPct: pct(report.nationalityKnown, report.players),
    positionPct: pct(report.positionKnown, report.players),
    sourceLinkedPct: pct(report.sourceLinkedPlayers, report.players),
  };
  return report;
}

function formatDryRunReport(report = {}) {
  const sourceSystemSummary = Object.entries(report.sourceSystems || {})
    .slice(0, 6)
    .map(([source, count]) => `${source}:${count}`)
    .join(" ");
  return [
    `[fsdb:reep] dry run: womenTagged=${report.womenTagged || 0} menTagged=${report.menTagged || 0} unknownGender=${report.unknownGender || 0}`,
    `[fsdb:reep] dry run quality: fullNames=${report.fullNames || 0} initialNames=${report.initialNames || 0} dedupeReady=${report.dedupeReady || 0} duplicateFsdbIds=${report.duplicateFsdbIds || 0} duplicateStrongKeys=${report.duplicateStrongDedupeKeys || 0}`,
    `[fsdb:reep] dry run coverage: birthDate=${report.coverage?.birthDatePct || 0}% nationality=${report.coverage?.nationalityPct || 0}% position=${report.coverage?.positionPct || 0}% sourceLinked=${report.coverage?.sourceLinkedPct || 0}% sourceLinks=${report.sourceLinks || 0}`,
    sourceSystemSummary ? `[fsdb:reep] dry run sources: ${sourceSystemSummary}` : "",
  ].filter(Boolean);
}

async function readReepPlayers(sourceUrl, limit = 0) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Could not download Reep people CSV (${response.status}).`);
  }
  const csv = await response.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() || "").map((header) => normalizeText(header, 120));
  const players = [];

  for (const line of lines) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const player = playerFromReepRow(row);
    if (!player) continue;
    players.push(player);
    if (limit > 0 && players.length >= limit) {
      break;
    }
  }

  return players;
}

async function restRequest(path, options = {}) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  const response = await fetch(`${config.url}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Supabase request failed (${response.status}).`);
  }
  return payload;
}

async function createImportBatch(options, rowCount) {
  const [batch] = await restRequest("/fsdb_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      source_system: SOURCE_SYSTEM,
      source_label: "Reep football identity register",
      source_url: options.sourceUrl,
      source_license: "CC0-1.0",
      entity_scope: "players",
      status: "running",
      row_count: rowCount,
      started_at: new Date().toISOString(),
      metadata: {
        importer: "scripts/import-football-science-db-reep.mjs",
        limit: options.limit || null,
      },
    },
  });
  return batch?.id || "";
}

async function finishImportBatch(batchId, status, counts = {}) {
  if (!batchId) return;
  await restRequest(`/fsdb_import_batches?id=eq.${encodeURIComponent(batchId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      status,
      player_count: counts.playerCount || 0,
      error_count: counts.errorCount || 0,
      finished_at: new Date().toISOString(),
      published_at: status === "published" ? new Date().toISOString() : null,
    },
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sourceLinksForChunk(records, insertedPlayers) {
  const idByFsdbId = new Map(insertedPlayers.map((player) => [player.fsdb_id, player.id]));
  return records.flatMap((record) => {
    const playerId = idByFsdbId.get(record.fsdb_id);
    if (!playerId) return [];
    return record.sourceLinks.map((link) => ({
      ...link,
      player_id: playerId,
    }));
  });
}

async function importPlayers(players, options) {
  let imported = 0;
  let sourceLinks = 0;
  const chunks = chunkArray(players, options.batchSize);

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const playerRows = chunk.map(({ sourceLinks: _sourceLinks, ...player }) => player);
    const insertedPlayers = await restRequest("/fsdb_players?on_conflict=fsdb_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: playerRows,
    });

    const linkRows = sourceLinksForChunk(chunk, Array.isArray(insertedPlayers) ? insertedPlayers : []);
    if (linkRows.length) {
      await restRequest("/fsdb_player_source_links?on_conflict=source_system,source_entity_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: linkRows,
      });
    }

    imported += playerRows.length;
    sourceLinks += linkRows.length;
    console.log(`[fsdb:reep] chunk ${chunkIndex + 1}/${chunks.length}: players=${imported} sourceLinks=${sourceLinks}`);
  }

  return { imported, sourceLinks };
}

async function main() {
  const options = parseArgs();
  const players = await readReepPlayers(options.sourceUrl, options.limit);
  console.log(`[fsdb:reep] prepared players=${players.length} dryRun=${options.dryRun ? "yes" : "no"}`);

  if (options.dryRun) {
    const report = buildDryRunReport(players);
    formatDryRunReport(report).forEach((line) => console.log(line));
    return;
  }

  let batchId = "";
  try {
    batchId = await createImportBatch(options, players.length);
    const counts = await importPlayers(players, options);
    await finishImportBatch(batchId, "published", { playerCount: counts.imported });
    console.log(`[fsdb:reep] finished batch=${batchId} players=${counts.imported} sourceLinks=${counts.sourceLinks}`);
  } catch (error) {
    await finishImportBatch(batchId, "failed", { errorCount: 1 });
    throw error;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(`[fsdb:reep] ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  buildDryRunDedupeKey,
  buildDryRunReport,
  formatDryRunReport,
  isInitialOnlyName,
  isUsableFullName,
  playerFromReepRow,
};
