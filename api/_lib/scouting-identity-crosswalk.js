const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function quotePostgrestValue(value = "") {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function resolveScoutingIdentityCrosswalk(rows = [], dbRequest) {
  if (!Array.isArray(rows) || !rows.length || typeof dbRequest !== "function") return rows;
  const groups = new Map();
  rows.forEach((row) => {
    if (row.fsdb_player_id || !row.source_system || !row.source_player_id) return;
    const ids = groups.get(row.source_system) || new Set();
    ids.add(row.source_player_id);
    groups.set(row.source_system, ids);
  });
  const links = [];
  for (const [sourceSystem, sourceIds] of groups) {
    const ids = [...sourceIds];
    for (let offset = 0; offset < ids.length; offset += 80) {
      const batch = ids.slice(offset, offset + 80);
      const params = new URLSearchParams({
        select: "player_id,source_system,source_entity_id,verified_status",
        source_system: `eq.${sourceSystem}`,
        source_entity_id: `in.(${batch.map(quotePostgrestValue).join(",")})`,
        verified_status: "in.(verified,linked)",
        limit: "100",
      });
      const result = await dbRequest(`/fsdb_player_source_links?${params.toString()}`);
      if (result.ok && Array.isArray(result.payload)) links.push(...result.payload);
    }
  }
  const bySource = new Map(
    links
      .filter((link) => UUID_PATTERN.test(String(link.player_id || "")))
      .map((link) => [`${link.source_system}:${link.source_entity_id}`, link.player_id])
  );
  rows.forEach((row) => {
    row.fsdb_player_id = row.fsdb_player_id || bySource.get(`${row.source_system}:${row.source_player_id}`) || null;
  });
  return rows;
}

module.exports = {
  resolveScoutingIdentityCrosswalk,
};
