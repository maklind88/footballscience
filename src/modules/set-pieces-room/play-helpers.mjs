import { createSetPieceId } from "./state.mjs";

export function cloneSetPiecePlay(play, actorId = "") {
  const cloned = structuredClone(play);
  const elementIds = new Map();
  cloned.variants.forEach((variant) => {
    variant.id = createSetPieceId("variant");
    variant.baseVariantId = "";
    variant.branchFromPhaseId = "";
    variant.phases.forEach((phase) => {
      const oldPhaseId = phase.id;
      phase.id = createSetPieceId("phase");
      if (variant.activePhaseId === oldPhaseId) variant.activePhaseId = phase.id;
      phase.elements.forEach((element) => {
        if (!elementIds.has(element.id)) elementIds.set(element.id, createSetPieceId(element.kind));
        element.id = elementIds.get(element.id);
      });
      phase.drawings.forEach((drawing) => {
        drawing.id = createSetPieceId("drawing");
        drawing.actorId = elementIds.get(drawing.actorId) || "";
      });
    });
  });

  const oldActiveVariantId = cloned.activeVariantId;
  cloned.id = createSetPieceId("set-piece");
  cloned.title = `${cloned.title} copy`;
  cloned.activeVariantId = cloned.variants.find((_, index) => play.variants[index]?.id === oldActiveVariantId)?.id || cloned.variants[0]?.id;
  cloned.createdAt = new Date().toISOString();
  cloned.updatedAt = cloned.createdAt;
  cloned.updatedBy = actorId;
  return cloned;
}
