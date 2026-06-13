function normalizeDecisionText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeDecisionHtml(value = "", escapeHtml = null) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getDecisionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : {};
}

function getKnownMarketCount(market = {}) {
  return (Array.isArray(market.dueDiligence) ? market.dueDiligence : []).filter((item) => item.status === "known").length;
}

export function createScoutingProfileDecisionService(deps = {}) {
  function normalizeText(value = "", limit = 160) {
    return normalizeDecisionText(value, limit, deps.normalizeText);
  }

  function escapeHtml(value = "") {
    return escapeDecisionHtml(value, deps.escapeHtml);
  }

  function getDataReadinessStatus(score) {
    if (score >= 82) {
      return "Decision ready";
    }
    if (score >= 64) {
      return "Scouting ready";
    }
    if (score >= 42) {
      return "Needs verification";
    }
    return "Data light";
  }

  function getPlayerDataReadiness(record, state = getDecisionState(deps), roleProfileId = "") {
    const intelligence = deps.getIntelligenceProfile?.(record, state, roleProfileId) || {};
    const market = deps.getMarketIntelligence?.(record, state) || {};
    const marketKnown = getKnownMarketCount(market);
    const marketTotal = Math.max(Array.isArray(market.dueDiligence) ? market.dueDiligence.length : 0, 1);
    const sourceTrace = deps.getRecordSourceTrace?.(record) || {};
    const sourceId = deps.getRecordPlayerSourceId?.(record) || normalizeText(sourceTrace.sourcePlayerId || sourceTrace.source_player_id, 160);
    const identitySource = normalizeText(sourceTrace.identitySource, 40);
    const hasMappedSourceId = Boolean(sourceId && identitySource !== "derived");
    const identityId = deps.getRecordPlayerIdentityId?.(record);
    const dateOfBirth = deps.getRecordDateOfBirth?.(record);
    const nationality = deps.getRecordNationalityMeta?.(record) || { code: "N/A" };
    const seasonRows = deps.getRecordsForPlayer?.(record) || [];
    const roleNeeds = intelligence.risk?.needs || [];
    const calibration = intelligence.calibration || {};
    const itemScores = [
      {
        label: "Player identity",
        score: identityId && dateOfBirth && nationality.code !== "N/A" ? 100 : identityId ? 68 : 28,
        detail: identityId && dateOfBirth ? `ID ${identityId} / DOB ${dateOfBirth} / ${nationality.code}` : "Needs player ID, date of birth and nationality lock.",
      },
      {
        label: "Source IDs",
        score: hasMappedSourceId ? 100 : sourceId ? 58 : 42,
        detail: hasMappedSourceId
          ? `Mapped source ID ${sourceId}`
          : sourceId
            ? "Identity is derived. Add an external player/source ID so weekly imports merge safely."
            : "Add source IDs so future imports merge safely.",
      },
      {
        label: "Role metrics",
        score: roleNeeds.length ? Math.max(30, 100 - roleNeeds.length * 18) : 100,
        detail: roleNeeds.length ? `Missing: ${roleNeeds.slice(0, 4).join(", ")}` : "Role spider has the required metric columns.",
      },
      {
        label: "Season trend",
        score: seasonRows.length >= 3 ? 100 : seasonRows.length >= 2 ? 70 : 34,
        detail: `${seasonRows.length} season row${seasonRows.length === 1 ? "" : "s"} linked to this player.`,
      },
      {
        label: "Market due diligence",
        score: Math.round((marketKnown / marketTotal) * 100),
        detail: `${marketKnown}/${marketTotal} market checks known.`,
      },
      {
        label: "Calibration sample",
        score: calibration.localSampleAverage >= 24 ? 100 : calibration.localSampleAverage >= 12 ? 72 : 44,
        detail: `${calibration.label}. Local sample ${calibration.localSampleAverage || "n/a"}.`,
      },
    ];
    const score = Math.round(itemScores.reduce((sum, item) => sum + item.score, 0) / Math.max(itemScores.length, 1));
    const weakest = [...itemScores].sort((a, b) => a.score - b.score)[0] || null;
    return {
      score,
      label: getDataReadinessStatus(score),
      weakest,
      items: itemScores.map((item) => ({
        ...item,
        status: item.score >= 82 ? "ready" : item.score >= 58 ? "partial" : "missing",
      })),
    };
  }

  function getDecisionGate(record, state = getDecisionState(deps), roleProfileId = "") {
    const intelligence = deps.getIntelligenceProfile?.(record, state, roleProfileId) || {};
    const readiness = getPlayerDataReadiness(record, state, roleProfileId);
    const market = deps.getMarketIntelligence?.(record, state) || {};
    const target = deps.findTargetByRecordId?.(deps.getRecordId?.(record), state);
    const marketKnown = getKnownMarketCount(market);
    const marketReady = marketKnown >= 4 || ["shortlist", "contacted", "negotiation"].includes(target?.status || "");
    const roleReady =
      Number.isFinite(intelligence.roleFitScore) &&
      intelligence.roleFitScore >= 74 &&
      Number.isFinite(intelligence.floor?.score) &&
      intelligence.floor.score >= 50;
    const evidenceReady = (intelligence.confidence?.score || 0) >= 82 && readiness.score >= 72;
    const highUpside = intelligence.roleFitScore >= 80 && (intelligence.confidence?.score || 0) >= 66;
    if (roleReady && evidenceReady && marketReady) {
      return {
        tone: "ready",
        label: "Decision gate",
        title: "Ready for decision meeting",
        action: "Prepare final recommendation and confirm commercial terms.",
        blocker: "No major data blocker.",
        nextStep: "Create report memo and move to decision meeting.",
      };
    }
    if (roleReady && evidenceReady && !marketReady) {
      return {
        tone: "market",
        label: "Decision gate",
        title: "Sporting case ready, market blocked",
        action: "Verify contract, agent, wage band and transfer pathway before decision.",
        blocker: "Market due diligence is incomplete.",
        nextStep: "Complete due diligence checklist.",
      };
    }
    if (highUpside && intelligence.floor?.score < 50) {
      return {
        tone: "watch",
        label: "Decision gate",
        title: "High upside, role-floor risk",
        action: "Scout the weakest role KPI before shortlisting.",
        blocker: `Role floor ${Number.isFinite(intelligence.floor?.score) ? `P${intelligence.floor.score}` : "missing"}.`,
        nextStep: "Open quick view and validate the watch point on video.",
      };
    }
    if (highUpside && (intelligence.confidence?.score || 0) < 82) {
      return {
        tone: "evidence",
        label: "Decision gate",
        title: "Promising but needs evidence",
        action: "Increase sample confidence before pushing to decision.",
        blocker: intelligence.confidence?.detail,
        nextStep: "Add more match data, trend history or live scout notes.",
      };
    }
    if (readiness.score < 64) {
      return {
        tone: "data",
        label: "Decision gate",
        title: "Data not decision-safe",
        action: "Fix identity/source/role metric gaps first.",
        blocker: readiness.weakest ? `${readiness.weakest.label}: ${readiness.weakest.detail}` : "Data readiness is low.",
        nextStep: "Complete missing data before compare or report.",
      };
    }
    return {
      tone: "monitor",
      label: "Decision gate",
      title: "Monitor, not decision-ready",
      action: "Keep in database watch unless tactical context changes.",
      blocker: intelligence.risk?.detail,
      nextStep: "Use saved view or compare set if the role need becomes active.",
    };
  }

  function renderDecisionGateCard(record, state = getDecisionState(deps), roleProfileId = "") {
    const gate = getDecisionGate(record, state, roleProfileId);
    return `
    <article class="scouting-decision-gate is-${escapeHtml(gate.tone)}">
      <span>${escapeHtml(gate.label)}</span>
      <strong>${escapeHtml(gate.title)}</strong>
      <p>${escapeHtml(gate.action)}</p>
      <em>${escapeHtml(`Blocker: ${gate.blocker}`)}</em>
      <small>${escapeHtml(gate.nextStep)}</small>
    </article>
  `;
  }

  return {
    getDataReadinessStatus,
    getDecisionGate,
    getPlayerDataReadiness,
    renderDecisionGateCard,
  };
}
