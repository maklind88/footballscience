import {
  canonicalJson,
  verifyPlatformIdentitySnapshot,
} from "./platform-identity-snapshot.mjs";
import { createPlatformIdentityMigrationBundle } from "./platform-identity-migration-bundle.mjs";
import {
  createDeterministicPlatformIdentityMigrationId,
  createPlatformIdentityMigrationCommand as command,
  createPlatformIdentityRestorePatch as restorePatch,
  findPlatformIdentityRowById as findById,
  isPlatformIdentityBackfillOwned as isOwned,
  isPlatformIdentityUuid as isUuid,
  normalizePlatformIdentityText as normalizeText,
  platformIdentityValuesEqual as valuesEqual,
  requirePlatformIdentityRowVersion as requireVersion,
} from "./platform-identity-migration-plan-helpers.mjs";

export { createDeterministicPlatformIdentityMigrationId };

function planTenantRoot({
  table,
  keyColumn = "id",
  desired,
  existing,
  mutableFields,
  archivedStatus,
  commands,
  blockers,
}) {
  if (!existing) {
    commands.push(command(table, "create", keyColumn, desired[keyColumn], null, desired));
    return;
  }
  const archived = existing.deleted_at || existing.status === archivedStatus;
  if (!archived) return;
  if (!isOwned(existing)) {
    blockers.push(`${table}:${desired[keyColumn]}:archived-row-not-owned`);
    return;
  }
  const version = requireVersion(existing, `${table}:${desired[keyColumn]}`, blockers);
  if (!version) return;
  commands.push(
    command(
      table,
      "restore",
      keyColumn,
      desired[keyColumn],
      version,
      restorePatch(
        Object.fromEntries(mutableFields.map((field) => [field, desired[field] ?? null]))
      )
    )
  );
}

function tenantIds(body) {
  return {
    organizationId: normalizeText(body.organization?.id, 120),
    clubId: normalizeText(body.club?.id, 120),
    teamId: normalizeText(body.team?.id, 120),
  };
}

function membershipTarget(body, ids) {
  if (body.membership?.scope === "team") {
    return {
      organization_id: ids.organizationId,
      club_id: ids.clubId || null,
      team_id: ids.teamId,
    };
  }
  if (body.membership?.scope === "club") {
    return {
      organization_id: ids.organizationId,
      club_id: ids.clubId,
      team_id: null,
    };
  }
  return {
    organization_id: ids.organizationId,
    club_id: null,
    team_id: null,
  };
}

function sameMembership(row, body, target) {
  return (
    row.user_id === body.user.id &&
    row.role === body.membership.role &&
    row.scope === body.membership.scope &&
    row.organization_id === target.organization_id &&
    (row.club_id || null) === target.club_id &&
    (row.team_id || null) === target.team_id
  );
}

function desiredProfile(body, ids) {
  return {
    primary_organization_id: ids.organizationId,
    primary_club_id: ids.clubId || null,
    primary_team_id: ids.teamId || null,
    display_name: body.user.displayName || null,
    first_name: body.user.firstName || null,
    last_name: body.user.lastName || null,
    email: body.user.email || null,
    title: body.user.title || null,
    department: body.user.department || null,
    status: body.user.status || "active",
    metadata: body.user.metadata || {},
  };
}

function planProfile(body, ids, snapshot, commands, blockers) {
  const table = "platform_user_profiles";
  const existing = findById(snapshot.tables[table] || [], "user_id", body.user.id);
  const desired = desiredProfile(body, ids);
  if (!existing) {
    commands.push(
      command(table, "create", "user_id", body.user.id, null, {
        user_id: body.user.id,
        ...desired,
      })
    );
    return;
  }
  const version = requireVersion(existing, `${table}:${body.user.id}`, blockers);
  if (!version) return;
  const archived = existing.deleted_at || existing.status === "removed";
  if (archived && !isOwned(existing)) {
    blockers.push(`${table}:${body.user.id}:archived-row-not-owned`);
    return;
  }
  const fields = Object.keys(desired);
  if (!archived && valuesEqual(existing, desired, fields)) return;
  commands.push(
    command(
      table,
      archived ? "restore" : "update",
      "user_id",
      body.user.id,
      version,
      archived ? restorePatch(desired) : desired
    )
  );
}

