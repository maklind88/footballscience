import { expect, test } from "@playwright/test";
import {
  createMedicalOptionRenderers,
  medicalActualParticipationFallback,
  medicalGateOptions,
  medicalParticipationOptions,
  medicalRtpPhaseOptions,
  medicalStatusOptions,
} from "../src/modules/medical/index.mjs";

function findByKey(options, key, fallbackKey) {
  return options.find((option) => option.key === key) || options.find((option) => option.key === fallbackKey) || options[0];
}

const renderers = createMedicalOptionRenderers({
  escapeHtml: (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  getMedicalGateOption: (key) => findByKey(medicalGateOptions, key, "pending"),
  getMedicalRtpPhaseOption: (key) => findByKey(medicalRtpPhaseOptions, key, "medical-restriction"),
  getMedicalStatusOption: (key) => findByKey(medicalStatusOptions, key, "unavailable"),
  getMedicalStatusOptionForDate: (key, dateValue) => ({
    ...findByKey(medicalStatusOptions, key, "unavailable"),
    label: dateValue === "match-day" && key === "full" ? "Match Available" : findByKey(medicalStatusOptions, key, "unavailable").label,
  }),
  getSelectedDate: () => "training-day",
  medicalActualParticipationFallback,
  medicalGateOptions,
  medicalParticipationOptions,
  medicalRtpPhaseOptions,
  medicalStatusOptions,
  normalizeMedicalActualParticipation: (value) =>
    value === medicalActualParticipationFallback ? medicalActualParticipationFallback : Number(value),
  normalizeMedicalParticipation: (value) => Number(value),
});

test("Medical option renderers own planned and actual participation dropdowns", () => {
  const plannedMarkup = renderers.renderMedicalParticipationOptions(75);
  expect(plannedMarkup).toContain('<option value="75" selected>75%</option>');
  expect(plannedMarkup).toContain('<option value="100">100%</option>');

  const actualMarkup = renderers.renderMedicalActualParticipationOptions(medicalActualParticipationFallback);
  expect(actualMarkup).toContain(`<option value="${medicalActualParticipationFallback}" selected>Not logged</option>`);
  expect(actualMarkup).toContain('<option value="50">50%</option>');
});

test("Medical option renderers own status, RTP, duration, and gate dropdowns", () => {
  expect(renderers.renderMedicalStatusOptions("full", "match-day")).toContain(
    '<option value="full" selected>Match Available</option>'
  );
  expect(renderers.renderMedicalRtpPhaseOptions("modified-team")).toContain(
    '<option value="modified-team" selected>Modified team</option>'
  );
  expect(renderers.renderMedicalDurationUnitOptions("days")).toContain('<option value="days" selected>Days</option>');
  expect(renderers.renderMedicalDurationUnitOptions("bad-value")).toContain('<option value="weeks" selected>Weeks</option>');
  expect(renderers.renderMedicalGateOptions("pass")).toContain('<option value="pass" selected>Pass</option>');
});
