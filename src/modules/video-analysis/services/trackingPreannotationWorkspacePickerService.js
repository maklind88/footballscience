const MAX_PACK_BYTES = 4 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;
const MAX_CASE_BYTES = 16 * 1024 * 1024;
const fingerprintPattern = /^[a-f0-9]{64}$/i;

function invalid(message) {
  throw new Error(message);
}

async function readFile(directory, name, maximumBytes, label) {
  let handle;
  try {
    handle = await directory.getFileHandle(name);
  } catch {
    invalid(`${label} is missing from the selected workspace.`);
  }
  if (handle?.kind && handle.kind !== "file") invalid(`${label} is not a file.`);
  const file = await handle.getFile();
  if (!Number.isSafeInteger(Number(file?.size))
    || Number(file.size) < 1
    || Number(file.size) > maximumBytes) {
    invalid(`${label} is outside its size limit.`);
  }
  return file;
}

async function readDirectory(directory, name, label) {
  try {
    const handle = await directory.getDirectoryHandle(name);
    if (handle?.kind && handle.kind !== "directory") invalid(`${label} is not a directory.`);
    return handle;
  } catch (error) {
    if (error?.message?.includes("not a directory")) throw error;
    invalid(`${label} is missing from the selected workspace.`);
  }
}

async function fileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function jsonFile(directory, name, maximumBytes, label) {
  const file = await readFile(directory, name, maximumBytes, label);
  const bytes = await fileBytes(file);
  try {
    return {
      bytes,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    };
  } catch {
    invalid(`${label} is not valid UTF-8 JSON.`);
  }
}

function matchingCaseId(pack = {}, workspace = {}, sourceSha256 = "") {
  const fingerprint = String(sourceSha256 || "").trim().toLowerCase();
  if (!fingerprintPattern.test(fingerprint)) {
    invalid("Reconnect the exact normalized benchmark clip before opening review.");
  }
  const matches = (Array.isArray(pack.cases) ? pack.cases : []).filter((entry) => (
    String(entry?.clip?.sha256 || "").trim().toLowerCase() === fingerprint
  ));
  if (matches.length !== 1) {
    invalid(matches.length
      ? "The connected source matches more than one annotation case."
      : "The connected source is not part of this annotation workspace.");
  }
  const caseId = String(matches[0]?.id || "");
  if (!(Array.isArray(workspace.cases) ? workspace.cases : []).some((entry) => entry?.id === caseId)) {
    invalid("The matching annotation case is missing from this preannotation workspace.");
  }
  return caseId;
}

export async function selectTrackingPreannotationWorkspaceDirectory(win, options = {}) {
  if (typeof win?.showDirectoryPicker !== "function") {
    invalid("This browser cannot open a complete preannotation workspace folder.");
  }
  const directory = await win.showDirectoryPicker({ id: "fs-player-preannotation", mode: "read" });
  const [pack, workspace, cases] = await Promise.all([
    jsonFile(directory, "annotation-pack.json", MAX_PACK_BYTES, "Annotation pack"),
    jsonFile(directory, "workspace.json", MAX_WORKSPACE_BYTES, "Preannotation workspace"),
    readDirectory(directory, "cases", "Preannotation cases directory"),
  ]);
  const caseId = matchingCaseId(pack.value, workspace.value, options.sourceSha256);
  const [trackMapFile, suggestionFile] = await Promise.all([
    readFile(cases, `${caseId}.track-map.json`, MAX_CASE_BYTES, "Preannotation track map"),
    readFile(cases, `${caseId}.suggestions.mot.txt`, MAX_CASE_BYTES, "Preannotation suggestions"),
  ]);
  const [trackMapBytes, suggestionBytes] = await Promise.all([
    fileBytes(trackMapFile),
    fileBytes(suggestionFile),
  ]);
  return {
    packBytes: pack.bytes,
    workspaceBytes: workspace.bytes,
    trackMapBytes,
    suggestionBytes,
    caseId,
  };
}
