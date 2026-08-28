import process from "node:process";

const required = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "CRON_SECRET",
  "LIVE_QA_USERNAME",
  "LIVE_QA_PASSWORD",
  "LEADERBOARD_LIVE_QA_USERNAME",
  "LEADERBOARD_LIVE_QA_PASSWORD",
  "LEADERBOARD_LIVE_QA_TEAM_ID",
  "STAGING_QA_BASE_URL",
  "STAGING_QA_USERNAME",
  "STAGING_QA_PASSWORD",
  "SUPABASE_PROJECT_REF",
  "STAGING_SUPABASE_PROJECT_REF",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (process.env.LEADERBOARD_LIVE_QA_TEAM_ID && !uuidPattern.test(String(process.env.LEADERBOARD_LIVE_QA_TEAM_ID).trim())) {
  missing.push("LEADERBOARD_LIVE_QA_TEAM_ID must be a Platform team UUID");
}
if (process.env.LIVE_QA_REQUIRE_PEER_CHAT === "1") {
  const hasPeerSecrets = ["LIVE_QA_PEER_USERNAME", "LIVE_QA_PEER_PASSWORD"].every((name) => String(process.env[name] || "").trim());
  const canCreateDynamicPeer = process.env.LIVE_QA_EXPECT_ADMIN === "1";
  if (!hasPeerSecrets && !canCreateDynamicPeer) {
    missing.push("LIVE_QA_PEER_USERNAME/LIVE_QA_PEER_PASSWORD or LIVE_QA_EXPECT_ADMIN=1");
  }
}

if (missing.length) {
  console.error("CI release environment is missing required secret(s):");
  missing.forEach((name) => console.error(`- ${name}`));
  console.error("\nAdd the missing GitHub secrets/variables before production deploys can run safely.");
  process.exitCode = 1;
} else {
  console.log("CI release environment: ok");
}
