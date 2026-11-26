import { dateLabel, isValidDate, shiftDate, weekDates } from "./performance-overview.mjs";

const byId = (id) => document.getElementById(id);
const login = byId("login");
const status = byId("status");
const portal = byId("portal");
const dateInput = byId("date");
const signout = byId("signout");
const format = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
let accessToken = "";
let currentLoad;
let busyForm;
let loginAttempt = 0;

function element(tag, value) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}

function renderRpe(rows, week) {
  return rows.length ? rows.map(({ activityId, date, title, rating }) => {
    const entry = element("article");
    entry.append(element("h3", title), element("p", dateLabel(date)));
    if (Number.isInteger(rating)) {
      entry.append(element("strong", `Submitted · ${rating} / 10`));
      return entry;
    }

    const form = element("form");
    const group = element("fieldset");
    const scale = element("div");
    scale.className = "scale";
    group.append(element("legend", "How hard was the whole session?"), scale);
    for (let value = 0; value <= 10; value += 1) {
      const label = element("label");
      const input = element("input");
      Object.assign(input, { type: "radio", name: "rating", value: String(value), required: true });
      label.append(input, element("span", String(value)));
      scale.append(label);
    }
    const anchors = element("p");
    anchors.className = "anchors";
    anchors.append(element("span", "0 · Rest"), element("span", "10 · Maximal effort"));
    group.append(anchors);
    const submit = element("button", "Send response");
    submit.type = "submit";
    form.append(group, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const rating = new FormData(form).get("rating");
      if (rating !== null) void submitRpe(week, activityId, Number(rating), group, submit);
    });
    entry.append(form);
    return entry;
  }) : [element("p", "No RPE check-ins for this week.")];
}

function renderWellness(rows) {
  return rows.length ? rows.map(({ date, score, sleepDuration, sleepQuality, fatigue, soreness, stress }) => {
    const entry = element("article");
    entry.append(element("h3", dateLabel(date)), element("strong", `${format.format(score)} / 100`));
    const details = element("dl");
    const fields = [["Sleep duration", sleepDuration], ["Sleep quality", sleepQuality], ["Fatigue", fatigue],
      ["Soreness", soreness], ["Stress", stress]];
    for (const [label, value] of fields) {
      if (!value) continue;
      details.append(element("dt", label), element("dd", value));
    }
    entry.append(details);
    return entry;
  }) : [element("p", "No Wellness records for this week.")];
}

function clearSession(message = "") {
  loginAttempt += 1;
  currentLoad?.abort();
  busyForm?.abort();
  busyForm = null;
  accessToken = "";
  login.reset();
  login.hidden = false;
  login.querySelector("button").disabled = false;
  signout.hidden = true;
  portal.hidden = true;
  byId("rpe").replaceChildren();
  byId("wellness").replaceChildren();
  status.textContent = message;
}

async function request(url, options) {
  const response = await fetch(url, { ...options, credentials: "omit", cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.reason ?? "Check-ins are unavailable. Try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function playerRequest(week, data, signal) {
  return request(`/api/performance-rpe?week=${encodeURIComponent(week)}`, {
    method: data ? "POST" : "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(data ? { "Content-Type": "application/json" } : {}) },
    body: data ? JSON.stringify({ ...data, week }) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(16000)]),
  });
}

async function load(confirmation = "") {
  if (!accessToken || !isValidDate(dateInput.value)) return;
  dateInput.value = weekDates(dateInput.value)[0];
  const week = dateInput.value;
  currentLoad?.abort();
  const controller = new AbortController();
  currentLoad = controller;
  byId("rpe").replaceChildren();
  byId("wellness").replaceChildren();
  status.textContent = "Loading your week…";
  try {
    const data = await playerRequest(week, null, controller.signal);
    if (controller.signal.aborted) return;
    byId("rpe").replaceChildren(...renderRpe(data.rpe, week));
    byId("wellness").replaceChildren(...renderWellness(data.wellness));
    status.textContent = confirmation;
  } catch (error) {
    if (controller.signal.aborted) return;
    if ([401, 403].includes(error.status)) clearSession(error.message);
    else status.textContent = error.message;
  }
}

async function submitRpe(week, activityId, rating, group, submit) {
  if (busyForm || !accessToken) return;
  const controller = new AbortController();
  busyForm = controller;
  group.disabled = submit.disabled = true;
  status.textContent = "Saving your response…";
  try {
    await playerRequest(week, { activityId, rating }, controller.signal);
    if (!controller.signal.aborted) await load("Response saved.");
  } catch (error) {
    if (controller.signal.aborted) return;
    if ([401, 403].includes(error.status)) clearSession(error.message);
    else if (error.status === 409) await load("A response has already been submitted.");
    else status.textContent = error.message;
  } finally {
    group.disabled = submit.disabled = false;
    if (busyForm === controller) busyForm = null;
  }
}

login.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = login.querySelector("button");
  if (button.disabled) return;
  const attempt = ++loginAttempt;
  const { email, password } = Object.fromEntries(new FormData(login));
  button.disabled = true;
  status.textContent = "Signing in…";
  try {
    const data = await request("/api/client-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(65000),
    });
    if (attempt !== loginAttempt) return;
    if (!data.session?.access_token) throw new Error("Could not start a session.");
    accessToken = data.session.access_token;
    login.reset();
    login.hidden = true;
    signout.hidden = false;
    portal.hidden = false;
    await load();
  } catch (error) {
    if (attempt === loginAttempt) status.textContent = error.message;
  } finally {
    if (attempt === loginAttempt) button.disabled = false;
  }
});

signout.addEventListener("click", () => {
  clearSession("Signed out.");
  login.elements.email.focus();
});
dateInput.value = weekDates(new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone: "America/New_York" })
  .format(new Date()))[0];
dateInput.addEventListener("change", () => void load());
for (const [id, offset] of [["prev", -7], ["next", 7]]) {
  byId(id).addEventListener("click", () => {
    if (!isValidDate(dateInput.value)) return;
    dateInput.value = shiftDate(dateInput.value, offset);
    void load();
  });
}
