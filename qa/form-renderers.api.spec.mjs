import { expect, test } from "@playwright/test";
import { createPasswordRevealInputRenderer } from "../src/core/form-renderers.mjs";

test("Password reveal input renderer keeps required input and toggle attributes", () => {
  const renderPasswordRevealInput = createPasswordRevealInputRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  });
  const markup = renderPasswordRevealInput("password", "Temporary password", "new-password");

  expect(markup).toContain("password-input-shell");
  expect(markup).toContain('name="password"');
  expect(markup).toContain('type="password"');
  expect(markup).toContain('autocomplete="new-password"');
  expect(markup).toContain("password-visibility-toggle");
  expect(markup).toContain("data-toggle-password-visibility");
  expect(markup).toContain('aria-pressed="false"');
});
