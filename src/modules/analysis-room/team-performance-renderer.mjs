const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const count = (value) => Number(value || 0).toLocaleString("en-GB");
const rate = (completed, total) => total ? `${(100 * completed / total).toFixed(1)}%` : "-";
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";
const views = [["overview", "Overview"], ["matches", "Matches"], ["players", "Players"], ["zones", "Zones & corridors"], ["events", "Events"]];

function selectFilter(label, key, values, state) {
  return `<div class="team-performance-filter"><label for="performance-filter-${key}">${label}</label><select id="performance-filter-${key}" data-performance-filter="${key}" ${state.busy ? "disabled" : ""}>
    ${values.map(([value, title]) => `<option value="${escape(value)}" ${String(state.filters[key] || "") === String(value) ? "selected" : ""}>${escape(title)}</option>`).join("")}
  </select></div>`;
}
function matchLabel(snapshot, number) {
  const match = snapshot.matches?.find((row) => row.matchNumber === Number(number));
  return match ? `#${number} ${match.opponent}` : `#${number}`;
}
function table(headers, rows, label) {
  if (!rows.length) return `<p class="team-performance-empty">No matching events.</p>`;
  return `<div class="team-performance-table-scroll" tabindex="0" role="region" aria-label="${label}"><table><thead><tr>${headers.map((heading) => `<th scope="col">${heading}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function matchTable(data) {
  return table(["Match", "Venue", "Events", "Completed", "Completion"], (data.byMatch || []).map((row) => [
    `<button class="team-performance-link" type="button" data-performance-match="${row.matchNumber}">${escape(matchLabel(data, row.matchNumber))}</button>`,
    escape(data.matches?.find((match) => match.matchNumber === row.matchNumber)?.homeAway),
    count(row.events), count(row.completed), rate(row.completed, row.events),
  ]), "Match statistics");
}
function bars(data) {
  const zones = new Map();
  for (const row of data.zones || []) {
    const zone = zones.get(row.category) || { events: 0, completed: 0 };
    zone.events += Number(row.events); zone.completed += Number(row.completed);
    zones.set(row.category, zone);
  }
  return `<div class="team-performance-zone-bars">${[...zones].map(([name, row]) => `<div class="team-performance-zone-bar">
    <span>${escape(name)}</span><meter min="0" max="${row.events}" value="${row.completed}" aria-label="${escape(name)} completed events">${row.completed} of ${row.events}</meter>
    <strong>${rate(row.completed, row.events)}</strong><small>${count(row.completed)} / ${count(row.events)}</small></div>`).join("")}</div>`;
}
function content(state) {
  const data = state.snapshot;
  if (!data?.version) return `<p class="team-performance-empty">${state.busy ? "Loading statistics..." : state.error ? "Statistics unavailable." : "No imported statistics yet."}</p>`;
  if (state.view === "matches") return matchTable(data);
  if (state.view === "players") return `${data.players?.length === 100 ? '<p class="team-performance-source">Top 100 player involvements</p>' : ""}` + table(["Player", "Involvement", "Events", "Completed", "Completion"], (data.players || []).map((row) => [
    escape(row.name), row.role === "carrier" ? "Ball carrier" : "Receiver", count(row.events), count(row.completed), rate(row.completed, row.events),
  ]), "Player involvement statistics");
  if (state.view === "zones") return bars(data) + table(["Zone", "Into corridor", "Events", "Completed", "Completion"], (data.zones || []).map((row) => [
    escape(row.category), escape(row.corridor || "Unspecified"), count(row.events), count(row.completed), rate(row.completed, row.events),
  ]), "Zone and corridor statistics");
  if (state.view === "events") return table(["Match", "Time", "Event", "Outcome", "Ball carrier", "Receiver"], (data.events || []).map((row) => [
    escape(matchLabel(data, row.matchNumber)), escape(row.gameMinute == null ? row.periodThird || "-" : `${row.gameMinute.toFixed(1)} min`),
    escape(row.eventCategory), escape(row.outcome), escape(row.ballCarriers.join(", ") || "-"), escape(row.receivingPlayers.join(", ") || "-"),
  ]), "Tagged events") + `<footer class="team-performance-pagination"><span>${count(data.summary?.events)} events</span>
    <button type="button" data-performance-page="previous" ${state.busy || !state.filters.offset ? "disabled" : ""}>Previous</button>
    <span>Page ${Math.floor((state.filters.offset || 0) / 50) + 1}</span>
    <button type="button" data-performance-page="next" ${state.busy || !data.hasMore ? "disabled" : ""}>Next</button></footer>`;
  return `<section class="team-performance-section"><h4>Completion by zone</h4>${bars(data)}</section>
    <section class="team-performance-section"><h4>Match review</h4>${matchTable(data)}</section>`;
}
function importReview(state) {
  const preview = state.preview;
  if (!preview) return "";
  const decrease = preview.eventCount < preview.previousEventCount || preview.matchCount < preview.previousMatchCount;
  return `<section class="team-performance-import-review" aria-label="Import review">
    <div><h4>${preview.unchanged ? "Source is unchanged" : "Review source update"}</h4>
      <p>${count(preview.previousMatchCount)} to ${count(preview.matchCount)} matches · ${count(preview.previousEventCount)} to ${count(preview.eventCount)} events</p>
      ${decrease ? '<p class="team-performance-warning">The new version contains fewer matches or events. Earlier versions will remain available.</p>' : ""}
    </div><div class="team-performance-actions">
      <button type="button" data-performance-action="cancel" ${state.busy ? "disabled" : ""}>Cancel</button>
      ${preview.unchanged ? "" : `<button type="button" class="is-primary" data-performance-action="confirm" ${state.busy ? "disabled" : ""}>Import version</button>`}
    </div></section>`;
}

export function renderTeamPerformance(state) {
  const data = state.snapshot || {};
  const summary = data.summary || {};
  const players = [...new Set([...(data.playerOptions || []), state.filters.player].filter(Boolean))];
  return `<section class="team-performance" aria-label="Team Performance statistics" aria-busy="${Boolean(state.busy)}">
    <header class="team-performance-heading"><div><p class="team-performance-eyebrow">Match analysis</p><h3>Team Performance</h3>
      <p class="team-performance-source">${data.version ? `Imported ${escape(date(data.version.importedAt))} · Version ${data.version.revision}` : "NC Courage SOP"}</p></div>
      <div class="team-performance-actions"><button type="button" data-performance-action="reload" ${state.busy ? "disabled" : ""}>Reload</button>
        ${data.importAvailable ? `<button type="button" class="is-primary" data-performance-action="preview" ${state.busy ? "disabled" : ""}>Check source update</button>` : ""}
      </div></header>
    ${state.error ? `<p class="team-performance-error" role="alert">${escape(state.error)}</p>` : ""}
    <p class="team-performance-status" role="status">${escape(state.busy ? state.busyLabel : state.message)}</p>
    ${data.version && data.version.revision !== data.currentRevision ? '<p class="team-performance-warning">Viewing an earlier saved version.</p>' : ""}
    ${importReview(state)}
    ${data.version ? `<div class="team-performance-filters">
      ${selectFilter("Match", "match", [["", "All matches"], ...(data.matches || []).map((row) => [row.matchNumber, `#${row.matchNumber} ${row.opponent}`])], state)}
      ${selectFilter("Venue", "venue", [["", "Home & away"], ["Home", "Home"], ["Away", "Away"]], state)}
      ${selectFilter("Period", "period", [["", "Full match"], ["1st Half", "1st half"], ["2nd Half", "2nd half"]], state)}
      ${selectFilter("Event", "category", [["", "All zones"], ...["Zone 2", "Zone 3", "Zone 3.5", "Passing Zone", "Shooting Zone"].map((value) => [value, value])], state)}
      ${selectFilter("Outcome", "outcome", [["", "All outcomes"], ["Completed", "Completed"], ["Attempted", "Attempted"]], state)}
      ${selectFilter("Player", "player", [["", "All players"], ...players.map((value) => [value, value])], state)}
    </div><dl class="team-performance-metrics">
      <div><dt>Matches</dt><dd>${count(summary.matches)}</dd></div><div><dt>Tagged events</dt><dd>${count(summary.events)}</dd></div>
      <div><dt>Completed</dt><dd>${count(summary.completed)}</dd></div><div><dt>Completion</dt><dd>${rate(summary.completed, summary.events)}</dd></div>
    </dl><div class="team-performance-navigation"><nav aria-label="Performance views">${views.map(([id, label]) => `<button type="button" data-performance-view="${id}" ${id === state.view ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>
      ${selectFilter("Version", "versionId", [["", "Latest saved"], ...(data.history || []).map((row) => [row.id, `v${row.revision} · ${date(row.importedAt)}`])], state)}
    </div>` : ""}
    <div class="team-performance-content">${content(state)}</div>
  </section>`;
}
