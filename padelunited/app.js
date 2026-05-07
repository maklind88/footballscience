const STORAGE_KEY = "padel-united-state-v2";
const LEGACY_STORAGE_KEY = "padel-united-state-v1";
const ADMIN_KEY = "padel-united-admin-v3";
const START_RATING = 1000;
const K_FACTOR = 24;

const seedPlayers = ["ES", "IS", "RY", "BG", "AC", "MEK", "ET", "MZ", "FILIP"];

const seedMatches = [
  { date: "2026-01-27", teamA: ["ES", "IS"], teamB: ["BG", "RY"], result: "V", deltaA: 12, deltaB: -12 },
  { date: "2026-01-28", teamA: ["ES", "IS"], teamB: ["AC", "MEK"], result: "F", deltaA: -12, deltaB: 12 },
  { date: "2026-01-28", teamA: ["IS", "ET"], teamB: ["AC", "MEK"], result: "F", deltaA: -12, deltaB: 12 },
  { date: "2026-01-30", teamA: ["IS", "RY"], teamB: ["BG", "AC"], result: "F", deltaA: -11, deltaB: 11 },
  { date: "2026-02-02", teamA: ["IS", "ET"], teamB: ["BG", "AC"], result: "F", deltaA: -10.5, deltaB: 11 },
  { date: "2026-02-06", teamA: ["ES", "IS"], teamB: ["BG", "AC"], result: "F", deltaA: -10.25, deltaB: 10 },
  { date: "2026-02-11", teamA: ["ES", "IS"], teamB: ["AC", "MEK"], result: "F", deltaA: -10, deltaB: 10 },
  { date: "2026-02-21", teamA: ["IS", "BG"], teamB: ["AC", "MEK"], result: "F", deltaA: -10.125, deltaB: 10 },
  { date: "2026-02-22", teamA: ["IS", "BG"], teamB: ["AC", "MEK"], result: "F", deltaA: -9, deltaB: 9 },
  { date: "2026-02-25", teamA: ["ES", "MZ"], teamB: ["AC", "MEK"], result: "V", deltaA: 15.125, deltaB: -15 },
  { date: "2026-02-26", teamA: ["ES", "IS"], teamB: ["BG", "AC"], result: "F", deltaA: -9, deltaB: 9.5625 },
  { date: "2026-02-28", teamA: ["IS", "AC"], teamB: ["ET", "FILIP"], result: "F", deltaA: -12.84375, deltaB: 12.25 },
  { date: "2026-03-02", teamA: ["ES", "RY"], teamB: ["AC", "MEK"], result: "F", deltaA: -9.4375, deltaB: 9.640625 },
  { date: "2026-03-03", teamA: ["ES", "BG"], teamB: ["IS", "RY"], result: "V", deltaA: 9.5625, deltaB: -10.421875 },
  { date: "2026-03-09", teamA: ["ES", "MZ"], teamB: ["AC", "MEK"], result: "V", deltaA: 14.4375, deltaB: -14 },
  { date: "2026-03-10", teamA: ["ES", "BG"], teamB: ["AC", "MEK"], result: "F", deltaA: -10.21875, deltaB: 11 },
  { date: "2026-03-12", teamA: ["ES", "MZ"], teamB: ["AC", "FILIP"], result: "F", deltaA: -10.890625, deltaB: 11.195312 },
  { date: "2026-03-19", teamA: ["ES", "MZ"], teamB: ["AC", "FILIP"], result: "F", deltaA: -10, deltaB: 10 },
  { date: "2026-03-24", teamA: ["RY", "BG"], teamB: ["AC", "MEK"], result: "F", deltaA: -9.460938, deltaB: 9.402344 },
  { date: "2026-04-06", teamA: ["RY", "BG"], teamB: ["AC", "MEK"], result: "V", deltaA: 16, deltaB: -16 },
  { date: "2026-04-13", teamA: ["ES", "IS"], teamB: ["RY", "BG"], result: "F", deltaA: -10.09375, deltaB: 10 },
  { date: "2026-04-15", teamA: ["ES", "MZ"], teamB: ["AC", "FILIP"], result: "V", deltaA: 15.046875, deltaB: -14.701172 },
  { date: "2026-04-17", teamA: ["ES", "AC"], teamB: ["RY", "BG"], result: "V", deltaA: 11.231445, deltaB: -11 },
  { date: "2026-04-20", teamA: ["ES", "AC"], teamB: ["RY", "IS"], result: "V", deltaA: 8, deltaB: -8.722656 },
  { date: "2026-04-23", teamA: ["ES", "BG"], teamB: ["RY", "AC"], result: "V", deltaA: 12.583496, deltaB: -12.222168 },
  { date: "2026-04-27", teamA: ["ES", "IS"], teamB: ["BG", "AC"], result: "F", deltaA: -8.06958, deltaB: 7.915527 },
  { date: "2026-04-28", teamA: ["AC", "IS"], teamB: ["BG", "ES"], result: "V", deltaA: 12.922974, deltaB: -12.922974 },
];

