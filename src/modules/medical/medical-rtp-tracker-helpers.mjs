export const medicalRtpTrackerStatusOptions = [
  { key: "not-started", label: "Not started", tone: "neutral" },
  { key: "in-progress", label: "In progress", tone: "medium" },
  { key: "passed", label: "Passed", tone: "clear" },
  { key: "hold", label: "Hold", tone: "high" },
];

export const medicalRtpTrackerGroups = [
  {
    key: "gateCriteria",
    label: "Gate criteria",
    shortLabel: "Gate",
    sourceField: "rtpProgramGateCriteria",
    formPrefix: "rtpProgramTrackerGate",
  },
  {
    key: "nextSteps",
    label: "Next steps",
    shortLabel: "Next",
    sourceField: "rtpProgramNextSteps",
    formPrefix: "rtpProgramTrackerNext",
  },
  {
    key: "holdRules",
    label: "Hold rules",
    shortLabel: "Hold",
    sourceField: "rtpProgramHoldRules",
    formPrefix: "rtpProgramTrackerHold",
  },
];

const normalizeTrackerTextList = (value = []) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 12);
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return normalizeTrackerTextList(parsed);
    }
  } catch {
  }
  return text.split(/\n|;/u).map((item) => item.trim()).filter(Boolean).slice(0, 12);
};

export function normalizeMedicalRtpTrackerStatus(value = "") {
  const key = String(value || "").trim();
  return medicalRtpTrackerStatusOptions.some((option) => option.key === key) ? key : "not-started";
}

export function getMedicalRtpTrackerStatusOption(value = "") {
  const status = normalizeMedicalRtpTrackerStatus(value);
  return medicalRtpTrackerStatusOptions.find((option) => option.key === status) || medicalRtpTrackerStatusOptions[0];
}

function getTrackerStatusValue(tracker = {}, group, index) {
  const groupedValues = tracker?.[group.key];
  if (Array.isArray(groupedValues)) {
    return groupedValues[index];
  }
  if (groupedValues && typeof groupedValues === "object") {
    return groupedValues[index] ?? groupedValues[String(index)];
  }
  return tracker?.[`${group.formPrefix}${index}`];
}

export function normalizeMedicalRtpProgramTracker(tracker = {}, source = {}) {
  const safeTracker = tracker && typeof tracker === "object" ? tracker : {};
  return medicalRtpTrackerGroups.reduce((result, group) => {
    const items = normalizeTrackerTextList(source?.[group.sourceField]);
    result[group.key] = items.map((_, index) => normalizeMedicalRtpTrackerStatus(getTrackerStatusValue(safeTracker, group, index)));
    return result;
  }, {});
}

export function getMedicalRtpTrackerItems(plan = {}) {
  const tracker = normalizeMedicalRtpProgramTracker(plan.rtpProgramTracker || plan, plan);
  return medicalRtpTrackerGroups.flatMap((group) => {
    const items = normalizeTrackerTextList(plan[group.sourceField]);
    return items.map((item, index) => ({
      groupKey: group.key,
      groupLabel: group.label,
      shortLabel: group.shortLabel,
      item,
      index,
      status: normalizeMedicalRtpTrackerStatus(tracker[group.key]?.[index]),
      statusOption: getMedicalRtpTrackerStatusOption(tracker[group.key]?.[index]),
    }));
  });
}

export function getMedicalRtpTrackerSummary(plan = {}) {
  const items = getMedicalRtpTrackerItems(plan);
  const counts = items.reduce(
    (result, item) => {
      result[item.status] += 1;
      return result;
    },
    { "not-started": 0, "in-progress": 0, passed: 0, hold: 0 }
  );
  const blocker =
    items.find((item) => item.status === "hold") ||
    items.find((item) => item.status === "in-progress") ||
    items.find((item) => item.status === "not-started") ||
    null;
  const total = items.length;
  const completionLabel = total ? `${counts.passed}/${total} passed` : "No tracker items";
  const nextDecision = blocker
    ? `${blocker.status === "hold" ? "Hold" : blocker.status === "in-progress" ? "Progress" : "Start"}: ${blocker.item}`
    : total
      ? "All tracked RTP items passed"
      : "No RTP tracker yet";
  return {
    total,
    counts,
    items,
    blocker,
    completionLabel,
    nextDecision,
    tone: counts.hold ? "high" : counts["in-progress"] ? "medium" : total && counts.passed === total ? "clear" : "neutral",
  };
}
