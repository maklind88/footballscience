function addToIndex(index, key, cluster) {
  if (!key) {
    return;
  }
  let clusters = index.get(key);
  if (!clusters) {
    clusters = new Set();
    index.set(key, clusters);
  }
  clusters.add(cluster);
}

function getIndexedCandidates(index, keys = []) {
  const candidates = new Set();
  keys.forEach((key) => {
    index.get(key)?.forEach((cluster) => candidates.add(cluster));
  });
  return candidates;
}

function canJoinCluster(cluster, record, strongKey, deps) {
  if (
    strongKey &&
    cluster.strongKey &&
    cluster.strongKey !== strongKey &&
    (deps.isHardKey?.(strongKey) || deps.isHardKey?.(cluster.strongKey))
  ) {
    return false;
  }
  return cluster.records.every((existingRecord) => deps.isSamePerson?.(record, existingRecord) === true);
}

export function buildScoutingPersonClusters(records = [], deps = {}) {
  const clusters = [];
  const clustersByStrongKey = new Map();
  const clustersBySoftKey = new Map();
  const clustersByNameKey = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const strongKey = deps.getStrongKey?.(record) || "";
    const softKey = deps.getSoftKey?.(record) || "";
    const nameKey = deps.getNameKey?.(record) || "";
    const aliasKey = deps.getAliasKey?.(record) || "";
    let cluster = strongKey ? clustersByStrongKey.get(strongKey) || null : null;

    if (!cluster && softKey) {
      const softCandidates = clustersBySoftKey.get(softKey) || [];
      cluster =
        Array.from(softCandidates).find((candidate) => canJoinCluster(candidate, record, strongKey, deps)) || null;
    }

    if (!cluster) {
      const candidates = getIndexedCandidates(clustersByNameKey, [nameKey, aliasKey]);
      cluster =
        Array.from(candidates).find((candidate) => canJoinCluster(candidate, record, strongKey, deps)) || null;
    }

    if (!cluster) {
      cluster = { strongKey, softKey, records: [] };
      clusters.push(cluster);
    }

    cluster.records.push(record);
    if (strongKey && !cluster.strongKey) {
      cluster.strongKey = strongKey;
    }
    if (softKey && !cluster.softKey) {
      cluster.softKey = softKey;
    }

    if (cluster.strongKey) {
      clustersByStrongKey.set(cluster.strongKey, cluster);
    }
    addToIndex(clustersBySoftKey, cluster.softKey, cluster);
    addToIndex(clustersBySoftKey, softKey, cluster);
    addToIndex(clustersByNameKey, nameKey, cluster);
    addToIndex(clustersByNameKey, aliasKey, cluster);
  }

  return clusters;
}
