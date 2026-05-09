import process from "node:process";

const required = ["LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length) {
  console.error("Authenticated live QA is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nSet these as GitHub repository secrets so production deploys verify real login before passing.");
  process.exitCode = 1;
} else {
  console.log("Authenticated live QA environment: ok");
}
