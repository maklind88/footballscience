import { getFootballScienceDbReadiness } from "./scouting-football-science-db-adapter.mjs";

function normalizeModelText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeModelList(items = [], mapper = (item) => item) {
  return (Array.isArray(items) ? items : []).map(mapper).filter(Boolean);
}

export function normalizeFootballScienceDbQualityNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

export function normalizeFootballScienceDbQualityPlayer(player = {}, options = {}) {
  const normalizeText = options.normalizeText;
  return {
    id: normalizeModelText(player.id, 160, normalizeText),
    fsdbId: normalizeModelText(player.fsdbId || player.id, 160, normalizeText),
    name: normalizeModelText(player.name, 180, normalizeText) || "Unknown player",
    team: normalizeModelText(player.team, 180, normalizeText),
    position: normalizeModelText(player.position, 80, normalizeText),
    genderSegment: normalizeModelText(player.genderSegment, 40, normalizeText) || "unknown",
    nationality: normalizeModelText(player.nationality, 120, normalizeText),
    nameQuality: normalizeModelText(player.nameQuality, 40, normalizeText) || "unknown",
    sourceConfidence: normalizeFootballScienceDbQualityNumber(player.sourceConfidence),
    sourceLinkCount: normalizeFootballScienceDbQualityNumber(player.sourceLinkCount),
    rosterEntryCount: normalizeFootballScienceDbQualityNumber(player.rosterEntryCount),
    metricCount: normalizeFootballScienceDbQualityNumber(player.metricCount),
    dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
    reviewStatus: normalizeModelText(player.reviewStatus, 60, normalizeText),
    reviewLabel: normalizeModelText(player.reviewLabel, 120, normalizeText),
    reviewReasons: Array.isArray(player.reviewReasons)
      ? player.reviewReasons
          .map((reason) => ({
            code: normalizeModelText(reason?.code, 80, normalizeText),
            label: normalizeModelText(reason?.label, 160, normalizeText),
            priority: normalizeModelText(reason?.priority, 40, normalizeText) || "medium",
          }))
          .filter((reason) => reason.label)
          .slice(0, 8)
      : [],
  };
}

export function normalizeFootballScienceDbQualitySummary(summary = {}, options = {}) {
  const normalizeText = options.normalizeText;
  const totals = summary?.totals && typeof summary.totals === "object" && !Array.isArray(summary.totals) ? summary.totals : {};
  const coverage = summary?.coverage && typeof summary.coverage === "object" && !Array.isArray(summary.coverage) ? summary.coverage : {};
  const counts = summary?.counts && typeof summary.counts === "object" && !Array.isArray(summary.counts) ? summary.counts : {};
  const reviewQueues = summary?.reviewQueues && typeof summary.reviewQueues === "object" && !Array.isArray(summary.reviewQueues) ? summary.reviewQueues : {};
  return {
    generatedAt: normalizeModelText(summary.generatedAt, 80, normalizeText),
    countStrategy: normalizeModelText(summary.countStrategy, 40, normalizeText) || "planned",
    totals: {
      players: normalizeFootballScienceDbQualityNumber(totals.players),
      women: normalizeFootballScienceDbQualityNumber(totals.women),
      men: normalizeFootballScienceDbQualityNumber(totals.men),
      mixed: normalizeFootballScienceDbQualityNumber(totals.mixed),
      unknownGender: normalizeFootballScienceDbQualityNumber(totals.unknownGender),
    },
    coverage: {
      profileCompleteness: normalizeFootballScienceDbQualityNumber(coverage.profileCompleteness),
      fullNamePct: normalizeFootballScienceDbQualityNumber(coverage.fullNamePct),
      dedupePct: normalizeFootballScienceDbQualityNumber(coverage.dedupePct),
      sourceLinkPct: normalizeFootballScienceDbQualityNumber(coverage.sourceLinkPct),
      rosterPct: normalizeFootballScienceDbQualityNumber(coverage.rosterPct),
      statsPct: normalizeFootballScienceDbQualityNumber(coverage.statsPct),
      spiderMetricPct: normalizeFootballScienceDbQualityNumber(coverage.spiderMetricPct),
      birthDatePct: normalizeFootballScienceDbQualityNumber(coverage.birthDatePct),
      nationalityPct: normalizeFootballScienceDbQualityNumber(coverage.nationalityPct),
      positionPct: normalizeFootballScienceDbQualityNumber(coverage.positionPct),
    },
    counts: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, normalizeFootballScienceDbQualityNumber(value)])
    ),
    reviewQueues: {
      weakIdentity: Array.isArray(reviewQueues.weakIdentity)
        ? reviewQueues.weakIdentity.map((player) => normalizeFootballScienceDbQualityPlayer(player, options))
        : [],
      initialNames: Array.isArray(reviewQueues.initialNames)
        ? reviewQueues.initialNames.map((player) => normalizeFootballScienceDbQualityPlayer(player, options))
        : [],
    },
  };
}

export function normalizeFootballScienceDbReview(review = {}, options = {}) {
  const normalizeText = options.normalizeText;
  const reasons = Array.isArray(review.reasons)
    ? review.reasons
        .map((reason) => ({
          code: normalizeModelText(reason?.code, 80, normalizeText),
          label: normalizeModelText(reason?.label, 180, normalizeText),
          priority: normalizeModelText(reason?.priority, 40, normalizeText) || "medium",
        }))
        .filter((reason) => reason.label)
        .slice(0, 12)
    : [];
  return {
    status: normalizeModelText(review.status, 80, normalizeText) || (reasons.length ? "needs_review" : "ready"),
    label: normalizeModelText(review.label, 140, normalizeText) || (reasons.length ? "Needs review" : "Ready"),
    reasons,
  };
}

