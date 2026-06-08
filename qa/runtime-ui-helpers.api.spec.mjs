import { expect, test } from "@playwright/test";
import {
  addCalendarDays,
  clamp,
  escapeHtml,
  formatDashboardDateTime,
  isEditableKeyboardTarget,
  maybeCopyToClipboard,
  setFormSubmitButtonState,
  togglePasswordInputVisibility,
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

test("runtime UI helpers own DOM-only interaction helpers outside app-runtime", async () => {
  class FakeElement {
    constructor(match = false) {
      this.match = match;
    }

    closest(selector) {
      this.lastSelector = selector;
      return this.match ? {} : null;
    }
  }

  expect(isEditableKeyboardTarget(new FakeElement(true), FakeElement)).toBe(true);
  expect(isEditableKeyboardTarget(new FakeElement(false), FakeElement)).toBe(false);

  const writes = [];
  await expect(maybeCopyToClipboard("  login details  ", {
    writeText: async (value) => writes.push(value),
  })).resolves.toBe(true);
  expect(writes).toEqual(["login details"]);
  await expect(maybeCopyToClipboard(" ", {
    writeText: async () => writes.push("should-not-run"),
  })).resolves.toBe(false);

  const input = { type: "password" };
  const button = {
    attributes: {},
    classList: {
      isVisible: false,
      toggle(_className, state) {
        this.isVisible = state;
      },
    },
    closest: () => ({ querySelector: () => input }),
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  togglePasswordInputVisibility(button);
  expect(input.type).toBe("text");
  expect(button.attributes["aria-pressed"]).toBe("true");
  expect(button.attributes["aria-label"]).toBe("Hide password");
  expect(button.classList.isVisible).toBe(true);
});
