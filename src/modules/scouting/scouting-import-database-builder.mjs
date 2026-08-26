function defaultYieldWork() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export function createScoutingImportDatabaseBuilder(deps = {}) {
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

  function preferRecord(nextRecord, currentRecord) {
    if (!currentRecord) return nextRecord;
    const nextScore = deps.getRecordMetricValueCount(nextRecord) * 10000 + deps.getRecordMinutes(nextRecord);
    const currentScore = deps.getRecordMetricValueCount(currentRecord) * 10000 + deps.getRecordMinutes(currentRecord);
    return nextScore >= currentScore ? nextRecord : currentRecord;
  }

  async function build(draft = null, options = {}) {
    if (!draft || !["ready", "preparing", "blocked", "validated"].includes(draft.status)) return null;
    if (draft.preparedDatabase?.importSignature && draft.preparedDatabase.importSignature === draft.importPreview?.signature) {
      return draft.preparedDatabase;
    }
    const selected = draft.sheets?.find((sheet) => sheet.name === draft.selectedSheet);
    const sheets = deps.getImportSheetsForBatch(draft);
    if (!selected || !sheets.length) return null;

    const map = draft.map || {};
    const batchHeaders = deps.getImportHeadersForBatch(sheets);
    const metrics = deps.getImportMetricHeaders(batchHeaders, map)
      .map((header) => ({
        id: `import_${deps.getImportColumnId(header)}`,
        label: deps.normalizeText(header, 120),
        direction: deps.getImportMetricDirection(header),
        sourceColumn: deps.normalizeText(header, 160),
      }))
      .filter((metric, index, values) => metric.label && values.findIndex((item) => item.id === metric.id) === index);
    const importedAt = (deps.now || (() => new Date().toISOString()))();
    const sourceSystem = deps.getImportSourceSystem(draft);
    const mappedHeaders = Array.from(new Set(Object.values(map).filter(Boolean)));
    const recordsByMergeKey = new Map();
    const duplicateSamples = [];
    let incomingDuplicates = 0;

    function buildRecord(row, rowIndex, sheetContext) {
      const { headerIndex, metricColumns, sheet } = sheetContext;
      const columnar = Array.isArray(row) && sheet.rowFormat === "columns";
      const getValue = columnar
        ? (header) => (header ? row[headerIndex[header]] : "")
        : (header) => (header ? row?.[header] : "");
      const mappedRow = Object.fromEntries(mappedHeaders.map((header) => [header, getValue(header)]));
      const player = deps.normalizeText(mappedRow[map.player], 160);
      const team = deps.normalizeText(mappedRow[map.team], 160);
      const teamWithinTimeframe = deps.normalizeText(mappedRow[map.teamWithinTimeframe], 180) || team;
      const league = deps.normalizeLeague(mappedRow[map.league]);
      const season = deps.normalizeText(draft.seasonOverride || mappedRow[map.season], 80);
      const position = deps.normalizeText(mappedRow[map.position], 80);
      if (!player && !team && !position) return null;

      const identityCandidates = deps.getImportIdentityCandidates(mappedRow, map);
      const mappedPlayerSourceId = identityCandidates[0]?.value && deps.isVerifiedImportIdentityKey(identityCandidates[0]?.key)
        ? identityCandidates[0].value
        : "";
      const playerSourceId = deps.buildPlayerSourceId(mappedRow, map);
      const sourceRecordId = deps.buildRecordSourceId(mappedRow, map, playerSourceId);
      const age = deps.parseMetricValue(mappedRow[map.age]) ?? "";
      const matches = deps.parseMetricValue(mappedRow[map.matches]) ?? "";
      const minutes = Math.max(0, Math.round(deps.parseMetricValue(mappedRow[map.minutes]) || 0));
      const dateOfBirth = deps.normalizeDateValue(mappedRow[map.dateOfBirth]);
      const mergeKey = deps.getImportMergeKey(sourceSystem, playerSourceId, season, league, team);
      const metricValues = {};
      for (const metricColumn of metricColumns) {
        const rawValue = columnar ? row[metricColumn.index] : row?.[metricColumn.metric.label];
        const value = deps.parseMetricValue(rawValue);
        const quality = deps.getImportMetricQuality(rawValue, minutes);
        if (Number.isFinite(value) && quality !== "missing") {
          metricValues[metricColumn.metric.id] = { value, quality };
        }
      }
      const sourceTrace = {
        sourceSystem,
        sourceFileName: draft.fileName || "",
        sheetName: sheet.name,
        sourceRowNumber: rowIndex + 2,
        uploadedAt: importedAt,
        importedAt,
        importBatchId: "",
        playerIdentityId: playerSourceId,
        sourcePlayerAlias: player,
        identitySource: mappedPlayerSourceId ? identityCandidates[0]?.key || "playerSourceId" : "derived",
        identitySourceLabel: mappedPlayerSourceId
          ? identityCandidates[0]?.label || "mapped source id"
          : "name + date of birth + nationality",
        identityCandidateCount: identityCandidates.length,
        identityCandidates: identityCandidates.map(({ key, label, value }) => ({ key, label, value })),
        identityBasis: mappedPlayerSourceId
          ? `mapped ${identityCandidates[0]?.label || "player id"}`
          : "name + date of birth + nationality",
        sourceRecordId,
        mergeKey,
      };
      return [
        sourceRecordId,
        player,
        teamWithinTimeframe,
        team,
        league,
        season,
        position,
        age,
        matches,
        minutes,
        deps.normalizeText(mappedRow[map.birthCountry], 120),
        deps.normalizeText(mappedRow[map.passportCountry], 120),
        deps.normalizeText(mappedRow[map.height], 40),
        deps.normalizeText(mappedRow[map.weight], 40),
        metricValues,
        sourceSystem,
        playerSourceId,
        sourceRecordId,
        deps.normalizeText(mappedRow[map.imageUrl], 220),
        playerSourceId,
        sourceTrace,
        {},
        dateOfBirth,
      ];
    }

    const sheetContexts = sheets.map((sheet) => {
      const headerIndex = sheet.rowFormat === "columns"
        ? Object.fromEntries((Array.isArray(sheet.headers) ? sheet.headers : []).map((header, index) => [header, index]))
        : {};
      return {
        sheet,
        headerIndex,
        metricColumns: metrics
          .map((metric) => ({ metric, index: headerIndex[metric.label] }))
          .filter(({ index }) => sheet.rowFormat !== "columns" || Number.isInteger(index)),
      };
    });
    const totalRows = sheetContexts.reduce((sum, { sheet }) => sum + (Array.isArray(sheet.rows) ? sheet.rows.length : 0), 0);
    let processedRows = 0;
    for (const sheetContext of sheetContexts) {
      const rows = Array.isArray(sheetContext.sheet.rows) ? sheetContext.sheet.rows : [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (options.signal?.aborted) throw new DOMException("Scouting import preparation was cancelled.", "AbortError");
        const record = buildRecord(rows[rowIndex], rowIndex, sheetContext);
        if (record) {
          const mergeKey = getRecordMergeKey(record);
          if (recordsByMergeKey.has(mergeKey)) {
            incomingDuplicates += 1;
            if (duplicateSamples.length < 6) {
              const kept = preferRecord(record, recordsByMergeKey.get(mergeKey));
              const dropped = kept === record ? recordsByMergeKey.get(mergeKey) : record;
              duplicateSamples.push({
                name: deps.getRecordName(record),
                team: deps.getRecordTeam(record),
                league: deps.getRecordLeague(record),
                season: deps.getRecordSeason(record),
                keptMinutes: deps.getRecordMinutes(kept),
                droppedMinutes: deps.getRecordMinutes(dropped),
              });
            }
          }
          recordsByMergeKey.set(mergeKey, preferRecord(record, recordsByMergeKey.get(mergeKey)));
        }
        processedRows += 1;
        if (processedRows % 250 === 0) {
          if (processedRows % 1000 === 0) options.onProgress?.({ completed: processedRows, total: totalRows });
          await yieldWork();
        }
      }
    }

    const records = [...recordsByMergeKey.values()];
    const metricSignature = deps.buildCollectionHash(
      metrics.map((metric) => `${metric.id}:${metric.label}:${metric.direction}:${metric.sourceColumn}`)
    );
    const recordSignature = deps.buildCollectionHash([
      draft.sourceChecksumSha256 || "",
      draft.fileName,
      sourceSystem,
      draft.seasonOverride || "",
      JSON.stringify(draft.map || {}),
      records.length,
      incomingDuplicates,
    ]);
    const importSignature = deps.buildCollectionHash([
      draft.fileName,
      sheets.map((sheet) => sheet.name).join("~"),
      sourceSystem,
      draft.seasonOverride || "",
      JSON.stringify(draft.map || {}),
      records.length,
      metrics.length,
      metricSignature,
      recordSignature,
    ]);
    return {
      source: "ui-import",
      fileName: draft.fileName,
      importedAt,
      sheets: sheets.map((sheet) => sheet.name),
      metrics,
      records,
      importSignature,
      importContentSignature: recordSignature,
      dedupeSummary: {
        incomingDuplicates,
        duplicateSamples,
        mergeStrategy: "sourceSystem + playerId + season + league + team",
      },
    };
  }

  return { build };
}
