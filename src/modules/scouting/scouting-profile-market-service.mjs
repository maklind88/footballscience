const CONTRACT_STATUS_OPTIONS = Object.freeze([
  { value: "unknown", label: "Unknown / unverified" },
  { value: "under-contract", label: "Under contract" },
  { value: "option", label: "Option year exists" },
  { value: "free-agent", label: "Free agent" },
  { value: "loan", label: "Loan situation" },
  { value: "contacted", label: "Agent contacted" },
]);

const MARKET_COMPLETENESS_FIELDS = Object.freeze([
  "contractEnd",
  "optionYears",
  "agent",
  "wageBand",
  "estimatedFee",
  "salaryRange",
  "dealProbability",
  "budgetImpact",
  "transferStatus",
  "medicalLoad",
  "roleTranslation",
]);

function normalizeServiceText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function getServiceState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : {};
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function getShadowRoles(deps = {}, state = {}, recordId = "") {
  const slots = Array.isArray(deps.getShadowSlots?.()) ? deps.getShadowSlots() : [];
  return slots.filter((slot) => {
    const recordIds = deps.getShadowSlotRecordIds?.(slot.id, state);
    return Array.isArray(recordIds) && recordIds.includes(recordId);
  });
}

export function createScoutingProfileMarketService(deps = {}) {
  function normalizeText(value = "", limit = 160) {
    return normalizeServiceText(value, limit, deps.normalizeText);
  }

  function getContractStatusOptions() {
    return CONTRACT_STATUS_OPTIONS.map((option) => ({ ...option }));
  }

  function getContractStatusLabel(value) {
    const normalized = normalizeText(value, 40) || "unknown";
    return CONTRACT_STATUS_OPTIONS.find((option) => option.value === normalized)?.label || "Unknown / unverified";
  }

  function normalizeMarketInfo(recordId, value = {}) {
    const id = normalizeText(recordId || value.recordId, 160);
    const status = normalizeText(value.contractStatus, 40) || "unknown";
    const allowedStatus = CONTRACT_STATUS_OPTIONS.some((option) => option.value === status) ? status : "unknown";
    return {
      recordId: id,
      contractStatus: allowedStatus,
      contractEnd: normalizeText(value.contractEnd, 60),
      optionYears: normalizeText(value.optionYears, 120),
      agent: normalizeText(value.agent, 120),
      wageBand: normalizeText(value.wageBand, 120),
      estimatedFee: normalizeText(value.estimatedFee, 120),
      salaryRange: normalizeText(value.salaryRange, 120),
      dealProbability: normalizeText(value.dealProbability, 80),
      budgetImpact: normalizeText(value.budgetImpact, 180),
      transferStatus: normalizeText(value.transferStatus, 180),
      medicalLoad: normalizeText(value.medicalLoad, 220),
      roleTranslation: normalizeText(value.roleTranslation, 260),
      notes: normalizeText(value.notes, 500),
      updatedAt: normalizeText(value.updatedAt, 40),
    };
  }

  function getMarketInfo(recordId, state = getServiceState(deps)) {
    const id = normalizeText(recordId, 160);
    const records = state.marketIntel && typeof state.marketIntel === "object" ? state.marketIntel : {};
    return normalizeMarketInfo(id, records[id] || {});
  }

  function getMarketCompleteness(info = {}) {
    const safeInfo = normalizeMarketInfo(info.recordId, info);
    const completed =
      MARKET_COMPLETENESS_FIELDS.filter((field) => normalizeText(safeInfo[field], 280)).length +
      (safeInfo.contractStatus !== "unknown" ? 1 : 0);
    return Math.round((completed / (MARKET_COMPLETENESS_FIELDS.length + 1)) * 100);
  }

  function getMarketIntelligence(record, state = getServiceState(deps)) {
    const recordId = normalizeText(deps.getRecordId?.(record), 160);
    const roleFitScore = deps.getRoleFitScore?.(record);
    const age = deps.getRecordAge?.(record);
    const minutes = deps.getRecordMinutes?.(record);
    const bestSignal = deps.getBestSignal?.(record);
    const target = deps.findTargetByRecordId?.(recordId, state) || null;
    const saved = getMarketInfo(recordId, state);
    const hasSavedContractContext = Boolean(
      saved.contractStatus !== "unknown" ||
        saved.contractEnd ||
        saved.optionYears ||
        saved.agent ||
        saved.wageBand ||
        saved.transferStatus
    );
    const favorite = deps.isRecordFavorited?.(recordId) === true;
    const shadowRoles = getShadowRoles(deps, state, recordId);
    const positionGroup = normalizeText(deps.getPositionGroup?.(record), 40);
    const segment =
      isFiniteNumber(roleFitScore) && roleFitScore >= 82 && isFiniteNumber(age) && age <= 24
        ? "Strategic upside signing"
        : isFiniteNumber(roleFitScore) && roleFitScore >= 82
          ? "Immediate impact target"
          : isFiniteNumber(age) && age <= 23 && isFiniteNumber(roleFitScore) && roleFitScore >= 70
            ? "Breakout watch"
            : isFiniteNumber(roleFitScore) && roleFitScore >= 70 && minutes <= 1600
              ? "Value opportunity"
              : "Monitoring profile";
    const urgency =
      target?.priority === "urgent"
        ? "Urgent follow-up"
        : shadowRoles.length && isFiniteNumber(roleFitScore) && roleFitScore >= 75
          ? "Live scout soon"
          : favorite || target
            ? "Keep active"
            : "Verify before pipeline";
    const availability = hasSavedContractContext
      ? `${getContractStatusLabel(saved.contractStatus)}${saved.contractEnd ? ` / Ends ${saved.contractEnd}` : ""}${saved.agent ? ` / Agent ${saved.agent}` : ""}`
      : target
        ? "Pipeline target - contract still unverified"
        : shadowRoles.length
          ? "Shadow XI target - verify agent/contract"
          : favorite
            ? "Favorite - needs contract check"
            : "Contract status unknown";
    const negotiationAngle = saved.transferStatus
      ? `Market note: ${saved.transferStatus}`
      : minutes <= 900
        ? "Potential minutes/opportunity angle: ask why playing time is limited."
        : isFiniteNumber(age) && age <= 23
          ? "Development pathway angle: sell role growth, minutes and performance plan."
          : isFiniteNumber(roleFitScore) && roleFitScore >= 82
            ? "Sporting impact angle: clarify fee/wage level early."
            : "Low-pressure monitoring angle: gather agent and contract context first.";
    const checks = [
      saved.contractEnd ? `Contract end: ${saved.contractEnd}` : "Contract end date, option years and release clauses",
      saved.optionYears ? `Option/release context: ${saved.optionYears}` : "Option years and release clauses",
      saved.agent || saved.wageBand
        ? `Agent/wage: ${[saved.agent ? `Agent ${saved.agent}` : "", saved.wageBand ? `Wage ${saved.wageBand}` : ""].filter(Boolean).join(" / ")}`
        : "Agent contact, current wage band and transfer expectations",
      saved.medicalLoad ? `Medical/load: ${saved.medicalLoad}` : "Medical availability, recent injuries and match load",
      saved.roleTranslation
        ? `Role translation: ${saved.roleTranslation}`
        : positionGroup === "GK"
          ? "Distribution and pressure profile on video"
          : "Role translation against stronger opposition",
    ];
    const dueDiligence = [
      {
        label: "Contract",
        status: saved.contractStatus !== "unknown" || saved.contractEnd ? "known" : "missing",
        detail: saved.contractEnd ? `Ends ${saved.contractEnd}` : "Contract end and club option unverified",
      },
      {
        label: "Agent",
        status: saved.agent ? "known" : "missing",
        detail: saved.agent || "Agent/agency not verified",
      },
      {
        label: "Wages",
        status: saved.wageBand || saved.salaryRange ? "known" : "missing",
        detail: saved.wageBand || saved.salaryRange || "Wage band not verified",
      },
      {
        label: "Injury/load",
        status: saved.medicalLoad ? "known" : "missing",
        detail: saved.medicalLoad || "Injury and match-load check required",
      },
      {
        label: "Role translation",
        status: saved.roleTranslation ? "known" : "missing",
        detail: saved.roleTranslation || "Needs video/live validation against our model",
      },
      {
        label: "Transfer heatmap",
        status: saved.transferStatus || saved.dealProbability ? "known" : "missing",
        detail: saved.transferStatus || saved.dealProbability || "Club stance and deal probability unknown",
      },
    ];
    return {
      segment,
      urgency,
      availability,
      negotiationAngle,
      checks,
      dueDiligence,
      saved,
      completeness: getMarketCompleteness(saved),
      bestSignal: bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal",
    };
  }

  function getProfileReportDraft(record, state = getServiceState(deps)) {
    const playerRows = (deps.getRecordsForPlayer?.(record) || []).slice(0, 10);
    const recommendation = deps.getProfileRecommendation?.(record, state) || {};
    const intelligence = deps.getIntelligenceProfile?.(record, state) || {};
    const readiness = deps.getPlayerDataReadiness?.(record, state) || {};
    const gate = deps.getDecisionGate?.(record, state) || {};
    const market = getMarketIntelligence(record, state);
    const savedMarket = market.saved || normalizeMarketInfo(deps.getRecordId?.(record), {});
    const seasonInsights = deps.getSeasonInsights?.(record, playerRows) || {};
    const roleFitScore = deps.getRoleFitScore?.(record);
    const bestSignal = deps.getBestSignal?.(record);
    const similarPlayers = deps.getComparablePlayers?.(record, 3) || [];
    const similarText = similarPlayers.length
      ? similarPlayers.map((item) => `${deps.getRecordName?.(item.record)} (${item.similarity}% similar)`).join(", ")
      : "No strong comparable profile yet";
    return normalizeText(
      [
        `${deps.getRecordName?.(record)} - ${deps.getRecordPosition?.(record)} / ${deps.getRecordTeam?.(record) || "No club"}.`,
        `Decision: ${recommendation.action}. Role fit ${isFiniteNumber(roleFitScore) ? `P${roleFitScore}` : "n/a"} (${deps.getRoleFitLabel?.(roleFitScore)}).`,
        `Decision gate: ${gate.title}. Next step: ${gate.nextStep}. Blocker: ${gate.blocker}.`,
        `Signal: ${intelligence.signal?.headline}. ${intelligence.signal?.detail}`,
        `Confidence: ${intelligence.confidence?.label} ${intelligence.confidence?.score}/99. ${intelligence.confidence?.detail}`,
        `Risk: ${intelligence.risk?.label}. ${intelligence.risk?.detail}`,
        `Data needs: ${intelligence.risk?.needs?.length ? intelligence.risk.needs.join(", ") : "none for selected role spider"}.`,
        `Data readiness: ${readiness.label} ${readiness.score}%. Next data need: ${readiness.weakest?.label || "none"}.`,
        `Best data signal: ${bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal"}.`,
        `Market lens: ${market.segment}. Availability: ${market.availability}. Urgency: ${market.urgency}.`,
        `Contract/agent detail: status ${getContractStatusLabel(savedMarket.contractStatus)}; end ${savedMarket.contractEnd || "unknown"}; option ${savedMarket.optionYears || "unknown"}; agent ${savedMarket.agent || "unknown"}; wage band ${savedMarket.wageBand || "unknown"}; fee ${savedMarket.estimatedFee || "unknown"}; salary ${savedMarket.salaryRange || "unknown"}; deal probability ${savedMarket.dealProbability || "unknown"}; budget impact ${savedMarket.budgetImpact || "unknown"}; transfer status ${savedMarket.transferStatus || "unknown"}.`,
        `Season trend: ${seasonInsights.trendLabel}. Sample: ${seasonInsights.reliability}. Best season: ${seasonInsights.bestSeason}.`,
        `Risk/read: ${recommendation.risk}`,
        `Negotiation angle: ${market.negotiationAngle}`,
        `Medical/load: ${savedMarket.medicalLoad || "not verified"}. Role translation: ${savedMarket.roleTranslation || "not verified"}.`,
        savedMarket.notes ? `Market notes: ${savedMarket.notes}` : "",
        `Comparable profiles: ${similarText}.`,
        `Due diligence: ${market.checks.join("; ")}.`,
      ].join(" "),
      1200
    );
  }

  return {
    getContractStatusLabel,
    getContractStatusOptions,
    getMarketCompleteness,
    getMarketInfo,
    getMarketIntelligence,
    getProfileReportDraft,
    normalizeMarketInfo,
  };
}
