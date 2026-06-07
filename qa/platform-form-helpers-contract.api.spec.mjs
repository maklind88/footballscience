import { expect, test } from "@playwright/test";
import {
  buildPlatformTemporaryLoginMessage,
  buildPlatformUserCredentialMessage,
  getPlatformPasswordValidationMessage,
  readPlatformFormValues,
  stripPlatformPasswordConfirmation,
} from "../src/modules/platform/form-helpers.mjs";

class MockFormData {
  constructor(form) {
    this.form = form;
  }

  entries() {
    return this.form.entries;
  }
}

test("Platform form helpers normalize form values without owning submit behavior", () => {
  const values = readPlatformFormValues(
    {
      entries: [
        ["firstName", " Mak "],
        ["email", " mak@example.com "],
      ],
    },
    { FormDataCtor: MockFormData }
  );

  expect(values).toEqual({
    firstName: "Mak",
    email: "mak@example.com",
  });
});

test("Platform form helpers validate password confirmation without writing users", () => {
  expect(getPlatformPasswordValidationMessage({ password: "short", passwordConfirm: "short" })).toBe(
    "Password must be at least 6 characters."
  );
  expect(getPlatformPasswordValidationMessage({ passwordConfirm: "secret123" })).toBe("Enter the password first.");
  expect(getPlatformPasswordValidationMessage({ password: "secret123", passwordConfirm: "other123" })).toBe(
    "Passwords do not match."
  );
  expect(getPlatformPasswordValidationMessage({ password: "secret123", passwordConfirm: "secret123" })).toBe("");
});

test("Platform form helpers remove confirmation-only values", () => {
  expect(stripPlatformPasswordConfirmation({ username: "mak", passwordConfirm: "secret123" })).toEqual({
    username: "mak",
  });
});

test("Platform form helpers build stable credential messages", () => {
  const user = { firstName: "Mak", lastName: "Lind", username: "maklind88", email: "mak@example.com" };

  expect(buildPlatformUserCredentialMessage(user, "abc123")).toContain("Temporary password: abc123");
  expect(buildPlatformUserCredentialMessage(user)).toContain("Forgot password");
  expect(buildPlatformTemporaryLoginMessage(user, "abc123", true)).toBe(
    "New temporary login for mak@example.com: username maklind88, password abc123. This replaces any previous password. Copied to clipboard."
  );
});
