import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--load-check")) {
  console.log("local candidate build helper loaded");
  process.exit(0);
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidate = process.argv.find((value) => value.startsWith("--candidate="))?.slice(12) || "bundled";
const bundle = process.argv.find((value) => value.startsWith("--bundle="))?.slice(9) || "none";
const supported = new Set(["bundled", "hosted", "unauthorized-origin"]);
if (!supported.has(candidate)) throw new Error(`Unsupported desktop candidate: ${candidate}`);
if (!new Set(["none", "app"]).has(bundle)) throw new Error(`Unsupported local bundle type: ${bundle}`);

const generator = spawnSync(process.execPath, [resolve(packageRoot, "tools", "generate-test-releases.mjs"), "--quiet"], {
  cwd: packageRoot,
  encoding: "utf8",
});
if (generator.status !== 0) throw new Error(generator.stderr || "Synthetic release generation failed.");
const publicEnvironment = JSON.parse(readFileSync(resolve(packageRoot, "generated", "test-release-public-env.json"), "utf8"));
const tauriCli = resolve(packageRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
const args = [tauriCli, "build"];
if (bundle === "none") args.push("--no-bundle");
else args.push("--bundles", bundle);
if (candidate === "hosted") args.push("--config", "src-tauri/tauri.hosted.conf.json");
if (candidate === "unauthorized-origin") args.push("--config", "src-tauri/tauri.unauthorized-origin.conf.json");
const env = {
  ...process.env,
  FS_DESKTOP_DELIVERY_MODE: candidate,
};
if (candidate === "hosted") {
  Object.assign(env, {
    FS_DESKTOP_RELEASE_KEY_ID: publicEnvironment.releaseKeyId,
    FS_DESKTOP_RELEASE_PUBLIC_KEY_B64: publicEnvironment.releasePublicKeyBase64,
    FS_DESKTOP_RECOVERY_KEY_ID: publicEnvironment.recoveryKeyId,
    FS_DESKTOP_RECOVERY_PUBLIC_KEY_B64: publicEnvironment.recoveryPublicKeyBase64,
  });
}
const result = spawnSync(process.execPath, args, {
  cwd: packageRoot,
  encoding: "utf8",
  env,
  maxBuffer: 32 * 1024 * 1024,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
