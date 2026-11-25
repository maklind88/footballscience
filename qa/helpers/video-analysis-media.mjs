import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { basename } from "node:path";

export function registeredMp4Source(path) {
  const stat = statSync(path);
  const hash = createHash("sha256").update([basename(path), stat.size, Math.floor(stat.mtimeMs), "video/mp4"].join("|")).digest("hex");
  return `local-video-${hash.slice(0, 40)}`;
}
