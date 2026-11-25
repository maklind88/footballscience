import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { productionOrigin, savedWorkReleaseIdentity, selectSavedWorkStaticFiles,
  startSavedWorkAssetMirror, verifySavedWorkProductionIdentity } from './lib/saved-work-live-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runFile = promisify(execFile);
const git = async (...args) => (await runFile('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })).stdout;
const qaOnlyScripts = new Set(['scripts/run-staging-live-qa.mjs', 'scripts/verify-release-rules.mjs',
  'scripts/verify-staging-write-target.mjs', 'scripts/verify-saved-work-live-assets.mjs', 'scripts/lib/saved-work-live-assets.mjs']);
const validHarnessPath = path => /^(?:qa\/|docs\/|\.github\/)/.test(path) || qaOnlyScripts.has(path);
const safeStatus = status => ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'].includes(status) ? status : 'unknown';
const requiredProjects = new Map([['sessions-postgres-chromium', 10], ['confirmation-chromium', 1], ['confirmation-webkit', 1]]);

async function expectedTree(expectedBuild) {
  if ((await git('rev-parse', '--verify', `${expectedBuild}^{commit}`)).toString().trim() !== expectedBuild) {
    throw new Error('Release commit is unavailable in the local repository');
  }
  const changed = (await git('diff', '--name-only', '-z', expectedBuild, '--')).toString().split('\0');
  const untracked = (await git('ls-files', '-z', '--others', '--exclude-standard')).toString().split('\0');
  if ([...changed, ...untracked].filter(Boolean).some(path => !validHarnessPath(path))) {
    throw new Error('Local product/backend source differs from the verified release commit');
  }
  return selectSavedWorkStaticFiles((await git('ls-tree', '-r', '-z', expectedBuild)).toString());
}

function testResults(report) {
  const records = [];
  function visit(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = test.results.at(-1);
        records.push({ test: spec.title, project: test.projectName,
          status: safeStatus(result?.status), durationMs: Number.isSafeInteger(result?.duration) ? result.duration : null });
      }
    }
    for (const nested of suite.suites || []) visit(nested);
  }
  visit(report);
  return records;
}

function runBrowserTests({ origin, scratch, postgresBin, logTests }) {
  // Avoid forwarding production credentials, tokens, or arbitrary inherited
  // Node/Playwright overrides into the synthetic DB and browser subprocesses.
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const report = join(scratch, 'results.json');
  Object.assign(env, { FS_RECOVERY_PG_BIN: postgresBin, SAVED_WORK_ASSETS_LOOPBACK: origin,
    SAVED_WORK_ASSETS_OUTPUT: join(scratch, 'browser-results'), SAVED_WORK_ASSETS_REPORT: report });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/playwright/cli.js'), 'test',
      '--config=qa/playwright.saved-work-live-assets.config.mjs'], { cwd: root, env, stdio: logTests ? 'inherit' : 'ignore' });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, report }));
  });
}

export async function runSavedWorkProductionAssets({ expectedBuild, upstream, deploymentId, outputDir,
  postgresBin = process.env.FS_RECOVERY_PG_BIN, fetchImpl = fetch, logTests = false } = {}) {
  const { deploymentOrigin, expectedIdentity } = savedWorkReleaseIdentity(expectedBuild, upstream, deploymentId);
  if (!postgresBin) throw new Error('Set FS_RECOVERY_PG_BIN to the isolated PostgreSQL 17 binary directory');
  if (outputDir) await mkdir(outputDir, { mode: 0o700 });
  else outputDir = await mkdtemp(join(tmpdir(), 'fs-live-saved-work-proof-'));
  const scratch = await mkdtemp(join(tmpdir(), 'fs-live-saved-work-scratch-'));
  const evidencePath = join(outputDir, 'verified-saved-work-assets.json');
  const evidence = { build: expectedBuild, productionOrigin, staticSource: productionOrigin, status: 'failed',
    expectedPublicConfigIdentity: expectedIdentity,
    ...(deploymentOrigin ? { deploymentOrigin } : {}),
    ...(deploymentId ? { suppliedDeploymentId: deploymentId } : {}),
    staticTransport: fetchImpl === fetch ? 'public HTTPS' : 'injected local validation transport',
    productionIdentityBefore: false, productionIdentityAfter: false,
    productionAppDataRequests: 0, productionWrites: 0, syntheticTestData: true,
    proofBoundary: 'Public release frontend bytes with local synthetic auth, real local API handlers and isolated PostgreSQL',
    tests: [] };
  let mirror;
  let stage = 'local-source';
  try {
    const files = await expectedTree(expectedBuild);
    stage = 'public-identity-before';
    await verifySavedWorkProductionIdentity({ expectedBuild, upstream, deploymentId, fetchImpl });
    evidence.productionIdentityBefore = true;
    stage = 'isolated-browser-run';
    mirror = await startSavedWorkAssetMirror({ expectedBuild, files, fetchImpl, readBlob: oid => git('cat-file', 'blob', oid) });
    const result = await runBrowserTests({ origin: mirror.origin, scratch, postgresBin, logTests });
    evidence.tests = testResults(JSON.parse(await readFile(result.report, 'utf8')));
    stage = 'public-identity-after';
    await verifySavedWorkProductionIdentity({ expectedBuild, upstream, deploymentId, fetchImpl });
    evidence.productionIdentityAfter = true;
    stage = 'evaluate-results';
    const assetEvidence = mirror.evidence();
    const required = ['index.html', 'app.js', 'app-runtime.js', 'platform-auth-boot.js', 'footballscience-sw.js',
      'src/core/central-sync-runtime-service.mjs', 'src/modules/session-planner/session-save-client.mjs',
      'src/modules/session-planner/session-planner-workspace-renderer.mjs',
      'src/modules/medical/medical-runtime-state-service.mjs'];
    const projects = new Set(evidence.tests.map(test => test.project));
    const complete = projects.size === requiredProjects.size && [...requiredProjects].every(([project, minimum]) =>
      evidence.tests.filter(test => test.project === project).length >= minimum);
    if (result.code !== 0 || !complete || evidence.tests.some(test => test.status !== 'passed')) {
      throw new Error('One or more isolated Sessions or Medical browser tests did not pass');
    }
    if (assetEvidence.filesWithVerificationFailure.length || required.some(file => !assetEvidence.trackedFilesVerified[file])) {
      throw new Error('Requested frontend closure or required release assets were not verified');
    }
    evidence.status = 'passed';
  } finally {
    if (evidence.status !== 'passed') evidence.failedAt = stage;
    if (mirror) {
      await mirror.close();
      Object.assign(evidence, mirror.evidence());
    }
    try {
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  return { evidencePath, passed: evidence.tests.length, verifiedFiles: Object.keys(evidence.trackedFilesVerified).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { 'expected-build': { type: 'string' }, 'deployment-url': { type: 'string' },
      'deployment-id': { type: 'string' }, 'output-dir': { type: 'string' } } });
    const result = await runSavedWorkProductionAssets({ expectedBuild: values['expected-build'], upstream: values['deployment-url'],
      deploymentId: values['deployment-id'], outputDir: values['output-dir'] });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Never emit raw HTTP bodies, auth, or test assertion payloads.
    console.error('Saved work release asset proof failed. Check the sanitized report in the specified or newly created proof directory.');
    process.exitCode = 1;
  }
}
