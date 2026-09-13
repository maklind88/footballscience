import { expect, test } from "@playwright/test";
import { verifyMedicalNoteProduction, verifyMedicalNoteStaging } from "../scripts/verify-medical-note-staging.mjs";

test("Medical notes retain the authenticated read boundary without clinical reads", async () => {
  const base = process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz";
  const production = new URL(base).hostname === "footballscience.xyz";
  const env = production ? {
    ...process.env,
    LIVE_QA_BASE_URL: base,
    SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF || "bustidorxevacosqhkcz",
  } : {
    ...process.env,
    STAGING_QA_BASE_URL: base,
    STAGING_QA_USERNAME: process.env.LIVE_QA_USERNAME,
    STAGING_QA_PASSWORD: process.env.LIVE_QA_PASSWORD,
  };
  const verify = production ? verifyMedicalNoteProduction : verifyMedicalNoteStaging;
  expect(await verify({ env })).toEqual({ checks: 11, clinicalRowsRead: 0, dataWrites: 0 });
});
