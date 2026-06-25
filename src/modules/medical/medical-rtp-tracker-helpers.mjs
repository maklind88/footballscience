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

const hasTextListItems = (value = []) => normalizeTrackerTextList(value).length > 0;

export function hasMedicalRtpProgramStarter(plan = {}) {
  return Boolean(
    plan?.rtpLibraryProfileId ||
      plan?.rtpLibraryProfileName ||
      hasTextListItems(plan?.rtpProgramPhases) ||
      hasTextListItems(plan?.rtpProgramGateCriteria) ||
      hasTextListItems(plan?.rtpProgramNextSteps) ||
      hasTextListItems(plan?.rtpProgramHoldRules)
  );
}

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

function getRtpActionForCase(caseItem = {}) {
  const plan = caseItem.plan || {};
  if (!hasMedicalRtpProgramStarter(plan)) {
    return null;
  }
  const trackerSummary = getMedicalRtpTrackerSummary(plan);
  const review = caseItem.review || {};
  const player = caseItem.player || {};
  const identity = [player.position || "Position", plan.injuryType, plan.bodyArea].filter(Boolean).join(" / ");
  const base = {
    planId: plan.id || "",
    playerId: player.id || "",
    playerName: player.name || "Player",
    identity,
    injury: plan.injuryType || plan.rtpLibraryProfileName || "RTP case",
    source: plan.rtpLibraryProfileName || "Medical Plan",
    tracker: trackerSummary,
    reviewLabel: review.label || "No review date",
    focusGroupKey: trackerSummary.blocker?.groupKey || "",
    focusIndex: Number.isInteger(trackerSummary.blocker?.index) ? String(trackerSummary.blocker.index) : "",
    focusItem: trackerSummary.blocker?.item || "",
  };

  if (trackerSummary.counts.hold) {
    return {
      ...base,
      key: "hold",
      label: "Blocked by hold rule",
      detail: trackerSummary.nextDecision,
      action: "Hold progression",
      tone: "high",
      priority: 100,
    };
  }

  if (trackerSummary.total && trackerSummary.counts.passed === trackerSummary.total) {
    return {
      ...base,
      key: "ready",
      label: "Ready for Medical review",
      detail: "All tracked RTP items passed",
      action: "Review progression",
      tone: "clear",
      priority: 80,
    };
  }

  if (review.severity >= 2) {
    return {
      ...base,
      key: "review",
      label: review.severity >= 3 ? "Review overdue" : "Review due",
      detail: review.label || "Medical review needed",
      action: "Review case",
      tone: review.severity >= 3 ? "high" : "medium",
      priority: 70,
    };
  }

  if (trackerSummary.counts["in-progress"]) {
    return {
      ...base,
      key: "exposure",
      label: "Needs next exposure decision",
      detail: trackerSummary.nextDecision,
      action: "Decide next step",
      tone: "medium",
      priority: 60,
    };
  }

  if (trackerSummary.counts["not-started"]) {
    return {
      ...base,
      key: "start",
      label: "Start RTP tracker",
      detail: trackerSummary.nextDecision,
      action: "Set first status",
      tone: "neutral",
      priority: 40,
    };
  }

  if (!trackerSummary.total) {
    return {
      ...base,
      key: "setup",
      label: "Set RTP tracker",
      detail: "Add gate, next-step or hold-rule tracking to the Medical Plan",
      action: "Open plan",
      tone: "neutral",
      priority: 30,
    };
  }

  return null;
}

export function getMedicalRtpActionQueueItems(activeCases = [], { limit = 5 } = {}) {
  const maxItems = Math.max(1, Number(limit) || 5);
  return (Array.isArray(activeCases) ? activeCases : [])
    .map(getRtpActionForCase)
    .filter(Boolean)
    .sort((first, second) => {
      if (first.priority !== second.priority) {
        return second.priority - first.priority;
      }
      return String(first.playerName || "").localeCompare(String(second.playerName || ""));
    })
    .slice(0, maxItems);
}

export function getMedicalRtpActionQueueSummary(activeCases = [], { limit = 5 } = {}) {
  const allItems = getMedicalRtpActionQueueItems(activeCases, { limit: Number.POSITIVE_INFINITY });
  const displayLimit = Math.max(1, Number(limit) || 5);
  return allItems.reduce(
    (summary, item) => {
      summary[item.key] = (summary[item.key] || 0) + 1;
      summary.total += 1;
      return summary;
    },
    {
      total: 0,
      hiddenCount: Math.max(0, allItems.length - displayLimit),
      hold: 0,
      review: 0,
      ready: 0,
      exposure: 0,
      start: 0,
      setup: 0,
      items: allItems.slice(0, displayLimit),
    }
  );
}
