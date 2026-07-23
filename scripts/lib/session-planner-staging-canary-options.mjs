import process from "node:process";

export const SESSION_PLANNER_STAGING_CANARY_SCHEMA =
  "footballscience-session-planner-staging-canary-v1";
export const SESSION_PLANNER_STAGING_CANARY_CONFIRMATION =
  "RUN_SESSION_PLANNER_STAGING_CANARY";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

function normalizeText(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeOrigin(value) {
  try {
    const url = new URL(normalizeText(value, 500));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) {
    return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  }
  return { value: args[index + 1], consumed: 1 };
}

export function parseSessionPlannerStagingCanaryArgs(
  argv = process.argv.slice(2),
  env = process.env
) {
  const options = {
    apply: false,
    help: false,
    json: false,
    target: normalizeText(env.SESSION_PLANNER_CANARY_TARGET, 40).toLowerCase(),
    appOrigin: normalizeOrigin(env.STAGING_QA_BASE_URL),
    canonicalProductionAppOrigin: normalizeOrigin(
      env.LIVE_QA_BASE_URL || "https://footballscience.xyz"
    ),
    expectedProjectRef: normalizeText(
      env.STAGING_SUPABASE_PROJECT_REF || env.SESSION_PLANNER_EXPECTED_PROJECT_REF,
      80
    ).toLowerCase(),
    canonicalProductionProjectRef: normalizeText(
      env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF,
      80
    ).toLowerCase(),
    primaryUsername: normalizeText(env.STAGING_QA_USERNAME, 180),
    primaryPassword: normalizeText(env.STAGING_QA_PASSWORD, 256),
    peerUsername: normalizeText(env.STAGING_QA_PEER_USERNAME, 180),
    peerPassword: normalizeText(env.STAGING_QA_PEER_PASSWORD, 256),
    expectedSourceRevision:
      Number(env.SESSION_PLANNER_EXPECTED_SOURCE_REVISION) || 0,
    expectedSourceHash: normalizeText(
      env.SESSION_PLANNER_EXPECTED_SOURCE_HASH,
      64
    ).toLowerCase(),
    recoveryCreatedAt: normalizeText(
      env.SESSION_PLANNER_CANARY_CREATED_AT,
      80
    ),
    requestId: normalizeText(env.SESSION_PLANNER_CANARY_REQUEST_ID, 180),
    expectedRecoverySha256: normalizeText(
      env.SESSION_PLANNER_CANARY_EXPECTED_RECOVERY_SHA256,
      64
    ).toLowerCase(),
    confirm: "",
  };
  const supportedValueFlags = new Set([
    "--target",
    "--app-origin",
    "--canonical-production-app-origin",
    "--expected-project-ref",
    "--canonical-production-project-ref",
    "--expected-source-revision",
    "--expected-source-hash",
    "--created-at",
    "--request-id",
    "--expected-recovery-sha256",
    "--confirm",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const flag = arg.split("=", 1)[0];
    if (!supportedValueFlags.has(flag)) {
      throw new TypeError(`Unknown Session Planner staging canary option: ${flag}`);
    }
    const { value, consumed } = parseFlagValue(argv, index);
    index += consumed;
    if (flag === "--target") options.target = normalizeText(value, 40).toLowerCase();
    if (flag === "--app-origin") options.appOrigin = normalizeOrigin(value);
    if (flag === "--canonical-production-app-origin") {
      options.canonicalProductionAppOrigin = normalizeOrigin(value);
    }
    if (flag === "--expected-project-ref") {
      options.expectedProjectRef = normalizeText(value, 80).toLowerCase();
    }
    if (flag === "--canonical-production-project-ref") {
      options.canonicalProductionProjectRef = normalizeText(value, 80).toLowerCase();
    }
    if (flag === "--expected-source-revision") {
      options.expectedSourceRevision = Number(value) || 0;
    }
    if (flag === "--expected-source-hash") {
      options.expectedSourceHash = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--created-at") options.recoveryCreatedAt = normalizeText(value, 80);
    if (flag === "--request-id") options.requestId = normalizeText(value, 180);
    if (flag === "--expected-recovery-sha256") {
      options.expectedRecoverySha256 = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--confirm") options.confirm = normalizeText(value, 80);
  }
  return options;
}

export function validateSessionPlannerStagingCanaryOptions(options = {}) {
  const failures = [];
  if (options.target !== "staging") failures.push("the canary target must be staging");
  if (!options.appOrigin) failures.push("an explicit staging app origin is required");
  if (!options.canonicalProductionAppOrigin) {
    failures.push("the canonical production app origin is required");
  } else if (options.appOrigin === options.canonicalProductionAppOrigin) {
    failures.push("the staging app must differ from production");
  }
  if (!PROJECT_REF_PATTERN.test(options.expectedProjectRef || "")) {
    failures.push("an explicit staging project ref is required");
  }
  if (!PROJECT_REF_PATTERN.test(options.canonicalProductionProjectRef || "")) {
    failures.push("the canonical production project ref is required");
  } else if (options.expectedProjectRef === options.canonicalProductionProjectRef) {
    failures.push("the staging project must differ from production");
  }
  if (!options.primaryUsername || !options.primaryPassword) {
    failures.push("primary staging credentials are required");
  }
  if (!options.peerUsername || !options.peerPassword) {
    failures.push("peer staging credentials are required");
  }
  if (options.primaryUsername?.toLowerCase() === options.peerUsername?.toLowerCase()) {
    failures.push("two distinct staging accounts are required");
  }
  if (
    !Number.isInteger(options.expectedSourceRevision) ||
    options.expectedSourceRevision < 1
  ) {
    failures.push("an exact positive source revision is required");
  }
  if (!HASH_PATTERN.test(options.expectedSourceHash || "")) {
    failures.push("an exact source SHA-256 is required");
  }
  if (!options.recoveryCreatedAt || Number.isNaN(Date.parse(options.recoveryCreatedAt))) {
    failures.push("a deterministic recovery timestamp is required");
  }
  if (!options.requestId) failures.push("a request id is required");
  if (options.apply) {
    if (options.confirm !== SESSION_PLANNER_STAGING_CANARY_CONFIRMATION) {
      failures.push("the staging canary confirmation is invalid");
    }
    if (!HASH_PATTERN.test(options.expectedRecoverySha256 || "")) {
      failures.push("the reviewed recovery package SHA-256 is required");
    }
  }
  return failures;
}
