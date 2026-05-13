const { parseJsonBody, readConfig, sendJson } = require("./supabase-admin.js");

const SQUAD_AGE_SCHEMA = "footballscience-squad-age-hydration-v1";
const MAX_AGE_CANDIDATES = 120;
const MAX_TEXT_LENGTH = 180;

function normalizeText(value = "", maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeSortName(value = "") {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSlug(value = "") {
  return normalizeSortName(value).replace(/\s+/g, "-").slice(0, 120);
}

function normalizeDateValue(value = "") {
  const raw = normalizeText(value, 40);
  if (!raw) {
    return "";
  }
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!iso) {
    return "";
  }
  const date = `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? "" : date;
}

function normalizeAgeValue(value = "") {
  const number = Number(String(value ?? "").trim());
  if (!Number.isFinite(number)) {
    return "";
  }
  const age = Math.floor(number);
  return age >= 0 && age <= 99 ? String(age) : "";
}

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function uniqueValues(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function postgrestInList(values = []) {
  return `(${uniqueValues(values).map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

function normalizeAgeCandidate(player = {}) {
  const name = normalizeText(player.name || player.displayName || player.display_name);
  if (!name) {
    return null;
  }
  return {
    profileId: normalizeText(player.profileId || player.id, 160),
    name,
    sortName: normalizeSortName(player.sortName || player.sort_name || name),
    number: normalizeText(player.number || player.shirtNumber || player.shirt_number, 20),
    position: normalizeText(player.position || player.positionLabel || player.position_label, 80),
  };
}

function normalizeAgeCandidates(players = []) {
  const seen = new Set();
  return (Array.isArray(players) ? players : [])
    .map(normalizeAgeCandidate)
    .filter(Boolean)
    .filter((candidate) => {
      const key = candidate.profileId || `${candidate.sortName}:${candidate.number}`;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_AGE_CANDIDATES);
}

async function fetchSupabaseRest(path, searchParams = {}) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    const error = new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    error.status = 500;
    throw error;
  }
  const requestUrl = new URL(`${url}/rest/v1/${path}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      requestUrl.searchParams.set(key, String(value));
    }
  });
  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let payload = [];
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = [];
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `Supabase REST request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

async function fetchActorMembershipScopes(actor = {}) {
  if (!isUuid(actor.id)) {
    return [];
  }
  return fetchSupabaseRest("squad_staff_memberships", {
    select: "organization_id,club_id,team_id,scope,status",
    user_id: `eq.${actor.id}`,
    status: "eq.active",
    limit: "50",
  }).catch(() => []);
}

function getTeamHints(actor = {}, body = {}) {
  const team = body?.team && typeof body.team === "object" ? body.team : {};
  const names = uniqueValues([team.name, actor.teamName, actor.team]);
  const slugs = uniqueValues([
    team.slug,
    team.id && !isUuid(team.id) ? team.id : "",
    actor.teamId && !isUuid(actor.teamId) ? actor.teamId : "",
    ...names.map(normalizeSlug),
  ]);
  const ids = uniqueValues([team.id, actor.teamId]).filter(isUuid);
  return { ids, names, slugs };
}

async function fetchTeamScopeRows(actor = {}, body = {}) {
  const hints = getTeamHints(actor, body);
  const queries = [];
  if (hints.ids.length) {
    queries.push(fetchSupabaseRest("squad_teams", {
      select: "id,organization_id,club_id,name,slug,status",
      id: `in.${postgrestInList(hints.ids)}`,
      status: "eq.active",
      limit: "20",
    }));
  }
  if (hints.slugs.length) {
    queries.push(fetchSupabaseRest("squad_teams", {
      select: "id,organization_id,club_id,name,slug,status",
      slug: `in.${postgrestInList(hints.slugs)}`,
      status: "eq.active",
      limit: "20",
    }));
  }
  if (hints.names.length) {
    queries.push(fetchSupabaseRest("squad_teams", {
      select: "id,organization_id,club_id,name,slug,status",
      name: `in.${postgrestInList(hints.names)}`,
      status: "eq.active",
      limit: "20",
    }));
  }
  const results = await Promise.all(queries.map((query) => query.catch(() => [])));
  return results.flat();
}

async function resolveSquadAgeScopes(actor = {}, body = {}) {
  const organizationIds = new Set();
  const teamIds = new Set();
  const clubIds = new Set();

  const memberships = await fetchActorMembershipScopes(actor);
  memberships.forEach((membership) => {
    if (isUuid(membership.organization_id)) organizationIds.add(membership.organization_id);
    if (isUuid(membership.team_id)) teamIds.add(membership.team_id);
    if (isUuid(membership.club_id)) clubIds.add(membership.club_id);
  });

  const teams = await fetchTeamScopeRows(actor, body);
  teams.forEach((team) => {
    if (isUuid(team.organization_id)) organizationIds.add(team.organization_id);
    if (isUuid(team.id)) teamIds.add(team.id);
    if (isUuid(team.club_id)) clubIds.add(team.club_id);
  });

  return {
    organizationIds: [...organizationIds],
    teamIds: [...teamIds],
    clubIds: [...clubIds],
  };
}

async function fetchPlayerRowsByField(field, values = [], scopes = {}) {
  const organizationIds = Array.isArray(scopes.organizationIds) ? scopes.organizationIds.filter(isUuid) : [];
  if (!organizationIds.length || !values.length) {
    return [];
  }
  return fetchSupabaseRest("squad_players", {
    select: "id,organization_id,display_name,sort_name,date_of_birth,metadata,status",
    organization_id: `in.${postgrestInList(organizationIds)}`,
    status: "eq.active",
    [field]: `in.${postgrestInList(values)}`,
    limit: String(Math.max(values.length, MAX_AGE_CANDIDATES)),
  });
}

async function fetchSquadPlayerAgeRows(candidates = [], scopes = {}) {
  const sortNames = uniqueValues(candidates.map((candidate) => candidate.sortName));
  const displayNames = uniqueValues(candidates.map((candidate) => candidate.name));
  const [sortRows, displayRows] = await Promise.all([
    fetchPlayerRowsByField("sort_name", sortNames, scopes),
    fetchPlayerRowsByField("display_name", displayNames, scopes),
  ]);
  const byId = new Map();
  [...sortRows, ...displayRows].forEach((row) => {
    if (row?.id) {
      byId.set(row.id, row);
    }
  });
  return [...byId.values()];
}

function getRowBirthDate(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return normalizeDateValue(row.date_of_birth || metadata.birthDate || metadata.dateOfBirth || metadata.date_of_birth || metadata.dob);
}

function getRowAge(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return normalizeAgeValue(metadata.age || metadata.playerAge || metadata.player_age);
}

function matchSquadAgeCandidatesToRows(candidates = [], rows = []) {
  const rowsBySortName = new Map();
  rows.forEach((row) => {
    const sortName = normalizeSortName(row.sort_name || row.display_name);
    if (!sortName) {
      return;
    }
    const list = rowsBySortName.get(sortName) || [];
    list.push(row);
    rowsBySortName.set(sortName, list);
  });

  return candidates
    .map((candidate) => {
      const matches = rowsBySortName.get(candidate.sortName) || [];
      const row = matches[0] || null;
      const birthDate = row ? getRowBirthDate(row) : "";
      const age = row ? getRowAge(row) : "";
      if (!row || (!birthDate && !age)) {
        return null;
      }
      return {
        profileId: candidate.profileId,
        name: candidate.name,
        birthDate,
        age,
        databasePlayerId: row.id,
        source: "squad_players",
      };
    })
    .filter(Boolean);
}

async function handleSquadAgeHydrationRequest(req, res, actor = {}) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, reason: "Use POST to hydrate Squad ages." });
  }
  const body = await parseJsonBody(req);
  const candidates = normalizeAgeCandidates(body.players);
  if (!candidates.length) {
    return sendJson(res, 200, {
      ok: true,
      schema: SQUAD_AGE_SCHEMA,
      players: [],
      checkedProfileIds: [],
    });
  }
  const scopes = await resolveSquadAgeScopes(actor, body);
  const rows = scopes.organizationIds.length ? await fetchSquadPlayerAgeRows(candidates, scopes) : [];
  return sendJson(res, 200, {
    ok: true,
    schema: SQUAD_AGE_SCHEMA,
    checkedAt: new Date().toISOString(),
    players: matchSquadAgeCandidatesToRows(candidates, rows),
    checkedProfileIds: candidates.map((candidate) => candidate.profileId).filter(Boolean),
  });
}

module.exports = {
  SQUAD_AGE_SCHEMA,
  normalizeAgeCandidates,
  normalizeSortName,
  matchSquadAgeCandidatesToRows,
  resolveSquadAgeScopes,
  handleSquadAgeHydrationRequest,
};
