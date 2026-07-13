import process from "node:process";

const required = ["LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"];
const peerRequired = process.env.LIVE_QA_REQUIRE_PEER_CHAT === "1";
const peerRequiredNames = ["LIVE_QA_PEER_USERNAME", "LIVE_QA_PEER_PASSWORD"];
const hasAnyPeerSecret = peerRequiredNames.some((name) => String(process.env[name] || "").trim());
const hasPeerSecrets = peerRequiredNames.every((name) => String(process.env[name] || "").trim());
const expectsAdminCredentials = process.env.LIVE_QA_EXPECT_ADMIN === "1";
const requiredNames = [
  ...required,
  ...(hasAnyPeerSecret ? peerRequiredNames : []),
];
const missing = requiredNames.filter((name) => !String(process.env[name] || "").trim());
if (peerRequired && !hasPeerSecrets && !expectsAdminCredentials) {
  missing.push("LIVE_QA_PEER_USERNAME/LIVE_QA_PEER_PASSWORD or LIVE_QA_EXPECT_ADMIN=1");
}

if (missing.length) {
  console.error("Authenticated live QA is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nSet these as GitHub repository secrets for active QA accounts that can exercise production safely.");
  process.exitCode = 1;
} else {
  console.log("Authenticated live QA environment: ok");
  if (expectsAdminCredentials) {
    console.log("- LIVE_QA_USERNAME must belong to an active platform admin account.");
  } else {
    console.log("- admin-only live smoke is skipped unless LIVE_QA_EXPECT_ADMIN=1.");
  }
  if (hasPeerSecrets) {
    console.log("- two-account chat live smoke is configured.");
  } else if (expectsAdminCredentials) {
    console.log("- two-account chat live smoke will create or refresh a dedicated dynamic peer account.");
  } else {
    console.log("- two-account chat live smoke is skipped until LIVE_QA_PEER_USERNAME/LIVE_QA_PEER_PASSWORD are set.");
  }
  if (peerRequired) {
    console.log("- LIVE_QA_REQUIRE_PEER_CHAT=1, so two-account chat live smoke is mandatory.");
  }
}