const ui = {
  heroLeader: document.getElementById("heroLeader"),
  heroLeaderMeta: document.getElementById("heroLeaderMeta"),
  metricMatches: document.getElementById("metricMatches"),
  metricLastMatch: document.getElementById("metricLastMatch"),
  metricPlayers: document.getElementById("metricPlayers"),
  metricFormPlayer: document.getElementById("metricFormPlayer"),
  metricFormMeta: document.getElementById("metricFormMeta"),
  metricSwingPlayer: document.getElementById("metricSwingPlayer"),
  metricSwingMeta: document.getElementById("metricSwingMeta"),
  rankingTable: document.getElementById("rankingTable"),
  podium: document.getElementById("podium"),
  momentumList: document.getElementById("momentumList"),
  playerCards: document.getElementById("playerCards"),
  matchList: document.getElementById("matchList"),
  rivalryGrid: document.getElementById("rivalryGrid"),
  partnerGrid: document.getElementById("partnerGrid"),
  profilePlayerSelect: document.getElementById("profilePlayerSelect"),
  profileView: document.getElementById("profileView"),
  chart: document.getElementById("trendChart"),
  chartPlayerSelect: document.getElementById("chartPlayerSelect"),
  adminQuickButton: document.getElementById("adminQuickButton"),
  adminTitle: document.getElementById("adminTitle"),
  adminStatePill: document.getElementById("adminStatePill"),
  loginForm: document.getElementById("loginForm"),
  loginMessage: document.getElementById("loginMessage"),
  resultForm: document.getElementById("resultForm"),
  playerForm: document.getElementById("playerForm"),
  resultMessage: document.getElementById("resultMessage"),
  adminUser: document.getElementById("adminUser"),
  adminPassword: document.getElementById("adminPassword"),
  matchDate: document.getElementById("matchDate"),
  matchResult: document.getElementById("matchResult"),
  matchScore: document.getElementById("matchScore"),
  teamA1: document.getElementById("teamA1"),
  teamA2: document.getElementById("teamA2"),
  teamB1: document.getElementById("teamB1"),
  teamB2: document.getElementById("teamB2"),
  logoutButton: document.getElementById("logoutButton"),
  newPlayerName: document.getElementById("newPlayerName"),
  resetDataButton: document.getElementById("resetDataButton"),
  exportButton: document.getElementById("exportButton"),
  adminOnlyControls: document.querySelectorAll("[data-admin-only]"),
};

