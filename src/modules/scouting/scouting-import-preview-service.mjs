function defaultYieldWork() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export function createScoutingImportPreviewService(deps = {}) {
  const yieldWork = deps.yieldWork || defaultYieldWork;

  function getRecordMergeKey(record) {
    const personIdentityKey =
      deps.getRecordStrongPersonKey(record) ||
      deps.getRecordCanonicalPersonKey(record) ||
      deps.getRecordPlayerIdentityId(record);
    return deps.getImportMergeKey(
      deps.normalizeText(record?.[deps.recordIndex.sourceSystem], 40) || "file-import",
      personIdentityKey,
      deps.getRecordSeason(record),
      deps.getRecordLeague(record),
      deps.getRecordTeam(record)
    );
  }

  function recordsAreEquivalent(first, second, metricIds = []) {
    if (!first || !second) return false;
    const fieldsFor = (record) => [
      deps.getRecordName(record),
      deps.getRecordTeam(record),
      deps.getRecordLeague(record),
      deps.getRecordSeason(record),
      deps.getRecordPosition(record),
      deps.getRecordAge(record),
      deps.getMetricValue(record, "matches"),
      deps.getRecordMinutes(record),
      deps.getRecordBirthCountry(record),
      deps.getRecordPassportCountry(record),
      deps.normalizeText(record?.[deps.recordIndex.height], 40),
      deps.normalizeText(record?.[deps.recordIndex.weight], 40),
    ];
    const firstFields = fieldsFor(first);
    const secondFields = fieldsFor(second);
    if (firstFields.some((value, index) => String(value ?? "") !== String(secondFields[index] ?? ""))) return false;
    return metricIds.every((metricId) => {
      const firstValue = deps.getMetricValue(first, metricId);
      const secondValue = deps.getMetricValue(second, metricId);
      if (Number.isFinite(firstValue) !== Number.isFinite(secondValue)) return false;
      if (Number.isFinite(firstValue) && firstValue !== secondValue) return false;
      return deps.getMetricQuality(first, metricId) === deps.getMetricQuality(second, metricId);
    });
  }

  function getIdentitySignature(record) {
    return [
      deps.normalizeIdentityPart(deps.getRecordName(record), 120),
      deps.normalizeIdentityPart(deps.getRecordDateOfBirth(record), 40),
      deps.normalizeIdentityPart(deps.getRecordPassportCountry(record) || deps.getRecordBirthCountry(record), 120),
    ].filter(Boolean).join("|");
  }

  function getIdentityLabel(record) {
    const dateOfBirth = deps.getRecordDateOfBirth(record);
    const nationality = deps.getRecordPassportCountry(record) || deps.getRecordBirthCountry(record);
    return [deps.getRecordName(record), dateOfBirth, nationality].filter(Boolean).join(" / ") || "Unknown player";
  }

  async function build(database = {}, options = {}) {
    const currentDatabase = deps.getDatabase?.() || {};
    const existingRecords = Array.isArray(currentDatabase.records) ? currentDatabase.records : [];
    const existingByMergeKey = new Map();
    const existingByIdentityId = new Map();
    const existingByIdentitySignature = new Map();
    for (let index = 0; index < existingRecords.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException("Scouting import preview was cancelled.", "AbortError");
      const record = existingRecords[index];
      const key = getRecordMergeKey(record);
      if (key) existingByMergeKey.set(key, record);
      const identityId = deps.getRecordPlayerIdentityId(record);
      if (identityId) {
        if (!existingByIdentityId.has(identityId)) existingByIdentityId.set(identityId, []);
        existingByIdentityId.get(identityId).push(record);
      }
      const identitySignature = getIdentitySignature(record);
      if (identitySignature) {
        if (!existingByIdentitySignature.has(identitySignature)) existingByIdentitySignature.set(identitySignature, []);
        existingByIdentitySignature.get(identitySignature).push(record);
      }
      if ((index + 1) % 500 === 0) await yieldWork();
    }

    const metricIds = Array.from(new Set([
      ...(Array.isArray(database.metrics) ? database.metrics : []).map((metric) => deps.normalizeText(metric?.id, 120)),
      ...(Array.isArray(currentDatabase.metrics) ? currentDatabase.metrics : []).map((metric) => deps.normalizeText(metric?.id, 120)),
    ].filter(Boolean)));
    const operationsByMergeKey = {};
    const samples = [];
    const identityWarnings = [];
    const metricQualityCounts = { trusted: 0, estimated: 0, missing: 0 };
    const summary = {
      incomingRows: database.records?.length || 0,
      newRows: 0,
      replaceRows: 0,
      unchangedRows: 0,
      duplicateRows: database.dedupeSummary?.incomingDuplicates || 0,
      duplicateSamples: database.dedupeSummary?.duplicateSamples || [],
      identityWarningRows: 0,
      criticalIdentityRows: 0,
      identityWarnings,
      metricQualityCounts,
      samples,
      operationsByMergeKey,
      manualStatePreserved: deps.getManualStateSummary?.() || {},
      signature: database.importSignature || "",
    };
    const incomingRecords = Array.isArray(database.records) ? database.records : [];
    for (let index = 0; index < incomingRecords.length; index += 1) {
      if (options.signal?.aborted) throw new DOMException("Scouting import preview was cancelled.", "AbortError");
      const record = incomingRecords[index];
      const key = getRecordMergeKey(record);
      const existing = key ? existingByMergeKey.get(key) : null;
      const operation = !existing ? "new" : recordsAreEquivalent(existing, record, metricIds) ? "unchanged" : "replace";
      operationsByMergeKey[key] = operation;
      if (operation === "new") summary.newRows += 1;
      else if (operation === "replace") summary.replaceRows += 1;
      else summary.unchangedRows += 1;

      const identityId = deps.getRecordPlayerIdentityId(record);
      const sourceTrace = deps.getRecordSourceTrace(record);
      const identitySource = deps.normalizeText(sourceTrace.identitySource, 40) || "unknown";
      const identitySourceMapped = identitySource !== "derived";
      const identitySignature = getIdentitySignature(record);
      const identityIssueLabels = [];
      const hasDateOfBirth = Boolean(deps.getRecordDateOfBirth(record));
      const hasNationality = Boolean(deps.getRecordPassportCountry(record) || deps.getRecordBirthCountry(record));
      const conflictingIdentity = (existingByIdentityId.get(identityId) || []).find((existingRecord) => {
        const existingSignature = getIdentitySignature(existingRecord);
        return existingSignature && identitySignature && existingSignature !== identitySignature;
      });
      const possibleAlias = identitySignature
        ? (existingByIdentitySignature.get(identitySignature) || []).find(
            (existingRecord) => deps.getRecordPlayerIdentityId(existingRecord) !== identityId
          )
        : null;
      if (!identitySourceMapped) identityIssueLabels.push(hasDateOfBirth && hasNationality ? "Derived identity" : "Weak identity");
      if (!hasDateOfBirth) identityIssueLabels.push("Missing DOB");
      if (!hasNationality) identityIssueLabels.push("Missing nationality");
      if (conflictingIdentity) identityIssueLabels.push("Identity conflict");
      if (possibleAlias) identityIssueLabels.push("Possible alias");
      if (identityIssueLabels.length) {
        const critical = identityIssueLabels.includes("Identity conflict") || identityIssueLabels.includes("Possible alias");
        summary.identityWarningRows += 1;
        if (critical) summary.criticalIdentityRows += 1;
        if (identityWarnings.length < 8) {
          identityWarnings.push({
            labels: Array.from(new Set(identityIssueLabels)),
            name: deps.getRecordName(record),
            detail: conflictingIdentity
              ? `Same player ID already exists as ${getIdentityLabel(conflictingIdentity)}.`
              : possibleAlias
                ? `Same DOB/nationality profile exists under another player ID: ${deps.getRecordPlayerIdentityId(possibleAlias)}.`
                : !identitySourceMapped
                  ? "No mapped source player ID found. Merge is based on derived name/DOB/nationality identity."
                  : "Identity data should be completed before commit.",
            team: deps.getRecordTeam(record),
            league: deps.getRecordLeague(record),
            season: deps.getRecordSeason(record),
          });
        }
      }

      const metricValues = record?.[deps.recordIndex.metrics] || {};
      const metricQuality = record?.[deps.recordIndex.metricQuality] || {};
      const metricEntries = Array.isArray(metricValues)
        ? metricValues.map((entry, metricIndex) => [metricIds[metricIndex] || String(metricIndex), entry])
        : Object.entries(metricValues);
      let populatedMetrics = 0;
      metricEntries.forEach(([metricId, entry]) => {
        const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
        if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return;
        populatedMetrics += 1;
        const quality = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.quality : metricQuality[metricId];
        metricQualityCounts[deps.normalizeMetricQuality(quality)] += 1;
      });
      metricQualityCounts.missing += Math.max(0, metricIds.length - populatedMetrics);
      if (samples.length < 6 && operation !== "unchanged") {
        samples.push({
          operation,
          name: deps.getRecordName(record),
          team: deps.getRecordTeam(record),
          league: deps.getRecordLeague(record),
          season: deps.getRecordSeason(record),
        });
      }
      if ((index + 1) % 100 === 0) {
        if ((index + 1) % 1000 === 0) options.onProgress?.({ completed: index + 1, total: incomingRecords.length });
        await yieldWork();
      }
    }

    summary.importSafety = summary.criticalIdentityRows > 0
      ? {
          tone: "danger",
          label: "Stop and review identity",
          detail: `${summary.criticalIdentityRows} player rows may collide with an existing player identity. Check aliases before commit.`,
        }
      : summary.identityWarningRows > 0
        ? {
            tone: "warning",
            label: "Review before commit",
            detail: `${summary.identityWarningRows} player rows use derived or incomplete identity. Commit only if name, DOB and nationality look correct.`,
          }
        : summary.replaceRows > 0 || summary.newRows > 0
          ? {
              tone: "safe",
              label: "Safe to commit",
              detail: "No identity conflicts detected in this preview. New and replaced rows will keep source trace metadata; manual notes and lists are preserved.",
            }
          : {
              tone: "neutral",
              label: "No changes detected",
              detail: "This import does not change the scouting player database.",
            };
    return summary;
  }

  return { build };
}
