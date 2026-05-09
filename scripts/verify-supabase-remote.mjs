import { spawnSync } from "node:child_process";
import process from "node:process";

const requiredEnvironment = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF"];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length) {
  console.error("Missing required Supabase remote verification environment:");
  for (const name of missingEnvironment) {
    console.error(`- ${name}`);
  }
  console.error(
    "\nAdd these as GitHub Actions secrets/variables or local environment values before running remote migration verification."
  );
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const password = process.env.SUPABASE_DB_PASSWORD;

run("npx", [
  "supabase",
  "link",
  "--project-ref",
  process.env.SUPABASE_PROJECT_REF,
  "--password",
  password,
  "--yes",
]);

run("npx", ["supabase", "migration", "list", "--linked", "--password", password]);
run("npx", ["supabase", "db", "lint", "--linked", "--fail-on", "error"]);
run("npx", ["supabase", "db", "push", "--linked", "--dry-run", "--password", password]);
