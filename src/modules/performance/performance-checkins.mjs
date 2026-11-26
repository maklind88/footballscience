import { dateLabel } from "./performance-overview.mjs";

const format = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const wellnessFields = [
  ["score", "Wellness / 100"], ["sleepDuration", "Sleep duration"], ["sleepQuality", "Sleep quality"],
  ["fatigue", "Fatigue"], ["soreness", "Soreness"], ["stress", "Stress"],
];
const text = (value, escape) => value == null ? "—" : escape(String(typeof value === "number" ? format.format(value) : value));

export function createPerformanceCheckins(api, render) {
  let current;
  let request;
  let selectedActivity = "";

  function reset({ keepActivity = false } = {}) {
    request?.abort();
    request = null;
    current = null;
    if (!keepActivity) selectedActivity = "";
  }

  function getView(week, date, playerId) {
    const key = JSON.stringify([week, playerId]);
    if (current?.key !== key) {
      request?.abort();
      request = new AbortController();
      const state = { key, week, phase: "loading", message: "" };
      current = state;
      void api.readCheckins(week, playerId, request.signal).then((data) => {
        if (current !== state) return;
        Object.assign(state, data, { phase: "ready" });
        render();
      }, (error) => {
        if (current !== state) return;
        Object.assign(state, { phase: "error", message: error.message });
        render();
      });
    }
    const activities = current.activities ?? [];
    const activity = activities.find(({ id }) => id === selectedActivity)
      ?? activities.find((item) => item.date === date) ?? activities.at(0);
    return { ...current, date, playerId, activity };
  }

  function selectActivity(value) {
    if (current?.saving || !current?.activities?.some(({ id }) => id === value)) return false;
    selectedActivity = value;
    current.message = "";
    return true;
  }

  async function save(form) {
    const state = current;
    if (state?.phase !== "ready" || state.saving) return;
    const values = new FormData(form);
    const playerIds = values.getAll("playerId");
    const activityId = form.dataset.prRpeActivity;
    const forAccount = form.hasAttribute("data-pr-account-form");
    const unlink = form.dataset.prAccountForm === "unlink";
    if (!forAccount && !playerIds.length) {
      state.message = "Select at least one linked player.";
      render();
      return;
    }
    state.saving = true;
    state.message = "";
    render();
    try {
      if (forAccount) {
        const playerId = form.dataset.prAccountPlayer;
        const data = await api.manageAccount(state.week, playerId, unlink ? null : values.get("email"));
        if (current !== state) return;
        state.linkedPlayerIds = state.linkedPlayerIds.filter((id) => id !== playerId);
        if (data.linked) state.linkedPlayerIds.push(playerId);
        state.message = data.linked ? "The account is linked to this Squad profile." : "The account link was removed.";
      } else {
        const data = await api.openRpe(state.week, activityId, playerIds);
        if (current !== state) return;
        const date = state.activities.find(({ id }) => id === activityId).date;
        const existing = new Set(state.rpe.filter((row) => row.activityId === activityId).map(({ playerId }) => playerId));
        state.rpe.push(...data.opened.filter((id) => !existing.has(id)).map((playerId) =>
          ({ playerId, activityId, date, rating: null })));
        state.message = data.opened.length ? `${data.opened.length} players can open RPE in My Performance.`
          : "No check-ins were opened. Refresh to check account links.";
      }
    } catch (error) {
      if (current === state) state.message = error.message;
    } finally {
      state.saving = false;
      if (current === state) render();
    }
  }

  return { getView, reset, selectActivity, save };
}

