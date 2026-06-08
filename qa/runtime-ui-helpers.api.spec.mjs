import { expect, test } from "@playwright/test";
import {
  addCalendarDays,
  clamp,
  escapeHtml,
  formatDashboardDateTime,
  setFormSubmitButtonState,
} from "../src/core/runtime-ui-helpers.mjs";

test("runtime UI helpers preserve app-runtime formatting behavior", () => {
  expect(clamp(12, 1, 5)).toBe(5);
  expect(clamp(-2, 1, 5)).toBe(1);
  expect(escapeHtml('<button title="x">')).toBe("&lt;button title=&quot;x&quot;&gt;");
  expect(formatDashboardDateTime("2026-05-31T11:14:00Z")).toBeTruthy();
  expect(addCalendarDays(new Date("2026-05-31T00:00:00Z"), 2).getUTCDate()).toBe(2);
});

test("runtime UI helpers keep submit button state reversible", () => {
  const form = {
    querySelector: () => ({
      dataset: {},
      disabled: false,
      textContent: "Save",
    }),
  };
  const button = form.querySelector();
  form.querySelector = () => button;
  setFormSubmitButtonState(form, { isSubmitting: true, submittingLabel: "Saving..." });
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("Saving...");
  expect(button.dataset.savedLabel).toBe("Save");
  setFormSubmitButtonState(form, { isSubmitting: false, defaultLabel: "Save" });
  expect(button.disabled).toBe(false);
  expect(button.textContent).toBe("Save");
  expect(button.dataset.savedLabel).toBeUndefined();
});
