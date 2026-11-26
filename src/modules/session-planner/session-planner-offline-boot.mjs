import { readPreparedSessionsOffline, sessionsOfflinePreparationKey } from "../../core/sessions-offline-access/access.mjs";
import { createSessionPlannerRenderer } from "./session-planner-renderer.mjs";
import { createSessionPlannerWorkspaceRenderer, renderSessionPlannerBuilderFields } from "./session-planner-workspace-renderer.mjs";

const root = document.getElementById("sessionPlannerWorkspace");
const onlineRoute = "/?workspace=session-planner";
const openOnline = '<a href="' + onlineRoute + '">Open Sessions online</a>';
const requestedDate = new URL(window.location.href).searchParams.get("date") ?? undefined;
const desktopLaunch = Boolean(document.querySelector('meta[name="sessions-offline-desktop-launch"][content="active"]'));
const renderer = createSessionPlannerRenderer();
const workspace = createSessionPlannerWorkspaceRenderer();
let generation = 0;
let expiration;

function sessionContents(session) {
  if (session === null) return '<p class="session-empty-state">No session in this version.</p>';
  const blockList = Array.isArray(session?.blocks) ? session.blocks : [];
  if (!blockList.length) return '<p class="session-empty-state">No exercises in this version.</p>';
  return blockList.map(block => {
    const title = workspace.escapeText(block.title || block.label || "Exercise");
    const fields = renderSessionPlannerBuilderFields(renderer.renderEditableField, block);
    return '<details class="session-offline-block session-card" open><summary>' + title +
      '</summary><div class="session-offline-content">' +
      renderer.renderHeaderField(block, "focus", "") +
      renderer.renderEditableField(block, "minutes", "Minutes", { long: false, type: "number" }) +
      '<div class="session-builder-fields">' + fields + '</div>' +
      renderer.renderPostSessionNotesCard(block) + '</div></details>';
  }).join("");
}

function showDesktopLaunch(date) {
  const query = new URLSearchParams({ workspace: "session-planner", date });
  root.innerHTML = workspace.renderOfflineWorkspace({
    status: '<p role="status">A prepared Sessions date is available in read-only mode.</p>',
    content: '<a data-session-offline-open-prepared href="' + workspace.escapeText("/?" + query) +
      '">Open prepared Sessions offline</a>',
  });
  root.setAttribute("aria-busy", "false");
}

function show(snapshot) {
  const versions = snapshot.journal.map(row => {
    const label = row.status === "review" ? "Local review · changes retained" : "Saved locally · sync pending";
    return '<details class="session-card session-offline-version" data-session-offline-version="' + row.status +
      '"><summary>' + label + '</summary><div class="session-offline-content">' +
      sessionContents(row.session) + '</div></details>';
  }).join("");
  const sessionTitle = workspace.escapeText(snapshot.session?.title || "Session");
  const date = workspace.escapeText(snapshot.date);
  const team = workspace.escapeText(snapshot.teamId);
  const content = '<section class="session-card session-offline-content" data-session-offline-version="accepted">' +
    '<header class="session-card-head"><div><span>Saved centrally · local copy</span><h2>' +
    sessionTitle + '</h2></div></header>' + sessionContents(snapshot.session) + '</section>' + versions;
  root.innerHTML = workspace.renderOfflineWorkspace({
    status: '<p role="status">Offline · read-only</p><p class="session-offline-date">Team ' +
      team + ' · <time data-session-offline-date datetime="' + date + '">' + date + '</time></p>' + openOnline,
    content,
  });
  root.setAttribute("aria-busy", "false");
}

function lock(message = "Connect to open or prepare Sessions for this account, team and date.") {
  generation++;
  clearTimeout(expiration);
  root.innerHTML = workspace.renderOfflineWorkspace({
    status: '<p role="status">' + workspace.escapeText(message) + '</p>',
    content: openOnline,
  });
  root.setAttribute("aria-busy", "false");
}

async function open() {
  const request = ++generation;
  try {
    const snapshot = await readPreparedSessionsOffline({ date: requestedDate });
    if (request !== generation || document.hidden) return;
    if (desktopLaunch) showDesktopLaunch(snapshot.date);
    else show(snapshot);
    clearTimeout(expiration);
    expiration = setTimeout(() => lock("Offline access expired. Connect to prepare Sessions again."),
      Math.max(0, snapshot.expiresAt - Date.now()));
  } catch {
    if (request === generation) lock();
  }
}

window.addEventListener("storage", event => {
  if (event.key === null || event.key === sessionsOfflinePreparationKey ||
      /^sb-.*-auth-token$/.test(event.key || "")) lock();
});
window.addEventListener("pagehide", () => lock());
window.addEventListener("pageshow", event => { if (event.persisted) open(); });
window.addEventListener("online", () => lock("Back online. Open Sessions to continue."));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) lock();
  else open();
});
void open();
