export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function logEvent(message) {
  if (message) console.warn(message);
}

export function setFormSubmitButtonState(form, options = {}) {
  const {
    isSubmitting = false,
    submittingLabel = "Saving...",
    defaultLabel = "Save",
  } = options;
  if (!form || typeof form.querySelector !== "function") {
    return;
  }
  const submitButton = form.querySelector('button[type="submit"], [data-admin-create-user-submit]');
  if (!submitButton) {
    return;
  }
  if (isSubmitting) {
    if (submitButton.dataset.savedLabel == null) {
      submitButton.dataset.savedLabel = String(submitButton.textContent || defaultLabel);
    }
    submitButton.disabled = true;
    submitButton.textContent = submittingLabel;
    return;
  }
  submitButton.disabled = false;
  submitButton.textContent = submitButton.dataset.savedLabel || defaultLabel;
  delete submitButton.dataset.savedLabel;
}

export function formatDashboardTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));
  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (dayDiff === 0) {
    return timeLabel;
  }
  if (dayDiff === 1) {
    return `Yesterday ${timeLabel}`;
  }
  const dateOptions = date.getFullYear() === today.getFullYear()
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return `${new Intl.DateTimeFormat("en-GB", dateOptions).format(date)} ${timeLabel}`;
}

export function formatDashboardDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function addCalendarDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}