let state = loadState();
let isAdmin = localStorage.getItem(ADMIN_KEY) === "true";
let passwordHasManualInput = false;

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) {
    return structuredClone({ players: seedPlayers, matches: seedMatches });
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      throw new Error("Invalid stored state");
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return structuredClone({ players: seedPlayers, matches: seedMatches });
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cloneMatch(match, index) {
  return {
    id: match.id || `seed-${index}`,
    date: match.date,
    teamA: [...match.teamA],
    teamB: [...match.teamB],
    result: match.result,
    score: match.score || "",
    deltaA: Number.isFinite(match.deltaA) ? match.deltaA : null,
    deltaB: Number.isFinite(match.deltaB) ? match.deltaB : null,
  };
}

function createEmptyStats(player) {
  return {
    name: player,
    rating: START_RATING,
    matches: 0,
    wins: 0,
    losses: 0,
    streak: [],
    history: [{ date: "Start", rating: START_RATING }],
    lastDelta: 0,
    biggestWin: null,
    toughestLoss: null,
    partners: {},
    opponents: {},
    matchesPlayed: [],
  };
}

function computeModel() {
  const playerSet = new Set(state.players);
  state.matches.forEach((match) => {
    match.teamA.concat(match.teamB).forEach((player) => playerSet.add(player));
  });

  const players = [...playerSet].filter(Boolean).sort((a, b) => a.localeCompare(b, "sv"));
  const stats = Object.fromEntries(players.map((player) => [player, createEmptyStats(player)]));
  const pairStats = {};
  const rivalryStats = {};

  const matches = state.matches
    .map(cloneMatch)
    .filter((match) => isValidMatch(match, false))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const enrichedMatches = matches.map((match) => {
    const teamARating = average(match.teamA.map((player) => stats[player].rating));
    const teamBRating = average(match.teamB.map((player) => stats[player].rating));
    const expectedA = 1 / (1 + 10 ** ((teamBRating - teamARating) / 400));
    const scoreA = match.result === "V" ? 1 : 0;
    const calculatedDeltaA = K_FACTOR * (scoreA - expectedA);
    const deltaA = Number.isFinite(match.deltaA) ? match.deltaA : calculatedDeltaA;
    const deltaB = Number.isFinite(match.deltaB) ? match.deltaB : -calculatedDeltaA;
    const winners = match.result === "V" ? match.teamA : match.teamB;
    const losers = match.result === "V" ? match.teamB : match.teamA;
    const winnerTeam = match.result === "V" ? "A" : "B";
    const enriched = {
      ...match,
      expectedA,
      teamARating,
      teamBRating,
      deltaA,
      deltaB,
      winners,
      losers,
      winnerTeam,
    };

    updatePairStats(pairStats, match.teamA, match.result === "V", deltaA);
    updatePairStats(pairStats, match.teamB, match.result === "F", deltaB);
    updateRivalries(rivalryStats, enriched);

    match.teamA.forEach((player) => {
      applyPlayerResult(stats[player], enriched, deltaA, winners.includes(player));
      updatePlayerRelationships(stats[player], match.teamA, match.teamB, winners.includes(player), deltaA);
    });
    match.teamB.forEach((player) => {
      applyPlayerResult(stats[player], enriched, deltaB, winners.includes(player));
      updatePlayerRelationships(stats[player], match.teamB, match.teamA, winners.includes(player), deltaB);
    });

    return enriched;
  });

  const standings = Object.values(stats)
    .map((player) => ({
      ...player,
      winRate: player.matches ? player.wins / player.matches : 0,
      totalDelta: player.rating - START_RATING,
      formScore: formScore(player.streak),
      formLabel: formLabel(player.streak),
      bestPartner: topRelationship(player.partners, "winRate"),
      nemesis: topRelationship(player.opponents, "losses"),
      favoriteOpponent: topRelationship(player.opponents, "wins"),
    }))
    .sort((a, b) => b.rating - a.rating || b.winRate - a.winRate || a.name.localeCompare(b.name, "sv"));

  return {
    players,
    standings,
    matches: enrichedMatches,
    pairLeaders: Object.values(pairStats).sort((a, b) => b.winRate - a.winRate || b.matches - a.matches),
    rivalryLeaders: Object.values(rivalryStats).sort((a, b) => b.matches - a.matches || Math.abs(b.diff) - Math.abs(a.diff)),
  };
}

function applyPlayerResult(player, match, delta, won) {
  player.rating += delta;
  player.matches += 1;
  player.wins += won ? 1 : 0;
  player.losses += won ? 0 : 1;
  player.lastDelta = delta;
  player.streak.push(won ? "W" : "L");
  player.history.push({ date: match.date, rating: player.rating });
  player.matchesPlayed.push({ ...match, delta, won });

  if (won && (!player.biggestWin || delta > player.biggestWin.delta)) {
    player.biggestWin = { ...match, delta };
  }
  if (!won && (!player.toughestLoss || delta < player.toughestLoss.delta)) {
    player.toughestLoss = { ...match, delta };
  }
}

function updatePlayerRelationships(player, ownTeam, otherTeam, won, delta) {
  const partner = ownTeam.find((name) => name !== player.name);
  if (partner) {
    const item = player.partners[partner] || relationshipSeed(partner);
    applyRelationship(item, won, delta);
    player.partners[partner] = item;
  }

  otherTeam.forEach((opponent) => {
    const item = player.opponents[opponent] || relationshipSeed(opponent);
    applyRelationship(item, won, delta);
    player.opponents[opponent] = item;
  });
}

function relationshipSeed(name) {
  return { name, matches: 0, wins: 0, losses: 0, delta: 0, winRate: 0 };
}

function applyRelationship(item, won, delta) {
  item.matches += 1;
  item.wins += won ? 1 : 0;
  item.losses += won ? 0 : 1;
  item.delta += delta;
  item.winRate = item.matches ? item.wins / item.matches : 0;
}

function updatePairStats(pairStats, team, won, delta) {
  const key = [...team].sort().join("+");
  const item = pairStats[key] || { key, players: [...team], matches: 0, wins: 0, losses: 0, delta: 0, winRate: 0 };
  item.matches += 1;
  item.wins += won ? 1 : 0;
  item.losses += won ? 0 : 1;
  item.delta += delta * 2;
  item.winRate = item.matches ? item.wins / item.matches : 0;
  pairStats[key] = item;
}

function updateRivalries(rivalryStats, match) {
  match.teamA.forEach((playerA) => {
    match.teamB.forEach((playerB) => {
      const names = [playerA, playerB].sort();
      const key = names.join("+");
      const item = rivalryStats[key] || { key, players: names, matches: 0, wins: { [names[0]]: 0, [names[1]]: 0 }, diff: 0 };
      item.matches += 1;
      const winner = match.winners.includes(playerA) ? playerA : playerB;
      item.wins[winner] += 1;
      item.diff = item.wins[names[0]] - item.wins[names[1]];
      rivalryStats[key] = item;
    });
  });
}

function topRelationship(collection, mode) {
  const values = Object.values(collection).filter((item) => item.matches > 0);
  if (!values.length) return null;

  if (mode === "winRate") {
    return values.sort((a, b) => b.winRate - a.winRate || b.matches - a.matches || b.delta - a.delta)[0];
  }
  if (mode === "losses") {
    return values.sort((a, b) => b.losses - a.losses || a.winRate - b.winRate || b.matches - a.matches)[0];
  }
  return values.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.matches - a.matches)[0];
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formScore(streak) {
  const recent = streak.slice(-5);
  if (!recent.length) return 0.5;
  return recent.filter((item) => item === "W").length / recent.length;
}

function formLabel(streak) {
  const score = formScore(streak);
  if (score >= 0.6) return "positive";
  if (score <= 0.4) return "negative";
  return "neutral";
}

function isValidMatch(match, strict = true) {
  const players = match.teamA.concat(match.teamB);
  const uniquePlayers = new Set(players);
  const base = match.date && players.every(Boolean) && uniquePlayers.size === 4 && ["V", "F"].includes(match.result);
  if (!strict) return base;
  return base && players.every((player) => state.players.includes(player));
}

function render() {
  const model = computeModel();
  syncAdminUi();
  renderMetrics(model);
  renderRanking(model);
  renderPodium(model);
  renderMomentum(model);
  renderCards(model);
  renderMatches(model);
  renderRivalries(model);
  renderPartners(model);
  renderSelectors(model);
  renderProfile(model);
  renderChart(model);
}

function renderMetrics(model) {
  const leader = model.standings[0];
  const lastMatch = model.matches.at(-1);
  const formLeader = [...model.standings].sort((a, b) => b.formScore - a.formScore || b.rating - a.rating)[0];
  const swingLeader = [...model.standings].sort((a, b) => Math.abs(b.lastDelta) - Math.abs(a.lastDelta))[0];

  ui.heroLeader.textContent = leader ? leader.name : "-";
  ui.heroLeaderMeta.textContent = leader ? `${formatRating(leader.rating)} rating | ${leader.wins}-${leader.losses}` : "-";
  ui.metricMatches.textContent = model.matches.length;
  ui.metricPlayers.textContent = model.standings.length;
  ui.metricLastMatch.textContent = lastMatch ? `${formatDate(lastMatch.date)} | ${winnerCopy(lastMatch)} vann` : "Ingen match";
  ui.metricFormPlayer.textContent = formLeader ? formLeader.name : "-";
  ui.metricFormMeta.textContent = formLeader ? `${Math.round(formLeader.formScore * 100)}% senaste fem` : "-";
  ui.metricSwingPlayer.textContent = swingLeader ? swingLeader.name : "-";
  ui.metricSwingMeta.textContent = swingLeader ? `${signed(swingLeader.lastDelta)} senaste matchen` : "-";
}

function renderRanking(model) {
  ui.rankingTable.innerHTML = model.standings.map((player, index) => {
    const trend = trendClass(player.totalDelta);
    const trophy = index === 0 ? `<span class="mini-trophy" aria-label="Leder rankingen"></span>` : "";
    return `
      <tr data-player="${escapeHtml(player.name)}">
        <td data-label="Plats"><span class="rank-number">${index + 1}</span></td>
        <td data-label="Spelare">
          <button class="player-link" type="button" data-profile="${escapeHtml(player.name)}">
            <span class="avatar">${initials(player.name)}</span>
            <span>${escapeHtml(player.name)} ${trophy}</span>
          </button>
        </td>
        <td data-label="Rating">${formatRating(player.rating)}</td>
        <td data-label="Record">${player.wins}-${player.losses}</td>
        <td data-label="Form">${formDots(player.streak)}</td>
        <td data-label="Trend"><span class="trend-pill ${trend}">${signed(player.totalDelta)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderPodium(model) {
  const places = [model.standings[1], model.standings[0], model.standings[2]].filter(Boolean);
  ui.podium.innerHTML = places.map((player) => {
    const rank = model.standings.indexOf(player) + 1;
    return `
      <button class="podium-step podium-${rank}" type="button" data-profile="${escapeHtml(player.name)}">
        <span class="podium-rank">${rank}</span>
        <span class="avatar">${initials(player.name)}</span>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${formatRating(player.rating)} rating</small>
      </button>
    `;
  }).join("");
}

function renderMomentum(model) {
  ui.momentumList.innerHTML = [...model.standings]
    .sort((a, b) => b.formScore - a.formScore || b.lastDelta - a.lastDelta)
    .map((player) => `
      <button class="momentum-row" type="button" data-profile="${escapeHtml(player.name)}">
        <span class="avatar">${initials(player.name)}</span>
        <span>
          <strong>${escapeHtml(player.name)}</strong>
          <small>${formDots(player.streak)}</small>
        </span>
        <span class="form-badge ${player.formLabel}">${Math.round(player.formScore * 100)}%</span>
      </button>
    `).join("");
}

function renderCards(model) {
  ui.playerCards.innerHTML = model.standings.map((player, index) => `
    <button class="player-card" type="button" data-profile="${escapeHtml(player.name)}">
      <div class="player-card-head">
        <span class="avatar">${initials(player.name)}</span>
        <span class="form-badge ${player.formLabel}">${formCopy(player.formLabel)}</span>
      </div>
      <div>
        <h3>${index + 1}. ${escapeHtml(player.name)}</h3>
        <p class="rating">${formatRating(player.rating)}</p>
      </div>
      <div class="mini-stats">
        <span>Matcher<strong>${player.matches}</strong></span>
        <span>Vinst<strong>${Math.round(player.winRate * 100)}%</strong></span>
        <span>Trend<strong>${signed(player.totalDelta)}</strong></span>
      </div>
      <div>${formDots(player.streak)}</div>
    </button>
  `).join("");
}

function renderMatches(model) {
  ui.matchList.innerHTML = [...model.matches].reverse().map((match) => {
    const delta = match.result === "V" ? match.deltaA : match.deltaB;
    const deltaClass = delta >= 0 ? "positive" : "negative";
    return `
      <article class="match-row">
        <time class="match-date">${formatDate(match.date)}</time>
        <div class="teams">
          ${escapeHtml(match.teamA.join(" / "))} <small>mot ${escapeHtml(match.teamB.join(" / "))}${match.score ? ` | ${escapeHtml(match.score)}` : ""}</small>
        </div>
        <span class="delta ${deltaClass}">${winnerCopy(match)} ${signed(delta)}</span>
      </article>
    `;
  }).join("");
}

function renderRivalries(model) {
  const top = model.rivalryLeaders.filter((item) => item.matches >= 2).slice(0, 8);
  ui.rivalryGrid.innerHTML = top.length ? top.map((item) => {
    const [a, b] = item.players;
    const aWins = item.wins[a] || 0;
    const bWins = item.wins[b] || 0;
    const leader = aWins === bWins ? "Jämnt" : aWins > bWins ? a : b;
    return `
      <article class="rivalry-card">
        <strong>${escapeHtml(a)} vs ${escapeHtml(b)}</strong>
        <div class="versus-bar">
          <span style="width: ${Math.max(8, (aWins / item.matches) * 100)}%"></span>
        </div>
        <small>${aWins}-${bWins} | ${leader} ${leader === "Jämnt" ? "" : "leder"}</small>
      </article>
    `;
  }).join("") : `<p class="empty-copy">Fler matcher behövs för tydliga dueller.</p>`;
}

function renderPartners(model) {
  const top = model.pairLeaders.filter((item) => item.matches >= 2).slice(0, 6);
  ui.partnerGrid.innerHTML = top.length ? top.map((pair, index) => `
    <article class="partner-card">
      <span class="rank-number">${index + 1}</span>
      <strong>${escapeHtml(pair.players.join(" / "))}</strong>
      <small>${pair.wins}-${pair.losses} | ${Math.round(pair.winRate * 100)}% vinst</small>
      <span class="trend-pill ${trendClass(pair.delta)}">${signed(pair.delta)} rating</span>
    </article>
  `).join("") : `<p class="empty-copy">Inga par har spelat tillräckligt ofta ännu.</p>`;
}

function renderSelectors(model) {
  const chartValue = ui.chartPlayerSelect.value;
  const profileValue = ui.profilePlayerSelect.value || chartValue;
  const options = model.standings.map((player) => `<option value="${escapeHtml(player.name)}">${escapeHtml(player.name)}</option>`).join("");

  ui.chartPlayerSelect.innerHTML = options;
  ui.profilePlayerSelect.innerHTML = options;
  ui.chartPlayerSelect.value = model.players.includes(chartValue) ? chartValue : model.standings[0]?.name || "";
  ui.profilePlayerSelect.value = model.players.includes(profileValue) ? profileValue : ui.chartPlayerSelect.value;

  [ui.teamA1, ui.teamA2, ui.teamB1, ui.teamB2].forEach((select) => {
    const value = select.value;
    select.innerHTML = `<option value="">Välj spelare</option>${model.players.map((player) => (
      `<option value="${escapeHtml(player)}">${escapeHtml(player)}</option>`
    )).join("")}`;
    select.value = model.players.includes(value) ? value : "";
  });

  if (!ui.matchDate.value) {
    ui.matchDate.valueAsDate = new Date();
  }
}

function renderProfile(model) {
  const player = model.standings.find((item) => item.name === ui.profilePlayerSelect.value) || model.standings[0];
  if (!player) {
    ui.profileView.innerHTML = `<p class="empty-copy">Ingen spelare vald.</p>`;
    return;
  }

  const bestPartner = player.bestPartner;
  const favoriteOpponent = player.favoriteOpponent;
  const nemesis = player.nemesis;
  const recentMatches = player.matchesPlayed.slice(-6).reverse();
  const rank = model.standings.indexOf(player) + 1;

  ui.profileView.innerHTML = `
    <section class="profile-hero">
      <div class="profile-identity">
        <span class="avatar avatar-large">${initials(player.name)}</span>
        <div>
          <p class="eyebrow">Profil</p>
          <h3>${escapeHtml(player.name)}</h3>
          <small>Plats ${rank} | ${formatRating(player.rating)} rating | ${signed(player.totalDelta)} trend</small>
        </div>
      </div>
      <div class="profile-score ${player.formLabel}">
        <span>Form</span>
        <strong>${Math.round(player.formScore * 100)}%</strong>
        <small>${formDots(player.streak)}</small>
      </div>
    </section>

    <section class="profile-stat-grid">
      <article><span>Record</span><strong>${player.wins}-${player.losses}</strong><small>${Math.round(player.winRate * 100)}% vinster</small></article>
      <article><span>Bästa partner</span><strong>${bestPartner ? escapeHtml(bestPartner.name) : "-"}</strong><small>${bestPartner ? `${bestPartner.wins}-${bestPartner.losses}` : "Ingen data"}</small></article>
      <article><span>Bäst mot</span><strong>${favoriteOpponent ? escapeHtml(favoriteOpponent.name) : "-"}</strong><small>${favoriteOpponent ? `${favoriteOpponent.wins}-${favoriteOpponent.losses}` : "Ingen data"}</small></article>
      <article><span>Tuffast mot</span><strong>${nemesis ? escapeHtml(nemesis.name) : "-"}</strong><small>${nemesis ? `${nemesis.wins}-${nemesis.losses}` : "Ingen data"}</small></article>
    </section>

    <section class="profile-columns">
      <div>
        <h4>Motståndare</h4>
        ${relationshipTable(player.opponents, "Mot")}
      </div>
      <div>
        <h4>Partners</h4>
        ${relationshipTable(player.partners, "Med")}
      </div>
      <div>
        <h4>Senaste matcher</h4>
        <div class="profile-match-list">
          ${recentMatches.map((match) => `
            <article>
              <span class="form-badge ${match.won ? "positive" : "negative"}">${match.won ? "Vinst" : "Förlust"}</span>
              <strong>${formatDate(match.date)} | ${signed(match.delta)}</strong>
              <small>${escapeHtml(match.teamA.join(" / "))} mot ${escapeHtml(match.teamB.join(" / "))}</small>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function relationshipTable(collection, label) {
  const rows = Object.values(collection)
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate)
    .slice(0, 8);

  if (!rows.length) return `<p class="empty-copy">Ingen data ännu.</p>`;

  return `
    <div class="relationship-list">
      ${rows.map((item) => `
        <div>
          <span>${label} ${escapeHtml(item.name)}</span>
          <strong>${item.wins}-${item.losses}</strong>
          <small>${Math.round(item.winRate * 100)}% | ${signed(item.delta)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderChart(model) {
  const ctx = ui.chart.getContext("2d");
  const width = ui.chart.width;
  const height = ui.chart.height;
  const player = model.standings.find((item) => item.name === ui.chartPlayerSelect.value) || model.standings[0];
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, width, height, 26);
  ctx.fill();

  if (!player || player.history.length < 2) {
    drawChartLabel(ctx, "Ingen trenddata ännu", width / 2, height / 2, "#6e6e73", 24);
    return;
  }

  const pad = { top: 42, right: 38, bottom: 56, left: 62 };
  const points = player.history;
  const ratings = points.map((point) => point.rating);
  const minRating = Math.floor((Math.min(...ratings) - 18) / 10) * 10;
  const maxRating = Math.ceil((Math.max(...ratings) + 18) / 10) * 10;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  ctx.strokeStyle = "#ececf0";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#8e8e93";
  ctx.font = "600 22px -apple-system, BlinkMacSystemFont, sans-serif";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (innerHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const value = maxRating - ((maxRating - minRating) / 4) * i;
    ctx.fillText(Math.round(value), 14, y + 7);
  }

  const coords = points.map((point, index) => ({
    x: pad.left + (innerWidth * index) / (points.length - 1),
    y: pad.top + innerHeight - ((point.rating - minRating) / (maxRating - minRating || 1)) * innerHeight,
  }));

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(10, 143, 82, 0.24)");
  gradient.addColorStop(1, "rgba(10, 143, 82, 0)");

  ctx.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(coords.at(-1).x, height - pad.bottom);
  ctx.lineTo(coords[0].x, height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#0a8f52";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  const last = coords.at(-1);
  ctx.fillStyle = "#0a8f52";
  ctx.beginPath();
  ctx.arc(last.x, last.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1d1d1f";
  ctx.font = "800 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`${player.name} | ${formatRating(player.rating)}`, pad.left, 30);
  drawChartLabel(ctx, "Start", pad.left, height - 18, "#8e8e93", 18);
  drawChartLabel(ctx, formatDate(points.at(-1).date), width - pad.right - 80, height - 18, "#8e8e93", 18);
}

function syncAdminUi() {
  ui.loginForm.hidden = isAdmin;
  ui.resultForm.hidden = !isAdmin;
  ui.playerForm.hidden = !isAdmin;
  ui.adminTitle.textContent = isAdmin ? "Lägg in resultat" : "Logga in";
  clearLoggedOutPassword();
  ui.adminStatePill.textContent = isAdmin ? "Inloggad" : "Utloggad";
  ui.adminStatePill.classList.toggle("is-in", isAdmin);
  ui.adminOnlyControls.forEach((control) => {
    control.hidden = !isAdmin;
    control.disabled = !isAdmin;
  });
}

function clearLoggedOutPassword() {
  if (!isAdmin && !passwordHasManualInput) {
    ui.adminPassword.value = "";
  }
}

function requireAdmin(messageTarget) {
  if (isAdmin) return true;
  if (messageTarget) {
    messageTarget.textContent = "Logga in som admin först.";
    messageTarget.className = "form-message error";
  }
  return false;
}

function handleLogin(event) {
  event.preventDefault();
  const user = ui.adminUser.value.trim().toLowerCase();
  const password = ui.adminPassword.value;
  if (user === "erkan.saglik" && password === "Padel26") {
    isAdmin = true;
    passwordHasManualInput = false;
    localStorage.setItem(ADMIN_KEY, "true");
    ui.loginMessage.textContent = "";
    ui.adminPassword.value = "";
    render();
    return;
  }
  ui.loginMessage.textContent = "Fel användare eller lösenord.";
  ui.loginMessage.className = "form-message error";
}

function handleResult(event) {
  event.preventDefault();
  if (!requireAdmin(ui.resultMessage)) return;

  const match = {
    id: `local-${Date.now()}`,
    date: ui.matchDate.value,
    teamA: [ui.teamA1.value, ui.teamA2.value],
    teamB: [ui.teamB1.value, ui.teamB2.value],
    result: ui.matchResult.value,
    score: ui.matchScore.value.trim(),
  };

  if (!isValidMatch(match)) {
    ui.resultMessage.textContent = "Välj fyra olika spelare och ett datum.";
    ui.resultMessage.className = "form-message error";
    return;
  }

  state.matches.push(match);
  saveState();
  ui.matchScore.value = "";
  ui.resultMessage.textContent = "Matchen är sparad.";
  ui.resultMessage.className = "form-message success";
  render();
}

function handleAddPlayer(event) {
  event.preventDefault();
  if (!requireAdmin(ui.resultMessage)) return;

  const name = ui.newPlayerName.value.trim().toUpperCase();
  if (!name || state.players.includes(name)) return;
  state.players.push(name);
  saveState();
  ui.newPlayerName.value = "";
  render();
}

function resetData() {
  if (!requireAdmin(ui.resultMessage)) return;

  const ok = window.confirm("Återställ till importerad Excel-data?");
  if (!ok) return;
  state = structuredClone({ players: seedPlayers, matches: seedMatches });
  saveState();
  render();
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `padel-united-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openProfile(player) {
  if (!player) return;
  ui.profilePlayerSelect.value = player;
  ui.chartPlayerSelect.value = player;
  const model = computeModel();
  renderProfile(model);
  renderChart(model);
  document.getElementById("profiles").scrollIntoView({ behavior: "smooth", block: "start" });
}

function winnerCopy(match) {
  return match.result === "V" ? "Lag A" : "Lag B";
}

function formatRating(value) {
  return Math.round(value).toLocaleString("sv-SE");
}

function formatDate(value) {
  if (!value || value === "Start") return value || "";
  return new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function signed(value) {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

function trendClass(value) {
  if (value > 4) return "positive";
  if (value < -4) return "negative";
  return "neutral";
}

function formCopy(label) {
  if (label === "positive") return "Het";
  if (label === "negative") return "Kall";
  return "Neutral";
}

function formDots(streak) {
  const recent = streak.slice(-5);
  const dots = Array.from({ length: 5 }, (_, index) => {
    const value = recent[index];
    const className = value === "W" ? "win" : value === "L" ? "loss" : "";
    return `<span class="form-dot ${className}"></span>`;
  }).join("");
  return `<span class="form-dots" aria-label="Senaste form">${dots}</span>`;
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawChartLabel(ctx, text, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(text, x, y);
}

ui.loginForm.addEventListener("submit", handleLogin);
ui.adminPassword.addEventListener("focus", () => {
  passwordHasManualInput = true;
});
ui.adminPassword.addEventListener("input", () => {
  passwordHasManualInput = true;
});
ui.resultForm.addEventListener("submit", handleResult);
ui.playerForm.addEventListener("submit", handleAddPlayer);
ui.logoutButton.addEventListener("click", () => {
  isAdmin = false;
  passwordHasManualInput = false;
  localStorage.removeItem(ADMIN_KEY);
  render();
});
ui.resetDataButton.addEventListener("click", resetData);
ui.exportButton.addEventListener("click", exportData);
ui.chartPlayerSelect.addEventListener("change", () => {
  ui.profilePlayerSelect.value = ui.chartPlayerSelect.value;
  const model = computeModel();
  renderProfile(model);
  renderChart(model);
});
ui.profilePlayerSelect.addEventListener("change", () => openProfile(ui.profilePlayerSelect.value));
ui.adminQuickButton.addEventListener("click", () => document.getElementById("admin").scrollIntoView({ behavior: "smooth" }));
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-profile]");
  if (trigger) openProfile(trigger.dataset.profile);
});
window.addEventListener("resize", () => renderChart(computeModel()));

render();
window.setTimeout(clearLoggedOutPassword, 0);
