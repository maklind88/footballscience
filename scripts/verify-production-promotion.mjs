import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyProductionPromotion } from "./lib/production-promotion.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runProductionPromotionVerification(argv = process.argv, env = process.env) {
  const phaseArgument = argv.find((argument) => argument.startsWith("--phase="));
  const phase = phaseArgument ? phaseArgument.slice("--phase=".length) : "staged";
  const result = await verifyProductionPromotion({ phase, rootDir, env });
  console.log(`Production promotion verification: ${result.phase} ok`);
  console.log(`- deployment: ${result.deploymentId}`);
  console.log(`- staged origin: ${result.deploymentOrigin}`);
  if (result.phase === "live") console.log(`- live origin: ${result.liveOrigin}`);
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runProductionPromotionVerification();
}
