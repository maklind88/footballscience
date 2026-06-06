export function renderScoutingComparisonWorkspace(deps = {}) {
  const {
    canEdit: canEditScoutingWorkspace,
    ensureState: ensureScoutingState,
    escapeHtml,
    formatNumber: formatScoutingNumber,
    getComparisonCachedRecordById: getScoutingComparisonCachedRecordById,
    getComparisonLab: getScoutingComparisonLab,
    getIntelligenceProfile: getScoutingIntelligenceProfile,
    getMetric: getScoutingMetric,
    getMetricOptions: getScoutingMetricOptions,
    getMetricValue: getScoutingMetricValue,
    getPercentile: getScoutingPercentile,
    getRecordAvatar: renderScoutingRecordAvatar,
    getRecordById: getScoutingRecordById,
    getRecordId: getScoutingRecordId,
    getRecordLeague: getScoutingRecordLeague,
    getRecordMinutes: getScoutingRecordMinutes,
    getRecordName: getScoutingRecordName,
    getRecordPosition: getScoutingRecordPosition,
    getRecordTeam: getScoutingRecordTeam,
    normalizeText: normalizeScoutingText,
    renderComparisonRadarOverlay: renderScoutingComparisonRadarOverlay,
  } = deps;
  const scoutingComparisonCandidatesOpen = Boolean(deps.comparisonCandidatesOpen);
  const scoutingComparisonMetricFilterQuery = deps.comparisonMetricFilterQuery || "";
  const scoutingComparisonMetricMenuOpen = Boolean(deps.comparisonMetricMenuOpen);
  const scoutingComparisonPlayerSearchQuery = deps.comparisonPlayerSearchQuery || "";
  const scoutingComparisonSearchCache = deps.comparisonSearchCache || {};
  const state = ensureScoutingState();
  const lab = getScoutingComparisonLab(state);
  const metricOptions = getScoutingMetricOptions();
  const selectedMetricIds = Array.from(
    new Set((Array.isArray(lab.metricIds) ? lab.metricIds : []).map((metricId) => normalizeScoutingText(metricId, 120)).filter(Boolean))
  ).filter((metricId) => metricOptions.some((metricOption) => metricOption.id === metricId));
  const comparisonMetricIds = selectedMetricIds;
  const selectedMetricOptions = comparisonMetricIds.map((metricId) => getScoutingMetric(metricId)).filter(Boolean);
  const metric = selectedMetricOptions[0] || null;
  const metricLabelText = selectedMetricOptions.length ? selectedMetricOptions.map((item) => item.label).join(", ") : "selected metrics";
  const comparisonMetricQuery = scoutingComparisonMetricFilterQuery.toLowerCase();
  const comparisonMetricChoices = comparisonMetricQuery
    ? metricOptions.filter((metricOption) => `${metricOption.label} ${metricOption.id}`.toLowerCase().includes(comparisonMetricQuery))
    : metricOptions;
  const comparisonMetricChoiceIds = new Set([
    ...comparisonMetricIds,
    ...comparisonMetricChoices.map((metricOption) => metricOption.id),
  ]);
  const visibleComparisonMetricOptions = metricOptions.filter((metricOption) => comparisonMetricChoiceIds.has(metricOption.id));
  const metricChoiceMarkup = visibleComparisonMetricOptions
    .map(
      (metricOption) => `
        <label>
          <input type="checkbox" name="metricIds" value="${escapeHtml(metricOption.id)}" ${comparisonMetricIds.includes(metricOption.id) ? "checked" : ""} data-scouting-comparison-metric-checkbox ${canEditScoutingWorkspace() ? "" : "disabled"} />
          <span>${escapeHtml(metricOption.label)}</span>
        </label>
      `
    )
    .join("");
  const selectedPlayerIds = (lab.playerIds || []).map((recordId) => normalizeScoutingText(recordId, 160));
  const searchRecords = Array.isArray(scoutingComparisonSearchCache.records) ? scoutingComparisonSearchCache.records : [];
  const candidateRecords = scoutingComparisonPlayerSearchQuery.length >= 2 ? searchRecords : [];
  const candidateMap = new Map();
  candidateRecords.forEach((record) => {
    const recordId = getScoutingRecordId(record);
    if (recordId && !candidateMap.has(recordId)) {
      candidateMap.set(recordId, record);
    }
  });
  const candidates = Array.from(candidateMap.values());
  const uniquePlayerIds = Array.from(new Set(selectedPlayerIds.filter(Boolean))).slice(0, 4);
  const selectedComparisonPlayerSet = new Set(uniquePlayerIds);
  const playerRecords = uniquePlayerIds
    .map((recordId) => ({
      recordId,
      record: getScoutingRecordById(recordId) || getScoutingComparisonCachedRecordById(recordId),
    }))
    .filter(({ record }) => Boolean(record));
  const canCompare = playerRecords.length >= 2;
  const canScoreCompare = canCompare && selectedMetricOptions.length > 0;
  const comparisonSnapshot = canCompare
    ? playerRecords.map(({ record }) => ({
        record,
        value: getScoutingMetricValue(record, metric?.id),
        percentile: metric ? getScoutingPercentile(record, metric.id) : null,
      }))
    : [];
  const comparisonLeader = comparisonSnapshot
    .filter((entry) => Number.isFinite(entry.percentile))
    .sort((a, b) => b.percentile - a.percentile)[0];
  const metricDelta =
    canCompare && comparisonLeader
      ? `${escapeHtml(getScoutingRecordName(comparisonLeader.record))} leads ${escapeHtml(metric?.label || "selected metric")} at P${escapeHtml(comparisonLeader.percentile)}`
      : "";
  const comparisonDecisionRows = canScoreCompare
    ? playerRecords
        .map(({ record }) => {
          const metricEntries = selectedMetricOptions.map((selectedMetric) => {
            const percentile = getScoutingPercentile(record, selectedMetric.id);
            return {
              metric: selectedMetric,
              value: getScoutingMetricValue(record, selectedMetric.id),
              percentile,
            };
          });
          const finitePercentiles = metricEntries.map((entry) => entry.percentile).filter((percentile) => Number.isFinite(percentile));
          const metricScore = finitePercentiles.length
            ? Math.round(finitePercentiles.reduce((sum, percentile) => sum + percentile, 0) / finitePercentiles.length)
            : null;
          const bestSelectedMetric = metricEntries
            .filter((entry) => Number.isFinite(entry.percentile))
            .sort((a, b) => b.percentile - a.percentile)[0] || null;
          const intelligence = getScoutingIntelligenceProfile(record, state);
          const selectedValue = getScoutingMetricValue(record, metric?.id);
          const selectedPercentile = metric ? getScoutingPercentile(record, metric.id) : null;
          return {
            record,
            metricScore,
            metricEntries,
            bestSelectedMetric,
            intelligence,
            selectedValue,
            selectedPercentile,
          };
        })
        .sort((a, b) => (b.metricScore || 0) - (a.metricScore || 0) || (b.selectedPercentile || 0) - (a.selectedPercentile || 0))
    : [];
  const comparisonRecommendation = comparisonDecisionRows[0];
  const comparisonMetricRows = canScoreCompare
    ? selectedMetricOptions
        .map((selectedMetric) => {
          const values = playerRecords
            .map(({ record }) => ({
              record,
              value: getScoutingMetricValue(record, selectedMetric.id),
              percentile: getScoutingPercentile(record, selectedMetric.id),
            }))
            .filter((entry) => Number.isFinite(entry.percentile));
          const winner = [...values].sort((a, b) => b.percentile - a.percentile)[0];
          return winner
            ? {
                label: selectedMetric.label,
                metric: selectedMetric,
                winner,
                values,
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const comparisonTableMetrics = canScoreCompare
    ? Array.from(
        new Map(
          selectedMetricOptions
            .map((metricOption) => ({ metricId: metricOption.id, label: metricOption.label }))
            .filter((item) => item?.metricId)
            .map((item) => [item.metricId, item])
        ).values()
      ).slice(0, 12)
    : [];
  const comparisonRunnerUp = comparisonDecisionRows[1] || null;
  const comparisonScoreGap =
    comparisonRecommendation && comparisonRunnerUp && Number.isFinite(comparisonRecommendation.metricScore) && Number.isFinite(comparisonRunnerUp.metricScore)
      ? comparisonRecommendation.metricScore - comparisonRunnerUp.metricScore
      : null;
  const comparisonCoverageCount = comparisonDecisionRows.reduce(
    (sum, entry) => sum + entry.metricEntries.filter((metricEntry) => Number.isFinite(metricEntry.percentile)).length,
    0
  );
  const comparisonCoverageTotal = Math.max(1, comparisonDecisionRows.length * Math.max(1, selectedMetricOptions.length));
  const comparisonCoveragePercent = Math.round((comparisonCoverageCount / comparisonCoverageTotal) * 100);
  const comparisonConclusion =
    canScoreCompare && comparisonRecommendation
      ? `${getScoutingRecordName(comparisonRecommendation.record)} leder jämförelsen${Number.isFinite(comparisonScoreGap) ? ` med ${comparisonScoreGap} percentile-poäng` : ""}. ${
          comparisonRecommendation.bestSelectedMetric
            ? `Starkaste datapunkten är ${comparisonRecommendation.bestSelectedMetric.metric.label} på P${comparisonRecommendation.bestSelectedMetric.percentile}.`
            : "Datatäckningen är begränsad, så använd detta som en första indikation."
        }`
      : canCompare
        ? "Välj metrics för att skapa en riktig jämförelse mellan spelarna."
        : "Sök fram minst två spelare och välj metrics för att få vinnare, spider, tabell och slutsats.";
  const canEdit = canEditScoutingWorkspace();
  const selectedSlotMarkup = [0, 1, 2, 3]
    .map((slotIndex) => {
      const recordId = uniquePlayerIds[slotIndex] || "";
      const record = recordId ? getScoutingRecordById(recordId) || getScoutingComparisonCachedRecordById(recordId) : null;
      return record
        ? `
          <article class="scouting-comparison-selected-player">
            ${renderScoutingRecordAvatar(record)}
            <div>
              <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
              <span>${escapeHtml(getScoutingRecordPosition(record) || "No position")} · ${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record) || "No club")}</span>
            </div>
            <button type="button" aria-label="Remove ${escapeHtml(getScoutingRecordName(record))}" data-remove-scouting-comparison-player="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>x</button>
          </article>
        `
        : `
          <article class="scouting-comparison-selected-player is-empty">
            <span>${escapeHtml(`Player ${slotIndex + 1}`)}</span>
            <strong>Search and add</strong>
          </article>
        `;
    })
    .join("");
  const comparisonSelectedDrawerList = uniquePlayerIds.length
    ? `
      <div class="scouting-comparison-drawer-section">
        <p class="placeholder-tag">Selected compare players</p>
        ${uniquePlayerIds
          .map((recordId) => {
            const record = getScoutingRecordById(recordId) || getScoutingComparisonCachedRecordById(recordId);
            return record
              ? `
                <article class="scouting-comparison-drawer-selected-card">
                  ${renderScoutingRecordAvatar(record)}
                  <span>
                    <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                    <em>${escapeHtml(getScoutingRecordPosition(record) || "No position")} · ${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record) || "No club")}</em>
                  </span>
                  <button type="button" aria-label="Remove ${escapeHtml(getScoutingRecordName(record))}" data-remove-scouting-comparison-player="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>Remove</button>
                </article>
              `
              : "";
          })
          .join("")}
      </div>
    `
    : `<p class="scouting-comparison-drawer-empty">No players selected yet. Search below to add two to four players.</p>`;
  const comparisonCandidateList = scoutingComparisonCandidatesOpen || scoutingComparisonPlayerSearchQuery
    ? `
      <div class="scouting-comparison-candidate-drawer" data-scouting-comparison-candidate-area role="listbox" aria-label="Comparison player search results">
        ${scoutingComparisonCandidatesOpen ? comparisonSelectedDrawerList : ""}
        ${
          candidates.length
            ? candidates
                .map((record) => {
                  const recordId = getScoutingRecordId(record);
                  const selected = selectedComparisonPlayerSet.has(recordId);
                  const addDisabled = !canEdit || (!selected && uniquePlayerIds.length >= 4);
                  return `
                    <button
                      type="button"
                      class="scouting-comparison-candidate-card${selected ? " is-selected" : ""}"
                      data-add-scouting-comparison-player="${escapeHtml(recordId)}"
                      role="option"
                      aria-selected="${selected ? "true" : "false"}"
                      ${selected || addDisabled ? "disabled" : ""}
                    >
                      ${renderScoutingRecordAvatar(record)}
                      <span class="scouting-comparison-candidate-main">
                        <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                        <span>${escapeHtml(getScoutingRecordPosition(record) || "No position")} · ${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record) || "No club")}</span>
                      </span>
                      <span class="scouting-comparison-candidate-action">${escapeHtml(selected ? "Added" : uniquePlayerIds.length >= 4 ? "Full" : "Add")}</span>
                    </button>
                  `;
                })
                .join("")
            : scoutingComparisonPlayerSearchQuery.length < 2
              ? `<p class="scouting-muted">Type at least two letters to search the full scouting database.</p>`
              : scoutingComparisonSearchCache.status === "loading"
                ? `<p class="scouting-muted">Searching the full scouting database...</p>`
                : `<p class="scouting-muted">${escapeHtml(scoutingComparisonSearchCache.error || "No matching players found.")}</p>`
        }
      </div>
    `
    : "";
  return `
    <section class="scouting-comparison-lab scouting-comparison-studio">
      <div class="scouting-comparison-head">
        <div>
          <p class="placeholder-tag">Player comparison</p>
          <h2>Comparison lab</h2>
        </div>
        <button type="button" class="scouting-comparison-candidate-toggle${scoutingComparisonCandidatesOpen ? " is-open" : ""}" data-toggle-scouting-comparison-candidates>
          ${escapeHtml(uniquePlayerIds.length)}/4 compared
        </button>
      </div>
      <form class="scouting-comparison-form scouting-comparison-search" data-scouting-comparison-form>
        <div class="scouting-comparison-player-search-wrap">
          <label class="scouting-comparison-player-search-field">
            Search player
            <input
              type="search"
              value="${escapeHtml(scoutingComparisonPlayerSearchQuery)}"
              placeholder="Search name, club, league..."
              autocomplete="off"
              data-scouting-comparison-player-search
              ${canEdit ? "" : "disabled"}
            />
          </label>
          ${comparisonCandidateList}
        </div>
        <fieldset class="scouting-comparison-metric-choice">
          <legend>Metrics</legend>
          <details data-scouting-comparison-metric-details ${scoutingComparisonMetricMenuOpen ? "open" : ""}>
            <summary data-scouting-comparison-metric-summary>
              <span>${escapeHtml(selectedMetricOptions.length ? selectedMetricOptions.map((item) => item.label).join(", ") : "Choose metrics")}</span>
              <em>${escapeHtml(selectedMetricOptions.length || 0)} selected</em>
            </summary>
            <div class="scouting-comparison-metric-search">
              <input
                type="search"
                value="${escapeHtml(scoutingComparisonMetricFilterQuery)}"
                placeholder="Search metric..."
                data-scouting-comparison-metric-search
              />
            </div>
            <div class="scouting-comparison-metric-options">
              ${metricChoiceMarkup || `<p class="scouting-muted">No metrics match this search.</p>`}
            </div>
          </details>
        </fieldset>
      </form>
      <div class="scouting-comparison-selected-grid">
        ${selectedSlotMarkup}
      </div>
      <p class="scouting-comparison-summary">
        ${selectedMetricOptions.length ? `Metrics: ${escapeHtml(metricLabelText)}` : "Select metrics"} ${canScoreCompare && metricDelta ? `· ${metricDelta}` : "· Decision is based only on selected players and selected metrics"}
      </p>
      ${
        canCompare
          ? `
            <div class="scouting-comparison-decision">
              <div class="is-winner">
                <span>Winner</span>
                <strong>${escapeHtml(comparisonRecommendation ? getScoutingRecordName(comparisonRecommendation.record) : "No winner yet")}</strong>
                <p>${escapeHtml(canScoreCompare ? `Best average across ${selectedMetricOptions.length} selected metric${selectedMetricOptions.length === 1 ? "" : "s"}.` : "Choose metrics before a winner can be calculated.")}</p>
              </div>
              <div>
                <span>Score gap</span>
                <strong>${Number.isFinite(comparisonScoreGap) ? `${escapeHtml(comparisonScoreGap)} pts` : "n/a"}</strong>
                <p>${escapeHtml(comparisonRunnerUp ? `Runner-up: ${getScoutingRecordName(comparisonRunnerUp.record)}.` : "Add another scored player to separate the field.")}</p>
              </div>
              <div>
                <span>Data coverage</span>
                <strong>${escapeHtml(comparisonCoveragePercent)}%</strong>
                <p>${escapeHtml(`${comparisonCoverageCount}/${comparisonCoverageTotal} player-metric cells have percentile data.`)}</p>
              </div>
              <div class="is-conclusion">
                <span>Short conclusion</span>
                <strong>${escapeHtml(comparisonRecommendation ? "Decision note" : "Next step")}</strong>
                <p>${escapeHtml(comparisonConclusion)}</p>
              </div>
            </div>
          `
          : ""
      }
      ${canCompare ? renderScoutingComparisonRadarOverlay(playerRecords, selectedMetricOptions) : ""}
      <div class="scouting-comparison-results">
        ${
          canCompare
            ? comparisonDecisionRows
                .map((entry) => {
                  return `
                    <article class="scouting-target-card">
                      <div class="scouting-target-main">
                        <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                        <span>${Number.isFinite(entry.metricScore) ? `Metric avg P${escapeHtml(entry.metricScore)}` : "No metric score"}</span>
                      </div>
                      <p class="scouting-fit-line">${escapeHtml(getScoutingRecordTeam(entry.record) || "No club")} · ${escapeHtml(getScoutingRecordPosition(entry.record) || "No position")} · ${escapeHtml(formatScoutingNumber(getScoutingRecordMinutes(entry.record)))} minutes</p>
                      <p class="scouting-fit-line">${escapeHtml(metric?.label || "Metric")}: ${escapeHtml(formatScoutingNumber(entry.selectedValue))}${entry.selectedPercentile ? ` · P${escapeHtml(entry.selectedPercentile)}` : ""}</p>
                      <p class="scouting-note-line">Best selected metric: ${escapeHtml(entry.bestSelectedMetric ? `${entry.bestSelectedMetric.metric.label} · P${entry.bestSelectedMetric.percentile}` : "No selected metric data")}</p>
                      <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">Open profile</button>
                    </article>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">Select two to four players, then choose the metrics you want to compare.</p>`
        }
      </div>
      ${
        canCompare && comparisonTableMetrics.length
          ? `
            <div class="scouting-comparison-table" style="--comparison-player-columns:${escapeHtml(playerRecords.length)};">
              <div class="scouting-comparison-table-head">
                <span>Metric</span>
                ${playerRecords.map(({ record }) => `<span>${escapeHtml(getScoutingRecordName(record))}</span>`).join("")}
                <span>Winner</span>
              </div>
              ${comparisonTableMetrics
                .map((tableMetric) => {
                  const values = playerRecords.map(({ record }) => ({
                    record,
                    value: getScoutingMetricValue(record, tableMetric.metricId),
                    percentile: getScoutingPercentile(record, tableMetric.metricId),
                  }));
                  const winner = values.filter((entry) => Number.isFinite(entry.percentile)).sort((a, b) => b.percentile - a.percentile)[0];
                  return `
                    <div class="scouting-comparison-table-row">
                      <strong>${escapeHtml(tableMetric.label)}</strong>
                      ${values
                        .map(
                          (entry) => `
                            <span>
                              ${escapeHtml(formatScoutingNumber(entry.value))}
                              ${Number.isFinite(entry.percentile) ? `<em>P${escapeHtml(entry.percentile)}</em>` : `<em>No data</em>`}
                            </span>
                          `
                        )
                        .join("")}
                      <span>${escapeHtml(winner ? getScoutingRecordName(winner.record) : "No data")}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : ""
      }
      ${
        canCompare
          ? `
            <div class="scouting-comparison-winners">
              <h3>Who wins what</h3>
              <div>
                ${comparisonMetricRows
                  .map(
                    (row) => `
                      <article>
                        <span>${escapeHtml(row.label)}</span>
                        <strong>${escapeHtml(getScoutingRecordName(row.winner.record))}</strong>
                        <em>${escapeHtml(row.metric?.label || "Metric")} · P${escapeHtml(row.winner.percentile)} · ${escapeHtml(formatScoutingNumber(row.winner.value))}</em>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}
