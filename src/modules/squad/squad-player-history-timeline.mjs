const cleanText = (value = "", fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const hasValue = (value) => cleanText(value) !== "";

const formatPercent = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue}%` : "";
};

const getSortTime = (value = "") => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const normalizeTypeLabel = (value = "", fallback = "update") =>
  cleanText(value, fallback).replaceAll("-", " ");

const createDetail = (label, value) => {
  const cleanValue = cleanText(value);
  return cleanValue ? { label: cleanText(label), value: cleanValue } : null;
};

const compactDetails = (details = []) => details.filter(Boolean).filter((item) => hasValue(item.label) && hasValue(item.value));

const formatDateLabel = (dateValue, formatMedicalDateLabel) => {
  const cleanDateValue = cleanText(dateValue);
  if (!cleanDateValue) {
    return "";
  }
  try {
    return cleanText(formatMedicalDateLabel(cleanDateValue), cleanDateValue);
  } catch {
    return cleanDateValue;
  }
};

const resolveMedicalActor = (item = {}, resolveActorLabel, fallback = "Medical team") =>
  resolveActorLabel(cleanText(item.updatedBy || item.createdBy), fallback);

const createProfileChangeEntry = (entry = {}, index = 0, player = {}) => {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  return {
    id: cleanText(entry.id, `profile-change-${index}`),
    module: "Squad Room",
    typeLabel: normalizeTypeLabel(entry.type, "profile update"),
    title: cleanText(entry.summary, `${cleanText(player.name, "Player")} updated`),
    actor: cleanText(entry.actor, "Football Science"),
    createdAt: cleanText(entry.createdAt),
    sortTime: getSortTime(entry.createdAt),
    summary: "",
    details: compactDetails(
      changes.slice(0, 6).map((change) =>
        createDetail(change.field, `${cleanText(change.from, "-")} -> ${cleanText(change.to, "-")}`)
      )
    ),
  };
};

const createMedicalRecordEntry = ({
  record = {},
  index = 0,
  getMedicalRecordStatus,
  getMedicalRtpPhaseOption,
  formatMedicalDateLabel,
  resolveActorLabel,
} = {}) => {
  const status = getMedicalRecordStatus(record) || {};
  const statusLabel = cleanText(status.label, cleanText(record.status, "Medical status"));
  const participationLabel = formatPercent(record.participation);
  const phase = getMedicalRtpPhaseOption(record.rtpPhase) || {};
  const dateLabel = formatDateLabel(record.date, formatMedicalDateLabel);
  const isSquadAvailabilityBlock = record.source === "squad-availability";
  const isArchived = hasValue(record.archivedAt);
  const title = isSquadAvailabilityBlock ? "Squad availability block" : "Medical recommendation";
  return {
    id: cleanText(record.id, `medical-record-${index}`),
    module: "Medical",
    typeLabel: isArchived ? "archived medical log" : isSquadAvailabilityBlock ? "squad availability" : "medical log",
    title,
    actor: resolveMedicalActor(record, resolveActorLabel, "Medical team"),
    createdAt: cleanText(record.updatedAt || record.createdAt || record.date),
    sortTime: getSortTime(record.updatedAt || record.createdAt || record.date),
    summary: [dateLabel, [statusLabel, participationLabel].filter(Boolean).join(" / ")].filter(Boolean).join(" - "),
    details: compactDetails([
      createDetail("Date", dateLabel),
      createDetail("Status", statusLabel),
      createDetail("Participation", participationLabel),
      createDetail("RTP", phase.label),
      createDetail("Coach note", record.shareWithCoach || isSquadAvailabilityBlock ? record.coachNote : ""),
      createDetail("Archived", formatDateLabel(record.archivedAt, formatMedicalDateLabel)),
    ]),
  };
};

const createMedicalPlanEntry = ({
  plan = {},
  index = 0,
  getMedicalRecordStatus,
  getMedicalRtpPhaseOption,
  formatMedicalDateLabel,
  resolveActorLabel,
} = {}) => {
  const planStatus = getMedicalRecordStatus({
    status: plan.status,
    date: plan.startDate,
    rtpPhase: plan.rtpPhase,
  }) || {};
  const statusLabel = cleanText(planStatus.label, cleanText(plan.status, "Medical plan"));
  const phase = getMedicalRtpPhaseOption(plan.rtpPhase) || {};
  const startLabel = formatDateLabel(plan.startDate, formatMedicalDateLabel);
  const endLabel = formatDateLabel(plan.endDate, formatMedicalDateLabel);
  const reviewLabel = formatDateLabel(plan.reviewDate, formatMedicalDateLabel);
  const archivedLabel = formatDateLabel(plan.archivedAt, formatMedicalDateLabel);
  const participationLabel = formatPercent(plan.participation);
  const injuryLabel = [plan.injuryType, plan.bodyArea].map((value) => cleanText(value)).filter(Boolean).join(" / ");
  return {
    id: cleanText(plan.id, `medical-plan-${index}`),
    module: "Medical",
    typeLabel: hasValue(plan.archivedAt) ? "archived availability plan" : "availability plan",
    title: hasValue(plan.archivedAt) ? "Archived availability plan" : "Availability plan",
    actor: resolveMedicalActor(plan, resolveActorLabel, "Medical team"),
    createdAt: cleanText(plan.updatedAt || plan.createdAt || plan.startDate),
    sortTime: getSortTime(plan.updatedAt || plan.createdAt || plan.startDate),
    summary: [injuryLabel, [startLabel, endLabel].filter(Boolean).join(" -> "), participationLabel].filter(Boolean).join(" · "),
    details: compactDetails([
      createDetail("Issue", injuryLabel),
      createDetail("Period", [startLabel, endLabel].filter(Boolean).join(" -> ")),
      createDetail("Status", statusLabel),
      createDetail("Participation", participationLabel),
      createDetail("RTP", phase.label),
      createDetail("Review date", reviewLabel),
      createDetail("Coach note", plan.shareWithCoach ? plan.coachNote : ""),
      createDetail("Archived", archivedLabel),
    ]),
  };
};

export function createSquadPlayerHistoryTimeline({
  player = {},
  profileChanges = [],
  medicalRecords = [],
  medicalPlans = [],
  getMedicalRecordStatus = () => ({ label: "" }),
  getMedicalRtpPhaseOption = () => ({ label: "" }),
  formatMedicalDateLabel = (value) => String(value || ""),
  resolveActorLabel = (_actorId, fallback = "Football Science") => fallback,
  limit = 80,
} = {}) {
  const profileEntries = (Array.isArray(profileChanges) ? profileChanges : []).map((entry, index) =>
    createProfileChangeEntry(entry, index, player)
  );
  const medicalRecordEntries = (Array.isArray(medicalRecords) ? medicalRecords : []).map((record, index) =>
    createMedicalRecordEntry({
      record,
      index,
      getMedicalRecordStatus,
      getMedicalRtpPhaseOption,
      formatMedicalDateLabel,
      resolveActorLabel,
    })
  );
  const medicalPlanEntries = (Array.isArray(medicalPlans) ? medicalPlans : []).map((plan, index) =>
    createMedicalPlanEntry({
      plan,
      index,
      getMedicalRecordStatus,
      getMedicalRtpPhaseOption,
      formatMedicalDateLabel,
      resolveActorLabel,
    })
  );

  return [...profileEntries, ...medicalRecordEntries, ...medicalPlanEntries]
    .sort((first, second) => second.sortTime - first.sortTime)
    .slice(0, Math.max(1, Number(limit) || 80));
}
