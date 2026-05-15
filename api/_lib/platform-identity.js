const { readConfig } = require("./supabase-admin.js");

const PLATFORM_IDENTITY_SCOPE_SCHEMA = "footballscience-platform-identity-scope-v1";
const PLATFORM_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"]);
const MANAGER_ROLES = new Set(["admin", "club-admin", "team-admin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 240;

const MEMBERSHIP_SELECT = [
  "id",
  "organization_id",
  "club_id",
  "team_id",
  "user_id",
  "role",
  "scope",
  "status",
  "relationship",
  "accepted_at",
  "created_at",
  "updated_at",
].join(",");
const PROFILE_SELECT = [
  "user_id",
  "primary_organization_id",
  "primary_club_id",
  "primary_team_id",
  "display_name",
  "first_name",
  "last_name",
  "email",
  "title",
  "department",
  "status",
  "updated_at",
].join(",");
const ORGANIZATION_SELECT = "id,slug,name,status,updated_at";
const CLUB_SELECT = "id,organization_id,slug,name,status,updated_at";
const TEAM_SELECT = "id,organization_id,club_id,slug,name,sport,age_group,gender,status,updated_at";
const CHECKPOINT_SELECT = [
  "module_id",
  "source_storage_key",
  "target_table",
  "phase",
  "reads_from_database",
  "writes_to_database",
  "app_state_fallback_enabled",
  "last_verified_at",
  "owner",
].join(",");

function normalizeString(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function normalizeRole(value, fallback = "") {
  const role = normalizeString(value, 40).toLowerCase();
  return PLATFORM_ROLES.has(role) ? role : fallback;
}

function normalizeStatus(value) {
  const status = normalizeString(value || "active", 40).toLowerCase();
  return ["active", "paused", "removed", "archived"].includes(status) ? status : "active";
}

function uniq(values = []) {
  return Array.from(new Set(values.map((value) => normalizeString(value, 80)).filter(Boolean)));
}

function rowIdSet(rows = [], key) {
  return uniq(rows.map((row) => row?.[key]).filter(isUuid));
}

function mapById(rows = []) {
  return new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function parseResponse(response) {
  if (!response || response.status === 204) {
    return {};
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function platformIdentityConfig() {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      reason: "Platform identity database is not configured.",
    };
  }
  return { ok: true, ...config };
}

async function fetchPlatformJson(path, options = {}) {
  const config = platformIdentityConfig();
  if (!config.ok) {
    return config;
  }

  const response = await (options.fetchImpl || fetch)(`${config.url}${path}`, {
    method: options.method || "GET",
    headers: serviceHeaders(config.serviceRoleKey),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.error_description || payload?.msg || "Platform identity request failed.",
      payload,
    };
  }
  return { ok: true, status: response.status, data: payload };
}

async function fetchAuthUser(userId, options = {}) {
  if (!isUuid(userId)) {
    return { ok: false, status: 400, reason: "Invalid actor id." };
  }
  return fetchPlatformJson(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, options);
}

async function fetchRestRows(tableName, params, options = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  const result = await fetchPlatformJson(`/rest/v1/${tableName}?${query.toString()}`, options);
  if (!result.ok) {
    return result;
  }
  return { ...result, rows: Array.isArray(result.data) ? result.data : [] };
}

function baseParams(select) {
  const params = new URLSearchParams();
  params.set("select", select);
  return params;
}

async function fetchRowsByIds(tableName, ids, select, options = {}) {
  const safeIds = uniq(ids).filter(isUuid);
  if (!safeIds.length) {
    return { ok: true, rows: [] };
  }
  const params = baseParams(select);
  params.set("id", `in.(${safeIds.join(",")})`);
  return fetchRestRows(tableName, params, options);
}

async function fetchPlatformIdentityRows(actorId, options = {}) {
  if (!isUuid(actorId)) {
    return { ok: false, status: 400, reason: "Invalid actor id." };
  }

  const membershipParams = baseParams(MEMBERSHIP_SELECT);
  membershipParams.set("user_id", `eq.${actorId}`);
  membershipParams.set("status", "eq.active");
  membershipParams.set("deleted_at", "is.null");
  membershipParams.set("order", "scope.asc,created_at.asc");

  const profileParams = baseParams(PROFILE_SELECT);
  profileParams.set("user_id", `eq.${actorId}`);
  profileParams.set("deleted_at", "is.null");
  profileParams.set("limit", "1");

  const checkpointParams = baseParams(CHECKPOINT_SELECT);
  checkpointParams.set("order", "module_id.asc,source_storage_key.asc");

  const [memberships, profiles, checkpoints] = await Promise.all([
    fetchRestRows("platform_memberships", membershipParams, options),
    fetchRestRows("platform_user_profiles", profileParams, options),
    fetchRestRows("platform_module_migration_checkpoints", checkpointParams, options),
  ]);

  for (const result of [memberships, profiles, checkpoints]) {
    if (!result.ok) {
      return result;
    }
  }

  const organizationIds = uniq([
    ...rowIdSet(memberships.rows, "organization_id"),
    ...rowIdSet(profiles.rows, "primary_organization_id"),
  ]);
  const clubIds = uniq([...rowIdSet(memberships.rows, "club_id"), ...rowIdSet(profiles.rows, "primary_club_id")]);
  const teamIds = uniq([...rowIdSet(memberships.rows, "team_id"), ...rowIdSet(profiles.rows, "primary_team_id")]);

  const [organizations, clubs, teams] = await Promise.all([
    fetchRowsByIds("platform_organizations", organizationIds, ORGANIZATION_SELECT, options),
    fetchRowsByIds("platform_clubs", clubIds, CLUB_SELECT, options),
    fetchRowsByIds("platform_teams", teamIds, TEAM_SELECT, options),
  ]);

  for (const result of [organizations, clubs, teams]) {
    if (!result.ok) {
      return result;
    }
  }

  return {
    ok: true,
    memberships: memberships.rows,
    profile: profiles.rows[0] || null,
    checkpoints: checkpoints.rows,
    organizations: organizations.rows,
    clubs: clubs.rows,
    teams: teams.rows,
  };
}

function appMetadataFromRawUser(rawUser = {}) {
  return isPlainObject(rawUser?.app_metadata) ? rawUser.app_metadata : {};
}

function actorFromServerOwnedAuth(actor = {}, rawUser = {}) {
  const appMetadata = appMetadataFromRawUser(rawUser);
  const bootstrapRole = normalizeRole(appMetadata.role || appMetadata.platformRole || appMetadata.platform_role, "");
  return {
    id: normalizeString(rawUser?.id || actor.id, 120),
    email: normalizeString(rawUser?.email || actor.email, 254).toLowerCase(),
    bootstrapRole,
    status: normalizeStatus(appMetadata.status),
  };
}

function membershipRank(row = {}, profile = {}) {
  const roleRank = {
    admin: 1,
    "club-admin": 2,
    "team-admin": 3,
    coach: 4,
    scout: 5,
    analyst: 6,
    performance: 7,
    medical: 8,
    guest: 9,
  }[normalizeRole(row.role, "guest")] || 99;
  const primaryBoost =
    row.team_id && row.team_id === profile?.primary_team_id
      ? -3
      : row.club_id && row.club_id === profile?.primary_club_id
        ? -2
        : row.organization_id && row.organization_id === profile?.primary_organization_id
          ? -1
          : 0;
  return roleRank + primaryBoost;
}

function selectPrimaryMembership(memberships = [], profile = {}) {
  return [...memberships].sort((left, right) => membershipRank(left, profile) - membershipRank(right, profile))[0] || null;
}

function tenantSummary(row, lookup) {
  if (!row) {
    return null;
  }
  const source = lookup?.get?.(row) || row;
  return source
    ? {
        id: source.id,
        slug: source.slug || "",
        name: source.name || "",
        status: source.status || "",
      }
    : null;
}

function membershipPayload(row, lookups) {
  if (!row) {
    return null;
  }
  const role = normalizeRole(row.role, "guest");
  return {
    id: normalizeString(row.id, 120),
    organizationId: normalizeString(row.organization_id, 120),
    clubId: normalizeString(row.club_id, 120),
    teamId: normalizeString(row.team_id, 120),
    role,
    scope: normalizeString(row.scope, 40),
    status: normalizeStatus(row.status),
    relationship: normalizeString(row.relationship || "staff", 40),
    acceptedAt: row.accepted_at || null,
    updatedAt: row.updated_at || row.created_at || null,
    organization: tenantSummary(row.organization_id, lookups.organizations),
    club: tenantSummary(row.club_id, lookups.clubs),
    team: tenantSummary(row.team_id, lookups.teams),
  };
}

function addManageableScope(manageable, membership, bootstrapRole) {
  const role = normalizeRole(membership.role, "guest");
  if (bootstrapRole === "admin" || role === "admin") {
    if (membership.organizationId) {
      manageable.organizationIds.add(membership.organizationId);
    }
    if (membership.clubId) {
      manageable.clubIds.add(membership.clubId);
    }
    if (membership.teamId) {
      manageable.teamIds.add(membership.teamId);
    }
    return;
  }
  if (role === "club-admin" && membership.clubId) {
    manageable.clubIds.add(membership.clubId);
  }
  if (role === "team-admin" && membership.teamId) {
    manageable.teamIds.add(membership.teamId);
  }
}

function checkpointPayload(row, canSeeOperationalDetails) {
  const base = {
    moduleId: normalizeString(row.module_id, 80),
    sourceStorageKey: normalizeString(row.source_storage_key, 180),
    phase: normalizeString(row.phase, 40),
    readsFromDatabase: Boolean(row.reads_from_database),
    writesToDatabase: Boolean(row.writes_to_database),
    appStateFallbackEnabled: row.app_state_fallback_enabled !== false,
    lastVerifiedAt: row.last_verified_at || null,
  };
  if (!canSeeOperationalDetails) {
    return base;
  }
  return {
    ...base,
    targetTable: normalizeString(row.target_table, 120),
    owner: normalizeString(row.owner, 120),
  };
}

function profilePayload(profile = null) {
  if (!profile) {
    return null;
  }
  return {
    userId: normalizeString(profile.user_id, 120),
    primaryOrganizationId: normalizeString(profile.primary_organization_id, 120),
    primaryClubId: normalizeString(profile.primary_club_id, 120),
    primaryTeamId: normalizeString(profile.primary_team_id, 120),
    displayName: normalizeString(profile.display_name, 180),
    firstName: normalizeString(profile.first_name, 120),
    lastName: normalizeString(profile.last_name, 120),
    email: normalizeString(profile.email, 254).toLowerCase(),
    title: normalizeString(profile.title, 160),
    department: normalizeString(profile.department, 120),
    status: normalizeStatus(profile.status),
    updatedAt: profile.updated_at || null,
  };
}

function createPlatformActorScopePayload(actor, rawUser, rows) {
  const authActor = actorFromServerOwnedAuth(actor, rawUser);
  const lookups = {
    organizations: mapById(rows.organizations),
    clubs: mapById(rows.clubs),
    teams: mapById(rows.teams),
  };
  const memberships = (rows.memberships || []).map((row) => membershipPayload(row, lookups));
  const primaryMembership = membershipPayload(selectPrimaryMembership(rows.memberships || [], rows.profile), lookups);
  const effectiveRole = primaryMembership?.role || authActor.bootstrapRole || "guest";
  const canSeeOperationalDetails = authActor.bootstrapRole === "admin" || effectiveRole === "admin";
  const manageable = {
    organizationIds: new Set(),
    clubIds: new Set(),
    teamIds: new Set(),
  };
  memberships.forEach((membership) => addManageableScope(manageable, membership, authActor.bootstrapRole));

  const checkpoints = (rows.checkpoints || []).map((row) => checkpointPayload(row, canSeeOperationalDetails));

  return {
    ok: true,
    schema: PLATFORM_IDENTITY_SCOPE_SCHEMA,
    actor: {
      id: authActor.id,
      email: authActor.email,
      role: effectiveRole,
      bootstrapRole: authActor.bootstrapRole || null,
      status: authActor.status,
      profile: profilePayload(rows.profile),
    },
    scope: {
      primary: primaryMembership,
      memberships,
      organizations: (rows.organizations || []).map((row) => tenantSummary(row, null)),
      clubs: (rows.clubs || []).map((row) => ({
        ...tenantSummary(row, null),
        organizationId: normalizeString(row.organization_id, 120),
      })),
      teams: (rows.teams || []).map((row) => ({
        ...tenantSummary(row, null),
        organizationId: normalizeString(row.organization_id, 120),
        clubId: normalizeString(row.club_id, 120),
      })),
      manageable: {
        canManagePlatform: authActor.bootstrapRole === "admin",
        organizationIds: Array.from(manageable.organizationIds),
        clubIds: Array.from(manageable.clubIds),
        teamIds: Array.from(manageable.teamIds),
      },
    },
    appStateFallback: {
      enabled: checkpoints.some((checkpoint) => checkpoint.appStateFallbackEnabled),
      checkpoints,
    },
    warnings: memberships.length
      ? []
      : ["No active platform membership rows were found for this actor; legacy app-state remains the active fallback."],
  };
}

async function resolvePlatformActorScope(actor, options = {}) {
  if (!actor?.id) {
    return { ok: false, status: 401, reason: "You must be signed in." };
  }
  const rawUserResult = await fetchAuthUser(actor.id, options);
  if (!rawUserResult.ok) {
    return rawUserResult;
  }
  const rawUser = rawUserResult.data?.user || rawUserResult.data || {};
  const rows = await fetchPlatformIdentityRows(actor.id, options);
  if (!rows.ok) {
    return rows;
  }
  return createPlatformActorScopePayload(actor, rawUser, rows);
}

module.exports = {
  PLATFORM_IDENTITY_SCOPE_SCHEMA,
  createPlatformActorScopePayload,
  fetchPlatformIdentityRows,
  resolvePlatformActorScope,
};
