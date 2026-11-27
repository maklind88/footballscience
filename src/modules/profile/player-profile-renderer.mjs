import { dateLabel } from "../performance/performance-overview.mjs";

const format = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const gpsFields = [
  ["Total distance", "distance", "m"],
  ["High-speed running", "hsr", "m"],
  ["Top speed", "maxSpeed", "km/h"],
];
const wellnessFields = [
  ["Sleep duration", "sleepDuration"], ["Sleep quality", "sleepQuality"],
  ["Fatigue", "fatigue"], ["Soreness", "soreness"], ["Stress", "stress"],
];

export function element(tag, value) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}

function metricList(fields) {
  const details = element("dl");
  for (const [label, value] of fields) {
    if (value === undefined || value === null || value === "") continue;
    details.append(element("dt", label), element("dd", value));
  }
  return details;
}

export function renderIdentity({ name = "", team = "", imageUrl = "" } = {}) {
  const identity = element("div");
  identity.className = "identity";
  if (imageUrl || name) {
    const avatar = element(imageUrl ? "img" : "span", imageUrl ? undefined :
      name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
    avatar.className = "avatar";
    if (imageUrl) Object.assign(avatar, { src: imageUrl, alt: "", width: 48, height: 48 });
    else avatar.setAttribute("aria-hidden", "true");
    identity.append(avatar);
  }
  const details = element("div");
  if (name) details.append(element("strong", name));
  if (team) details.append(element("p", team));
  identity.append(details);
  return identity;
}

export function renderDevelopment(data, unavailable) {
  if (unavailable) return [element("p", "Development is temporarily unavailable.")];
  if (!data) return [element("p", "No development focus has been shared yet.")];
  const content = element("div");
  content.className = "focus";
  const title = element("h3", data.focus);
  content.append(element("span", "Current focus"), title);
  const next = element("div");
  next.append(element("h4", "Next step"), element("p", data.nextStep));
  if (data.feedback) next.append(element("h4", "Coach feedback"), element("p", data.feedback));
  return [content, next];
}

export function renderGps(rows, unavailable) {
  if (unavailable) return [element("p", "GPS is temporarily unavailable.")];
  if (!rows.length) return [element("p", "No GPS data for this week.")];
  return rows.map((row) => {
    const entry = element("article");
    const metrics = gpsFields.map(([label, key, unit]) =>
      [label, Number.isFinite(row[key]) ? `${format.format(row[key])} ${unit}` : null]);
    entry.append(element("h3", row.title), element("p", dateLabel(row.date)), metricList(metrics));
    return entry;
  });
}

export function renderWellness(rows) {
  return rows.length ? rows.toReversed().map((row) => {
    const entry = element("article");
    entry.append(element("h3", dateLabel(row.date)), element("strong", `${format.format(row.score)} / 100`),
      metricList(wellnessFields.map(([label, key]) => [label, row[key]])));
    return entry;
  }) : [element("p", "No Wellness records for this week.")];
}
