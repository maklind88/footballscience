import { expect, test } from "@playwright/test";
import { renderMedicalRtpExerciseThumbnail } from "../src/modules/medical/medical-rtp-exercise-diagram-renderer.mjs";

const escapeHtml = (value) => String(value ?? "").replaceAll('"', "&quot;");

test("RTP Exercise Bank renders lightweight accessible technique diagrams", () => {
  const markup = renderMedicalRtpExerciseThumbnail({
    name: "Nordic hamstring progression",
    thumbnail: {
      diagramKey: "posterior-chain-bridge",
      altText: "Nordic hamstring setup and movement diagram",
    },
  }, escapeHtml);

  expect(markup).toContain('class="medical-rtp-exercise-diagram"');
  expect(markup).toContain('role="img"');
  expect(markup).toContain("Nordic hamstring setup and movement diagram");
  expect(markup).not.toContain("<img");
});

test("RTP Exercise Bank only lazy-loads trusted image URLs", () => {
  const trusted = renderMedicalRtpExerciseThumbnail({
    name: "Exercise",
    thumbnail: { url: "https://cdn.example.test/exercise.webp", altText: "Exercise image" },
  }, escapeHtml);
  const rejected = renderMedicalRtpExerciseThumbnail({
    name: "Exercise",
    thumbnail: { url: "javascript:alert(1)", diagramKey: "knee-dominant-loading" },
  }, escapeHtml);

  expect(trusted).toContain('loading="lazy"');
  expect(trusted).toContain('decoding="async"');
  expect(rejected).not.toContain("javascript:");
  expect(rejected).toContain("medical-rtp-exercise-diagram");
});