function planMembership(
  body,
  ids,
  snapshot,
  commands,
  blockers,
  createId,
  createdAt,
  actorId
) {
  const table = "platform_memberships";
  const target = membershipTarget(body, ids);
  const rows = (snapshot.tables[table] || []).filter(
    (row) => row.user_id === body.user.id
  );
  const active = rows.find(
    (row) => sameMembership(row, body, target) && row.status === "active" && !row.deleted_at
  );
  if (active) return;
  const archived = rows.find(
    (row) => sameMembership(row, body, target) && isOwned(row)
  );
  const desired = {
    role: body.membership.role,
    scope: body.membership.scope,
    status: "active",
    relationship: body.membership.relationship || "staff",
    invited_by: actorId,
    accepted_at: archived?.accepted_at || createdAt,
    metadata: body.membership.metadata || {},
  };
  if (archived) {
    const version = requireVersion(archived, `${table}:${archived.id}`, blockers);
    if (!version) return;
    commands.push(
      command(table, "restore", "id", archived.id, version, restorePatch(desired))
    );
    return;
  }
  const id = createId(
    [
      table,
      body.user.id,
      body.membership.role,
      body.membership.scope,
      target.organization_id,
      target.club_id,
      target.team_id,
    ].join(":")
  );
  commands.push(
    command(table, "create", "id", id, null, {
      id,
      ...target,
      user_id: body.user.id,
      ...desired,
    })
  );
}

function linkTarget(link, ids) {
  if (link.scope === "team") {
    return {
      organization_id: ids.organizationId,
      club_id: ids.clubId || null,
      team_id: ids.teamId,
    };
  }
  if (link.scope === "club") {
    return {
      organization_id: ids.organizationId,
      club_id: ids.clubId,
      team_id: null,
    };
  }
  return {
    organization_id: ids.organizationId,
    club_id: null,
    team_id: null,
  };
}

function planLinks(body, ids, snapshot, commands, blockers, createId) {
  const table = "platform_tenant_links";
  for (const link of body.links || []) {
    const target = linkTarget(link, ids);
    const existing = (snapshot.tables[table] || []).find(
      (row) =>
        row.module_id === link.moduleId &&
        row.module_table === link.moduleTable &&
        row.module_record_id === link.moduleRecordId
    );
    if (existing) {
      if (
        existing.organization_id !== target.organization_id ||
        (existing.club_id || null) !== target.club_id ||
        (existing.team_id || null) !== target.team_id ||
        existing.scope !== link.scope
      ) {
        blockers.push(`${table}:${existing.id}:tenant-scope-mismatch`);
        continue;
      }
      if (existing.status !== "archived") continue;
      if (!isOwned(existing)) {
        blockers.push(`${table}:${existing.id}:archived-row-not-owned`);
        continue;
      }
      const version = requireVersion(existing, `${table}:${existing.id}`, blockers);
      if (!version) continue;
      commands.push(
        command(table, "restore", "id", existing.id, version, {
          status: link.status || "active",
          metadata: link.metadata || {},
        })
      );
      continue;
    }
    const id = createId(
      [
        table,
        link.moduleId,
        link.moduleTable,
        link.moduleRecordId,
      ].join(":")
    );
    commands.push(
      command(table, "create", "id", id, null, {
        id,
        ...target,
        module_id: link.moduleId,
        module_table: link.moduleTable,
        module_record_id: link.moduleRecordId,
        scope: link.scope,
        status: link.status || "active",
        metadata: link.metadata || {},
      })
    );
  }
}

function validateEntries(snapshot, entries) {
  const blockers = [];
  const snapshotCheck = verifyPlatformIdentitySnapshot(snapshot);
  if (!snapshotCheck.ok || snapshot.target !== "staging") {
    blockers.push("verified-staging-snapshot-required");
  }
  if (!Array.isArray(entries) || entries.length !== snapshot.plan?.userCount) {
    blockers.push("reviewed-user-count-mismatch");
  }
  const ids = tenantIds(entries?.[0] || {});
  if (!isUuid(ids.organizationId)) blockers.push("explicit-organization-id-required");
  if (entries?.[0]?.club && !isUuid(ids.clubId)) blockers.push("explicit-club-id-required");
  if (entries?.[0]?.team && !isUuid(ids.teamId)) blockers.push("explicit-team-id-required");
  if (
    ids.organizationId !== normalizeText(snapshot.scope?.organizationId, 120) ||
    (ids.clubId || null) !==
      (normalizeText(snapshot.scope?.clubId, 120) || null) ||
    (ids.teamId || null) !==
      (normalizeText(snapshot.scope?.teamId, 120) || null)
  ) {
    blockers.push("snapshot-tenant-scope-mismatch");
  }
  for (const body of entries || []) {
    if (!isUuid(body.user?.id) || canonicalJson(tenantIds(body)) !== canonicalJson(ids)) {
      blockers.push("entry-identity-or-tenant-mismatch");
      break;
    }
  }
  return { blockers, ids };
}