export function normalizeFootballScienceDbProfile(result = {}, options = {}) {
  const normalizeText = options.normalizeText;
  const player = result.player && typeof result.player === "object" && !Array.isArray(result.player) ? result.player : {};
  return {
    player: {
      id: normalizeModelText(player.id, 160, normalizeText),
      fsdbId: normalizeModelText(player.fsdbId, 160, normalizeText),
      name: normalizeModelText(player.name || player.fullName || player.displayName, 180, normalizeText) || "Unknown player",
      fullName: normalizeModelText(player.fullName, 240, normalizeText),
      dateOfBirth: normalizeModelText(player.dateOfBirth, 40, normalizeText),
      birthYear: normalizeFootballScienceDbQualityNumber(player.birthYear),
      genderSegment: normalizeModelText(player.genderSegment, 40, normalizeText) || "unknown",
      nationality: normalizeModelText(player.nationality, 120, normalizeText),
      birthCountry: normalizeModelText(player.birthCountry, 120, normalizeText),
      primaryPosition: normalizeModelText(player.primaryPosition, 80, normalizeText),
      positionGroup: normalizeModelText(player.positionGroup, 40, normalizeText),
      currentTeam: normalizeModelText(player.currentTeam, 180, normalizeText),
      currentCompetition: normalizeModelText(player.currentCompetition, 180, normalizeText),
      sourceConfidence: normalizeFootballScienceDbQualityNumber(player.sourceConfidence),
      sourceLinkCount: normalizeFootballScienceDbQualityNumber(player.sourceLinkCount),
      rosterEntryCount: normalizeFootballScienceDbQualityNumber(player.rosterEntryCount),
      seasonStatCount: normalizeFootballScienceDbQualityNumber(player.seasonStatCount),
      metricCount: normalizeFootballScienceDbQualityNumber(player.metricCount),
      nameQuality: normalizeModelText(player.nameQuality, 40, normalizeText) || "unknown",
      identityStatus: normalizeModelText(player.identityStatus, 40, normalizeText) || "unverified",
      dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
      dataReadiness: getFootballScienceDbReadiness(player, { normalizeText }),
    },
    review: normalizeFootballScienceDbReview(result.review || {}, options),
    aliases: normalizeModelList(result.aliases, (alias) => ({
      alias: normalizeModelText(alias?.alias, 240, normalizeText),
      aliasType: normalizeModelText(alias?.aliasType, 40, normalizeText),
      sourceSystem: normalizeModelText(alias?.sourceSystem, 60, normalizeText),
      confidence: normalizeFootballScienceDbQualityNumber(alias?.confidence),
      status: normalizeModelText(alias?.status, 40, normalizeText),
    })),
    sourceLinks: normalizeModelList(result.sourceLinks, (link) => ({
      sourceSystem: normalizeModelText(link?.sourceSystem, 60, normalizeText),
      sourceEntityId: normalizeModelText(link?.sourceEntityId, 180, normalizeText),
      sourceUrl: normalizeModelText(link?.sourceUrl, 600, normalizeText),
      confidence: normalizeFootballScienceDbQualityNumber(link?.confidence),
      verifiedStatus: normalizeModelText(link?.verifiedStatus, 40, normalizeText),
      importedAt: normalizeModelText(link?.importedAt, 40, normalizeText),
    })),
    rosters: normalizeModelList(result.rosters, (roster) => ({
      season: normalizeModelText(roster?.season, 80, normalizeText),
      team: normalizeModelText(roster?.team, 180, normalizeText),
      competition: normalizeModelText(roster?.competition, 180, normalizeText),
      country: normalizeModelText(roster?.country, 120, normalizeText),
      position: normalizeModelText(roster?.position || roster?.positionGroup, 160, normalizeText),
      rosterStatus: normalizeModelText(roster?.rosterStatus, 40, normalizeText),
      sourceSystem: normalizeModelText(roster?.sourceSystem, 60, normalizeText),
    })),
    stats: normalizeModelList(result.stats, (stat) => ({
      season: normalizeModelText(stat?.season, 80, normalizeText),
      team: normalizeModelText(stat?.team, 180, normalizeText),
      competition: normalizeModelText(stat?.competition, 180, normalizeText),
      position: normalizeModelText(stat?.position, 160, normalizeText),
      matches: Number.isFinite(Number(stat?.matches)) ? Number(stat.matches) : null,
      starts: Number.isFinite(Number(stat?.starts)) ? Number(stat.starts) : null,
      minutes: Number.isFinite(Number(stat?.minutes)) ? Number(stat.minutes) : 0,
      metrics: stat?.metrics && typeof stat.metrics === "object" && !Array.isArray(stat.metrics) ? stat.metrics : {},
      metricCount: normalizeFootballScienceDbQualityNumber(stat?.metricCount),
      sourceSystem: normalizeModelText(stat?.sourceSystem, 60, normalizeText),
    })),
  };
}

export function createFootballScienceDbScoutingModels(options = {}) {
  return {
    normalizeQualityNumber: normalizeFootballScienceDbQualityNumber,
    normalizeQualityPlayer(player = {}) {
      return normalizeFootballScienceDbQualityPlayer(player, options);
    },
    normalizeQualitySummary(summary = {}) {
      return normalizeFootballScienceDbQualitySummary(summary, options);
    },
    normalizeReview(review = {}) {
      return normalizeFootballScienceDbReview(review, options);
    },
    normalizeProfile(result = {}) {
      return normalizeFootballScienceDbProfile(result, options);
    },
  };
}
