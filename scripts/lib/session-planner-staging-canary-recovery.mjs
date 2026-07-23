import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_CANARY_MARKER_KEY,
} = require("../../api/_lib/session-planner-canary-recovery.js");
const {
  hashJsonValue,
} = require("../../api/_lib/session-planner-domain-records.js");

export function inspectSessionPlannerCanaryRecoveryState(
  current,
  baseline,
  expectedMarkerHash
) {
  if (!current?.ok) {
    return { ok: false, reasonCode: "recovery_read_failed" };
  }
  if (current.hash === baseline.hash && current.value === baseline.value) {
    return {
      ok: true,
      status: "exact_baseline",
      requiresWrite: false,
      exactBaselineRestored: true,
      concurrentStatePreserved: false,
    };
  }

  try {
    const state = JSON.parse(String(current.value ?? ""));
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return { ok: false, reasonCode: "recovery_state_invalid" };
    }
    if (!Object.hasOwn(state, SESSION_PLANNER_CANARY_MARKER_KEY)) {
      return {
        ok: true,
        status: "marker_absent_with_drift",
        requiresWrite: false,
        exactBaselineRestored: false,
        concurrentStatePreserved: true,
      };
    }
    const marker = state[SESSION_PLANNER_CANARY_MARKER_KEY];
    if (
      !marker ||
      typeof marker !== "object" ||
      Array.isArray(marker) ||
      hashJsonValue(marker) !== expectedMarkerHash
    ) {
      return { ok: false, reasonCode: "recovery_marker_changed" };
    }
    delete state[SESSION_PLANNER_CANARY_MARKER_KEY];
    return {
      ok: true,
      status: "reviewed_marker_present",
      requiresWrite: true,
      exactBaselineRestored: false,
      concurrentStatePreserved: false,
      cleanedValue: JSON.stringify(state),
    };
  } catch {
    return { ok: false, reasonCode: "recovery_state_invalid" };
  }
}

export async function recoverSessionPlannerCanaryBaseline(
  context,
  dependencies
) {
  const current = await dependencies.readState({
    appOrigin: context.appOrigin,
    accessToken: context.accessToken,
  });
  const inspection = inspectSessionPlannerCanaryRecoveryState(
    current,
    context.baseline,
    context.canaryMarkerHash
  );
  if (!inspection.ok) {
    return {
      ...inspection,
      currentRevision: current?.revision || 0,
    };
  }
  if (!inspection.requiresWrite) {
    return {
      ok: true,
      reasonCode:
        inspection.status === "exact_baseline"
          ? "recovery_already_verified"
          : "recovery_marker_already_absent_or_changed",
      alreadyRestored: inspection.status === "exact_baseline",
      exactBaselineRestored: inspection.exactBaselineRestored,
      concurrentStatePreserved: inspection.concurrentStatePreserved,
      revision: current.revision,
    };
  }

  const restored = await dependencies.writeState({
    appOrigin: context.appOrigin,
    accessToken: context.accessToken,
    value: inspection.cleanedValue,
    baseRevision: current.revision,
    baseHash: current.hash,
  });
  if (!restored.ok) {
    return {
      ok: false,
      reasonCode: "recovery_write_failed",
      currentRevision: current.revision,
    };
  }

  const verified = await dependencies.readState({
    appOrigin: context.appOrigin,
    accessToken: context.accessToken,
  });
  const verification = inspectSessionPlannerCanaryRecoveryState(
    verified,
    context.baseline,
    context.canaryMarkerHash
  );
  if (!verification.ok || verification.requiresWrite) {
    return {
      ok: false,
      reasonCode: verification.ok
        ? "recovery_marker_removal_failed"
        : verification.reasonCode,
      revision: verified?.revision || restored.revision,
    };
  }

  return {
    ok: true,
    alreadyRestored: false,
    exactBaselineRestored: verification.exactBaselineRestored,
    concurrentStatePreserved: verification.concurrentStatePreserved,
    revision: verified.revision,
    reasonCode: verification.exactBaselineRestored
      ? "recovery_verified"
      : "recovery_concurrent_state_preserved",
  };
}
