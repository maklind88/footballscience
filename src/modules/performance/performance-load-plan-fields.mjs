import { dateLabel } from "./performance-overview.mjs";
import { loadMetrics } from "./performance-load-plan.mjs";

export function metricHeader() {
  return loadMetrics.map(({ name, unit }) => `<th scope="col">${name} <small>${unit}</small></th>`).join("");
}

function plannedActivityLabel(activity, escape) {
  const info = [
    activity.type === "match" ? "Match estimate" : activity.physicalLoad,
    activity.minutes != null ? `${activity.minutes} plan min` : "",
    activity.time,
  ].filter(Boolean);
  return `<div class="pr-plan-activity">
    <strong>${escape(activity.title || (activity.type === "match" ? "Match" : "Training"))}</strong>
    ${info.length ? `<small>${escape(info.join(" · "))}</small>` : ""}
  </div>`;
}

export function dayAndActivity(day, activity, escape) {
  return `<span class="pr-plan-day-label">${dateLabel(day.date)} ${day.matchContext ? `<small>${escape(day.matchContext)}</small>` : ""}</span>
    ${activity ? plannedActivityLabel(activity, escape) : `<span class="pr-plan-no-activity">${day.sessionType === "Off" ? "Off" : "No training or match scheduled"}</span>`}`;
}

export function amountInput(metric, name, value, label, escape, canEdit, { typed, focus, invalid } = {}) {
  const display = typed ?? (value == null ? "" : String(value / metric.scale));
  return `<div class="pr-plan-input">
    <input type="text" inputmode="${metric.scale === 1000 ? "decimal" : "numeric"}" name="${escape(name)}" aria-label="${escape(label)}"
      value="${escape(display)}"${focus ? ` data-pr-focus="${escape(focus)}"` : ""} placeholder="—" autocomplete="off"${invalid ? ' aria-invalid="true"' : ""}${canEdit ? "" : " readonly"}>
    <span aria-hidden="true">${metric.unit}</span>
  </div>`;
}
