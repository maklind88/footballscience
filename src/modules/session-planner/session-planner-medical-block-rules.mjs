const blockParticipationThresholds = Object.freeze([25, 50, 75, 100]);

export function isSessionPlannerWarmUpBlock(block = {}) {
  const id = String(block?.id ?? "").trim().toLowerCase();
  const label = String(block?.label ?? "").trim().toLowerCase();
  return [id, label].some((value) => /^warm[\s_-]*up$/.test(value));
}

function getExplicitBlockNumber(block = {}) {
  for (const value of [block?.label, block?.id]) {
    const match = String(value ?? "").trim().match(/^block[\s_-]*(\d+)\b/i);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return null;
}

export function getSessionPlannerMedicalBlockRule(blockOrNumber = 1, fallbackBlockNumber = 1) {
  if (typeof blockOrNumber === "object" && blockOrNumber !== null && isSessionPlannerWarmUpBlock(blockOrNumber)) {
    return { blockNumber: 0, label: "Warm Up", valueLabel: "10%+", min: 10 };
  }

  const explicitBlockNumber =
    typeof blockOrNumber === "object" && blockOrNumber !== null ? getExplicitBlockNumber(blockOrNumber) : blockOrNumber;
  const parsedBlockNumber = Number.parseInt(explicitBlockNumber ?? fallbackBlockNumber, 10);
  const normalizedBlockNumber = Number.isFinite(parsedBlockNumber) ? Math.max(1, parsedBlockNumber) : 1;
  const thresholdIndex = Math.min(normalizedBlockNumber, blockParticipationThresholds.length) - 1;
  const min = blockParticipationThresholds[thresholdIndex];

  return {
    blockNumber: normalizedBlockNumber,
    label: `Block ${normalizedBlockNumber}`,
    valueLabel: min === 100 ? "100%" : `${min}%+`,
    min,
  };
}
