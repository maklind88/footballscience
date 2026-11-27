import { dateLabel, isValidDate, shiftDate, weekDates } from "./performance-overview.mjs";
import { element, renderDevelopment, renderGps, renderIdentity, renderWellness } from "../profile/player-profile-renderer.mjs";
import { createProfileImageDataUrl } from "../profile/profile-image-helpers.mjs";

const byId = (id) => document.getElementById(id);
const login = byId("login");
const status = byId("status");
const portal = byId("portal");
const dateInput = byId("date");
const signout = byId("signout");
const retry = byId("retry");
let accessToken = "";
let currentLoad;
let busyForm;
let loginAttempt = 0;
let account;
let profileMutation;
const viewButtons = [...document.querySelectorAll("[data-view]")];
const profileForms = ["profile-form", "photo-form", "password-form"].map(byId);

function showView(name) {
  for (const button of viewButtons) {
    const selected = button.dataset.view === name;
    button.setAttribute("aria-pressed", String(selected));
    byId(button.getAttribute("aria-controls")).hidden = !selected;
  }
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
    group.append(element("legend", "How hard was this session?"), scale);
    for (let value = 1; value <= 10; value += 1) {
      const label = element("label");
      const input = element("input");
      Object.assign(input, { type: "radio", name: "rating", value: String(value), required: true });
      label.append(input, element("span", String(value)));
      scale.append(label);
    }
    const anchors = element("p");
    anchors.className = "anchors";
    anchors.append(element("span", "1 · Very easy"), element("span", "10 · Maximum effort"));
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

function renderAccount(next, { fillFields = false } = {}) {
  account = next;
  byId("identity").replaceChildren(renderIdentity(next));
  byId("profile-email").textContent = next?.email || "";
  for (const button of profileForms.map((form) => form.querySelector("button"))) button.disabled = !next?.id;
  if (fillFields) {
    for (const name of ["firstName", "lastName"]) byId("profile-form").elements[name].value = next?.[name] || "";
  }
}

function clearSession(message = "") {
  loginAttempt += 1;
  currentLoad?.abort();
  busyForm?.abort();
  profileMutation?.abort();
  busyForm = null;
  profileMutation = null;
  accessToken = "";
  login.reset();
  login.hidden = false;
  login.querySelector("button").disabled = false;
  signout.hidden = true;
  retry.hidden = true;
  portal.hidden = true;
  for (const id of ["rpe", "rpe-history", "wellness", "development", "gps"]) byId(id).replaceChildren();
  for (const form of profileForms) form.reset();
  renderAccount(undefined, { fillFields: true });
  byId("profile-status").textContent = "";
  byId("rpe-panel").hidden = true;
  showView("development");
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
  return request(`/api/performance-rpe?view=profile&week=${encodeURIComponent(week)}`, {
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
  for (const id of ["rpe", "rpe-history", "wellness", "gps"]) byId(id).replaceChildren();
  byId("rpe-panel").hidden = true;
  retry.hidden = true;
  status.textContent = "Loading your week…";
  try {
    const data = await playerRequest(week, null, controller.signal);
    if (controller.signal.aborted) return;
    const pending = data.rpe.filter(({ rating }) => !Number.isInteger(rating));
    byId("rpe-panel").hidden = !pending.length;
    byId("rpe").replaceChildren(...(pending.length ? renderRpe(pending, week) : []));
    byId("rpe-history").replaceChildren(...renderRpe(data.rpe.filter(({ rating }) => Number.isInteger(rating)), week));
    byId("wellness").replaceChildren(...renderWellness(data.wellness));
    byId("development").replaceChildren(...renderDevelopment(data.development, data.modulesUnavailable));
    byId("gps").replaceChildren(...renderGps(data.gps || [], data.modulesUnavailable));
    retry.hidden = !data.modulesUnavailable;
    if (!account) renderAccount(data.profile, { fillFields: true });
    portal.hidden = false;
    status.textContent = data.demo
      ? [confirmation, "Practice account · responses are separate from team data."].filter(Boolean).join(" ")
      : confirmation;
  } catch (error) {
    if (controller.signal.aborted) return;
    if ([401, 403].includes(error.status)) clearSession(error.message);
    else {
      status.textContent = error.message;
      retry.hidden = false;
    }
  }
}

async function saveAccount(event) {
  event.preventDefault();
  if (!account?.id || !accessToken || profileMutation) return;
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const notice = byId("profile-status");
  const values = Object.fromEntries(new FormData(form));
  const controller = new AbortController();
  profileMutation = controller;
  button.disabled = true;
  notice.textContent = "Saving…";
  try {
    let path = "/api/admin-users";
    let method = "PATCH";
    let body = { id: account.id, firstName: values.firstName, lastName: values.lastName };
    if (form.id === "password-form") {
      if (values.password !== values.confirm) throw new Error("Passwords do not match.");
      body = { id: account.id, password: values.password };
    } else if (form.id === "photo-form") {
      path = "/api/profile-image";
      method = "POST";
      body = { imageDataUrl: await createProfileImageDataUrl(values.photo) };
    }
    if (controller.signal.aborted) return;
    const { user } = await request(path, {
      method, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (controller.signal.aborted) return;
    if (form.id !== "profile-form") form.reset();
    if (user) {
      const isNameChange = form.id === "profile-form";
      renderAccount({ ...account, firstName: user.firstName, lastName: user.lastName,
        name: isNameChange ? [user.firstName, user.lastName].filter(Boolean).join(" ") : account.name,
        imageUrl: user.profileImageUrl || "" }, { fillFields: isNameChange });
    }
    notice.textContent = "Saved.";
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error.status === 401) clearSession(error.message);
    else notice.textContent = error.message;
  } finally {
    if (profileMutation === controller) {
      profileMutation = null;
      button.disabled = false;
    }
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
retry.addEventListener("click", () => void load());
for (const button of viewButtons) button.addEventListener("click", () => showView(button.dataset.view));
for (const form of profileForms) form.addEventListener("submit", saveAccount);
for (const [id, offset] of [["prev", -7], ["next", 7]]) {
  byId(id).addEventListener("click", () => {
    if (!isValidDate(dateInput.value)) return;
    dateInput.value = shiftDate(dateInput.value, offset);
    void load();
  });
}
