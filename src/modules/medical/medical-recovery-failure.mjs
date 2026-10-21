// Only fixed categories reach the UI; browser errors can contain private values.
export function medicalRecoveryFailureMessage(error) {
  if (error?.name === "QuotaExceededError" || error?.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "The browser's storage quota was exceeded.";
  }
  if (error?.name === "SecurityError" || error?.name === "NotAllowedError") {
    return "The browser blocked access to recovery storage.";
  }
  if (error?.message === "Medical rescue storage is full.") {
    return "The recovery copy size or capacity limit was reached.";
  }
  if (["Medical rescue storage did not respond.", "Medical rescue copy did not commit in time."].includes(error?.message)) {
    return "Recovery storage did not respond in time.";
  }
  return "Recovery storage did not confirm the write.";
}
