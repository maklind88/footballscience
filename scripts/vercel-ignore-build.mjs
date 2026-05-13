import process from "node:process";

const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_TARGET_ENV === "production";
const isVercelGitDeployment = Boolean(process.env.VERCEL_GIT_PROVIDER || process.env.VERCEL_GIT_COMMIT_SHA);
const allowGitProduction = process.env.ALLOW_VERCEL_GIT_PRODUCTION === "1";

if (isProduction && isVercelGitDeployment && !allowGitProduction) {
  console.log(
    "Ignoring automatic Vercel Git production build. Use project deploy commands: npm run deploy or npm run deploy:safe; the safe CI path remains GitHub Production Deploy.",
  );
  process.exit(0);
}

console.log("Continuing Vercel build.");
process.exit(1);
