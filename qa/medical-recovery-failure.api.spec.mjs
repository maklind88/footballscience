import { test, expect } from "@playwright/test";
import { medicalRecoveryFailureMessage } from "../src/modules/medical/medical-recovery-failure.mjs";

test("Medical recovery failure categories never expose raw private error details", () => {
  for (const name of ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]) {
    expect(medicalRecoveryFailureMessage({ name, message: "private data" })).toContain("quota");
  }
  for (const name of ["SecurityError", "NotAllowedError"]) {
    expect(medicalRecoveryFailureMessage({ name, message: "private data" })).toContain("blocked");
  }
  expect(medicalRecoveryFailureMessage(new Error("Medical rescue storage is full."))).toContain("capacity limit");
  expect(medicalRecoveryFailureMessage(new Error("Medical rescue storage did not respond."))).toContain("in time");
  expect(medicalRecoveryFailureMessage(new Error("Medical rescue copy did not commit in time."))).toContain("in time");
  expect(medicalRecoveryFailureMessage(new Error("patient notes and private URL"))).toBe("Recovery storage did not confirm the write.");
});
