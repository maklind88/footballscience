import { recoveryPlan } from "./lib/data-content-recovery-plan.mjs";

// Deliberately offline. Approval of the external data destination is still pending.
if (process.argv.length !== 2) {
  console.error("Plan only: execution, connections and exports are not enabled.");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...recoveryPlan(), executionEnabled: false, destinationApproval: "approved-temporary-github-runner", executionEntry: "manual-reviewed-github-job-only" }, null, 2));
}
