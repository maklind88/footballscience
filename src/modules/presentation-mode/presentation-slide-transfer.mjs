const slideScopedFields = [
  "shapes",
  "slideStyles",
  "textBoxes",
  "textFieldStyles",
  "textOverrides",
  "textOverrideUpdatedAt",
];

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function getObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeSlideOrder(slideOrder = []) {
  return [...new Set((Array.isArray(slideOrder) ? slideOrder : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function createCopiedSlideId(targetDateValue = "", layout = "slide", existingIds = new Set(), timestamp = Date.now()) {
  const safeLayout = String(layout || "slide").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "slide";
  const safeTimestamp = Math.max(0, Number(timestamp) || Date.now());
  const baseId = `info-${targetDateValue || "date"}-${safeLayout}-${safeTimestamp}`;
  let candidate = baseId;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function copyPresentationSlideToDeck({
  sourceDeck = {},
  targetDeck = {},
  sourceSlideId = "",
  targetDateValue = "",
  targetSlideOrder = [],
  timestamp = Date.now(),
} = {}) {
  const safeSourceSlideId = String(sourceSlideId || "").trim();
  const sourceSlides = Array.isArray(sourceDeck.infoSlides) ? sourceDeck.infoSlides : [];
  const sourceSlide = sourceSlides.find((slide) => String(slide?.id || "").trim() === safeSourceSlideId);
  if (!sourceSlide || !safeSourceSlideId) {
    return { copiedSlideId: "", deck: clonePlain(targetDeck) || {} };
  }

  const targetSlides = Array.isArray(targetDeck.infoSlides) ? targetDeck.infoSlides : [];
  const existingIds = new Set(targetSlides.map((slide) => String(slide?.id || "").trim()).filter(Boolean));
  const copiedSlideId = createCopiedSlideId(
    targetDateValue,
    sourceSlide.layout,
    existingIds,
    timestamp
  );
  const nextDeck = {
    ...clonePlain(targetDeck),
    infoSlides: [...clonePlain(targetSlides), { ...clonePlain(sourceSlide), id: copiedSlideId }],
    slideOrder: normalizeSlideOrder([
      ...(targetSlideOrder.length ? targetSlideOrder : targetDeck.slideOrder || []),
      copiedSlideId,
    ]),
  };

  slideScopedFields.forEach((field) => {
    const sourceBucket = getObject(sourceDeck[field]);
    if (!Object.prototype.hasOwnProperty.call(sourceBucket, safeSourceSlideId)) {
      return;
    }
    nextDeck[field] = {
      ...clonePlain(getObject(targetDeck[field])),
      [copiedSlideId]: clonePlain(sourceBucket[safeSourceSlideId]),
    };
  });

  return { copiedSlideId, deck: nextDeck };
}
