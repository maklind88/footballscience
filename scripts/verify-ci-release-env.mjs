import process from "node:process";

const required = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "LIVE_QA_USERNAME",
  "LIVE_QA_PASSWORD",
  "STAGING_QA_BASE_URL",
  "STAGING_QA_USERNAME",
  "STAGING_QA_PASSWORD",
  "SUPABASE_PROJECT_REF",
  "STAGING_SUPABASE_PROJECT_REF",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length) {
  console.error("CI release environment is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nAdd the missing GitHub secrets/variables before production deploys can run safely.");
  process.exitCode = 1;
} else {
  console.log("CI release environment: ok");
}
