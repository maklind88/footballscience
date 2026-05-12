import process from "node:process";

const required = ["LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());
const expectsAdminCredentials = process.env.LIVE_QA_EXPECT_ADMIN === "1";

if (missing.length) {
  console.error("Authenticated live QA is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nSet these as GitHub repository secrets for an active admin account that can open Access & Users.");
  process.exitCode = 1;
} else {
  console.log("Authenticated live QA environment: ok");
  if (expectsAdminCredentials) {
    console.log("- LIVE_QA_USERNAME must belong to an active platform admin account.");
  } else {
    console.log("- admin-only live smoke is skipped unless LIVE_QA_EXPECT_ADMIN=1.");
  }
}
