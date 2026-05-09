import process from "node:process";

const required = process.argv.includes("--required");
const failures = [];
const warnings = [];

function clean(value) {
  return String(value || "").trim();
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const productionBaseUrl = clean(process.env.LIVE_QA_BASE_URL) || "https://footballscience.xyz";
const stagingBaseUrl = clean(process.env.STAGING_QA_BASE_URL);
const productionSupabaseRef = clean(process.env.SUPABASE_PROJECT_REF);
const stagingSupabaseRef = clean(process.env.STAGING_SUPABASE_PROJECT_REF);
const productionHost = hostFromUrl(productionBaseUrl);
const stagingHost = hostFromUrl(stagingBaseUrl);

if (required && !stagingSupabaseRef) {
  failures.push("STAGING_SUPABASE_PROJECT_REF is required.");
} else if (!stagingSupabaseRef) {
  warnings.push("STAGING_SUPABASE_PROJECT_REF is not set; staging cannot be considered isolated yet.");
}

if (stagingSupabaseRef && productionSupabaseRef && stagingSupabaseRef === productionSupabaseRef) {
  failures.push("STAGING_SUPABASE_PROJECT_REF must not equal SUPABASE_PROJECT_REF.");
}

if (stagingBaseUrl) {
  if (!stagingHost) {
    failures.push("STAGING_QA_BASE_URL must be a valid URL.");
  }
  if (stagingHost && productionHost && stagingHost === productionHost) {
    failures.push("STAGING_QA_BASE_URL must not point at the production host.");
  }
}

if (required) {
  for (const name of ["STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"]) {
    if (!clean(process.env[name])) {
      failures.push(`${name} is required for authenticated staging smoke.`);
    }
  }
}

warnings.forEach((warning) => console.warn(`Staging warning: ${warning}`));

if (failures.length) {
  console.error("Staging environment verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Staging environment verification: ok");
