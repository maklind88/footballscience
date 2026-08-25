import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const canonicalVercelProjectName = "footballscience";

function projectFileFor(rootDir) {
  return path.join(rootDir, ".vercel", "project.json");
}

export function readVercelProjectLink(rootDir) {
  const projectFile = projectFileFor(rootDir);
  if (!fs.existsSync(projectFile)) return { exists: false, projectFile, projectName: "" };
  let project;
  try {
    project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${projectFile}: ${error.message}`);
  }
  return {
    exists: true,
    projectFile,
    projectName: String(project?.projectName || "").trim(),
    project,
  };
}

function defaultFallbackRootDirs(rootDir) {
  const candidates = [path.join(os.homedir(), "Documents", "New project")];
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)).filter((candidate) => candidate !== path.resolve(rootDir)))];
}

export function verifyCanonicalVercelProjectLink(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const repairFromFallback = options.repairFromFallback === true;
  const fallbackRootDirs = options.fallbackRootDirs || defaultFallbackRootDirs(rootDir);
  const current = readVercelProjectLink(rootDir);

  if (current.exists) {
    if (current.projectName !== canonicalVercelProjectName) {
      throw new Error(`Deploy requires Vercel project ${canonicalVercelProjectName}, but this worktree is linked to ${current.projectName || "unknown"}.`);
    }
    return { projectName: current.projectName, projectFile: current.projectFile, repaired: false };
  }

  if (!repairFromFallback) {
    throw new Error(`Deploy requires .vercel/project.json linked to ${canonicalVercelProjectName}.`);
  }

  for (const fallbackRootDir of fallbackRootDirs) {
    const fallback = readVercelProjectLink(fallbackRootDir);
    if (!fallback.exists) continue;
    if (fallback.projectName !== canonicalVercelProjectName) continue;
    fs.mkdirSync(path.dirname(current.projectFile), { recursive: true });
    fs.copyFileSync(fallback.projectFile, current.projectFile);
    const repaired = readVercelProjectLink(rootDir);
    if (repaired.projectName !== canonicalVercelProjectName) {
      throw new Error("Copied Vercel project binding did not verify as canonical.");
    }
    return { projectName: repaired.projectName, projectFile: repaired.projectFile, repaired: true, sourceProjectFile: fallback.projectFile };
  }

  throw new Error(`Deploy requires .vercel/project.json linked to ${canonicalVercelProjectName}; no verified canonical fallback binding was found.`);
}
