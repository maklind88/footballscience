import { TRACKING_PREANNOTATION_CONTEXT_LEAD_MS } from "./trackingPreannotationReviewControllerHelpers.js";
import { createTrackingContextReplayController } from "./trackingContextReplayController.js";

export function createTrackingPreannotationContextReplayController(options = {}) {
  return createTrackingContextReplayController({
    ...options,
    contextLeadMs: TRACKING_PREANNOTATION_CONTEXT_LEAD_MS,
  });
}