function renderWellness({ wellness, players, playerId, date }, escape) {
  const byPlayer = new Map(players.map((player) => [player.id, player]));
  const rows = playerId ? wellness : wellness.filter((entry) => entry.date === date);
  const answerCount = playerId ? `${rows.length} days recorded` : `${rows.length} of ${players.length} players recorded`;
  const average = !playerId && rows.length ? rows.reduce((total, { score }) => total + score, 0) / rows.length : null;
  return `<section class="pr-checkin-section pr-panel">
    <header class="pr-panel-head"><div><h2>Wellness</h2><p>${answerCount}</p></div>
      ${average !== null ? `<strong>${format.format(average)} / 100 <small>Squad average</small></strong>` : ""}</header>
    ${rows.length ? `<div class="pr-table-wrap" tabindex="0" role="region" aria-label="Scrollable Wellness records">
      <table class="pr-table pr-checkin-table"><thead><tr><th scope="col">${playerId ? "Day" : "Player"}</th>
        ${wellnessFields.map(([, label]) => `<th scope="col">${label}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr><th scope="row">
        ${playerId ? dateLabel(row.date) : escape(byPlayer.get(row.playerId)?.name ?? "Player")}</th>
        ${wellnessFields.map(([key]) => `<td>${text(row[key], escape)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>` : '<p class="pr-placeholder">No Wellness records for this selection.</p>'}
  </section>`;
}

function renderAccount({ canManageAccounts, playerId, linkedPlayerIds, saving }, escape) {
  if (!canManageAccounts || !playerId) return "";
  const linked = linkedPlayerIds.includes(playerId);
  return `<section class="pr-checkin-section pr-panel">
    <header class="pr-panel-head"><div><h2>Player account</h2><p>${linked ? "Linked to this Squad profile" : "No eligible account linked"}</p></div></header>
    <form data-pr-account-form="${linked ? "unlink" : "link"}" data-pr-account-player="${escape(playerId)}">
      ${linked ? "" : `<label class="pr-plan-select"><span>Verified player email</span>
        <input type="email" name="email" required maxlength="254" autocomplete="off"${saving ? " disabled" : ""}></label>
        <p class="pr-footnote">Use the verified email of the player's existing Guest account.</p>`}
      <button type="submit" class="pr-source" data-pr-focus="account-submit"${saving ? " disabled" : ""}>${linked ? "Unlink account" : "Link account"}</button>
    </form>
  </section>`;
}

function renderRpe({ activity, activities, rpe, players, linkedPlayerIds, saving }, escape) {
  const responses = new Map(rpe.filter(({ activityId }) => activityId === activity?.id).map((row) => [row.playerId, row]));
  const ratings = [...responses.values()].map(({ rating }) => rating).filter(Number.isInteger);
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
  const linked = new Set(linkedPlayerIds);
  const selectable = (id) => activity?.canOpen !== false && linked.has(id) && !responses.has(id);
  return `<section class="pr-checkin-section pr-panel">
    <header class="pr-panel-head">
      <div><h2>Session RPE</h2><p>${ratings.length} / ${responses.size} assigned players answered</p></div>
      ${average !== null ? `<strong>${format.format(average)} / 10 <small>Average response</small></strong>` : ""}
    </header>
    ${activity ? `<label class="pr-plan-select"><span>Activity</span>
      <select data-pr-checkin-activity data-pr-focus="checkin-activity"${saving ? " disabled" : ""}>
      ${activities.map(({ id, date, title }) => `<option value="${escape(id)}"${activity.id === id ? " selected" : ""}>${dateLabel(date)} · ${escape(title)}</option>`).join("")}</select></label>
      <form data-pr-rpe-form data-pr-rpe-activity="${escape(activity.id)}">
        <div class="pr-table-wrap" tabindex="0" role="region" aria-label="Scrollable RPE responses">
          <table class="pr-table pr-checkin-table"><thead><tr><th scope="col">Player</th><th scope="col">Response</th>
            <th scope="col"><label><input type="checkbox" data-pr-rpe-all${saving || !players.some(({ id }) => selectable(id)) ? " disabled" : ""}> Select all eligible</label></th></tr></thead>
          <tbody>${players.map(({ id, name }) => {
            const response = responses.get(id);
            const answered = Number.isInteger(response?.rating);
            const state = !linked.has(id) ? "Account not linked" : response ? "Awaiting response" : "Not opened";
            return `<tr><th scope="row">${escape(name)}</th>
              <td>${answered ? `<strong>${response.rating} / 10</strong>` : state}</td>
              <td>${!selectable(id) ? "—" : `<input type="checkbox" name="playerId" value="${escape(id)}" aria-label="Open RPE for ${escape(name)}"${saving ? " disabled" : ""}>`}</td></tr>`;
          }).join("")}</tbody></table>
        </div>
        ${activity.canOpen === false ? '<p class="pr-footnote">RPE opens after the activity.</p>' : ""}
        <button class="pr-plan-primary" type="submit" data-pr-focus="open-rpe"${saving || !players.some(({ id }) => selectable(id)) ? " disabled" : ""}>Open RPE for completed session</button>
      </form>`
      : '<p class="pr-placeholder">No saved training, recovery or match activity this week.</p>'}
  </section>`;
}

export function renderPerformanceCheckins(view, escape) {
  if (view.phase === "loading") return '<p role="status" class="pr-placeholder">Loading player check-ins…</p>';
  if (view.phase === "error") return `<p role="status" class="pr-placeholder">${escape(view.message)}</p>
    <button type="button" class="pr-link" data-pr-action="checkins-refresh">Try again</button>`;
  return `<div class="pr-checkin-toolbar">
    <label class="pr-plan-select"><span>Player</span>
      <select data-pr-checkin-player data-pr-focus="checkin-player">
        <option value="">All players</option>
        ${view.players.map(({ id, name }) => `<option value="${escape(id)}"${view.playerId === id ? " selected" : ""}>${escape(name)}</option>`).join("")}
      </select></label>
    <a class="pr-source" href="/src/modules/performance/rpe-response.html" target="_blank" rel="noopener">My Performance ↗</a>
    <button type="button" class="pr-source" data-pr-action="checkins-refresh" data-pr-focus="checkins-refresh">Refresh responses</button>
  </div>
  <p class="pr-footnote" role="status">${escape(view.saving ? "Saving…" : view.message)}</p>
  <div class="pr-checkin-layout">${renderWellness(view, escape)}${renderRpe({ ...view, players: view.players.filter(({ id }) => !view.playerId || id === view.playerId) }, escape)}</div>
  ${renderAccount(view, escape)}`;
}
