export function readPlatformFormValues(form, options = {}) {
  const FormDataCtor = typeof options.FormDataCtor === "function" ? options.FormDataCtor : globalThis.FormData;
  if (typeof FormDataCtor !== "function") {
    return {};
  }
  const data = new FormDataCtor(form);
  return Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value).trim()]));
}

export function getPlatformPasswordValidationMessage(values = {}) {
  const password = String(values.password || "");
  const passwordConfirm = String(values.passwordConfirm || "");
  if (password && password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (!password && passwordConfirm) {
    return "Enter the password first.";
  }
  if (password && password !== passwordConfirm) {
    return "Passwords do not match.";
  }
  return "";
}

export function stripPlatformPasswordConfirmation(values = {}) {
  const nextValues = { ...values };
  delete nextValues.passwordConfirm;
  return nextValues;
}

export function buildPlatformUserCredentialMessage(user, temporaryPassword = "") {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "there";
  const lines = [
    `Hi ${name},`,
    "",
    "Here are your Football Science login details:",
    "Website: https://footballscience.xyz/",
    `Username: ${user.username}`,
    `Email: ${user.email}`,
  ];
  if (temporaryPassword) {
    lines.push(`Temporary password: ${temporaryPassword}`);
    lines.push("");
    lines.push("Please sign in with this temporary password. You can change it from your profile afterward.");
  } else {
    lines.push("");
    lines.push("If you need a new password, use the Forgot password flow on the login screen.");
  }
  lines.push("", "If you have any issues, ask your administrator for a reset.");
  return lines.join("\n");
}

export function buildPlatformTemporaryLoginMessage(user, temporaryPassword, copied = false) {
  return `New temporary login for ${user.email}: username ${user.username}, password ${temporaryPassword}. This replaces any previous password.${
    copied ? " Copied to clipboard." : ""
  }`;
}