export function createPlatformIdentityBackfillCommands({
  snapshot,
  currentRowsByTable,
  entries = [],
  actorId,
  createdAt,
  createId,
} = {}) {
  const { blockers, ids } = validateEntries(snapshot, entries);
  if (!isUuid(actorId)) blockers.push("valid-audit-actor-required");
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    blockers.push("valid-migration-timestamp-required");
  }
  if (blockers.length) return { ok: false, blockers, commands: [] };
  const commands = [];
  const planningSnapshot = {
    ...snapshot,
    tables: currentRowsByTable || snapshot.tables,
  };
  const resolveId =
    createId ||
    ((label) =>
      createDeterministicPlatformIdentityMigrationId(
        `${snapshot.integrity.contentSha256}:${label}`
      ));
  const first = entries[0];
  const organization = {
    id: ids.organizationId,
    slug: first.organization.slug,
    name: first.organization.name,
    status: first.organization.status || "active",
    metadata: first.organization.metadata || {},
  };
  planTenantRoot({
    table: "platform_organizations",
    desired: organization,
    existing: findById(
      planningSnapshot.tables.platform_organizations || [],
      "id",
      ids.organizationId
    ),
    mutableFields: ["slug", "name", "status", "metadata"],
    archivedStatus: "archived",
    commands,
    blockers,
  });
  if (first.club) {
    const club = {
      id: ids.clubId,
      organization_id: ids.organizationId,
      slug: first.club.slug,
      name: first.club.name,
      country_code: first.club.countryCode || null,
      status: first.club.status || "active",
      metadata: first.club.metadata || {},
    };
    planTenantRoot({
      table: "platform_clubs",
      desired: club,
      existing: findById(
        planningSnapshot.tables.platform_clubs || [],
        "id",
        ids.clubId
      ),
      mutableFields: ["slug", "name", "country_code", "status", "metadata"],
      archivedStatus: "archived",
      commands,
      blockers,
    });
  }
  if (first.team) {
    const team = {
      id: ids.teamId,
      organization_id: ids.organizationId,
      club_id: ids.clubId || null,
      slug: first.team.slug,
      name: first.team.name,
      sport: first.team.sport || "football",
      age_group: first.team.ageGroup || null,
      gender: first.team.gender || null,
      status: first.team.status || "active",
      metadata: first.team.metadata || {},
    };
    planTenantRoot({
      table: "platform_teams",
      desired: team,
      existing: findById(
        planningSnapshot.tables.platform_teams || [],
        "id",
        ids.teamId
      ),
      mutableFields: [
        "slug",
        "name",
        "sport",
        "age_group",
        "gender",
        "status",
        "metadata",
      ],
      archivedStatus: "archived",
      commands,
      blockers,
    });
  }
  for (const body of entries) {
    planProfile(body, ids, planningSnapshot, commands, blockers);
    planMembership(
      body,
      ids,
      planningSnapshot,
      commands,
      blockers,
      resolveId,
      createdAt,
      actorId
    );
    planLinks(
      body,
      ids,
      planningSnapshot,
      commands,
      blockers,
      resolveId
    );
  }
  return { ok: blockers.length === 0, blockers, commands, ids };
}

export function createPlatformIdentityBackfillMigrationBundle({
  snapshot,
  entries,
  actorId,
  projectRef,
  requestId,
  createdAt,
  createId,
} = {}) {
  const plan = createPlatformIdentityBackfillCommands({
    snapshot,
    entries,
    actorId,
    createdAt,
    createId,
  });
  if (!plan.ok) return plan;
  return createPlatformIdentityMigrationBundle({
    target: "staging",
    projectRef,
    actorId,
    requestId,
    createdAt,
    operation: "backfill",
    planSha256: snapshot.plan.planSha256,
    snapshot,
    commands: plan.commands,
  });
}
