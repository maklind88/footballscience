import process from "node:process";

const required = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "LIVE_QA_USERNAME",
  "LIVE_QA_PASSWORD",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length) {
  console.error("CI release environment is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nAdd these as GitHub repository secrets before enabling CI-driven production deploys.");
  process.exitCode = 1;
} else {
  console.log("CI release environment: ok");
}
