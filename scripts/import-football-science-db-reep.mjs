#!/usr/bin/env node

import crypto from "node:crypto";

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
    const womenTagged = players.filter((player) => player.gender_segment === "women").length;
    console.log(`[fsdb:reep] dry run: womenTagged=${womenTagged} unknownGender=${players.length - womenTagged}`);
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

main().catch((error) => {
  console.error(`[fsdb:reep] ${error.message}`);
  process.exitCode = 1;
});
