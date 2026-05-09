import process from "node:process";

const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_TARGET_ENV === "production";
const isVercelGitDeployment = Boolean(process.env.VERCEL_GIT_PROVIDER || process.env.VERCEL_GIT_COMMIT_SHA);
const allowGitProduction = process.env.ALLOW_VERCEL_GIT_PRODUCTION === "1";

if (isProduction && isVercelGitDeployment && !allowGitProduction) {
  console.log("Ignoring automatic Vercel Git production build. Use the gated GitHub Production Deploy workflow.");
  process.exit(0);
}

console.log("Continuing Vercel build.");
process.exit(1);
