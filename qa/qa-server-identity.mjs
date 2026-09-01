import { createHash } from "node:crypto";
import path from "node:path";

const qaPortBase = 4200;
const qaPortRange = 1000;
const qaReadyPrefix = "/__footballscience_qa__/ready/";

export function createQaServerIdentity(rootDir) {
  return createHash("sha256").update(path.resolve(rootDir)).digest("hex").slice(0, 16);
}

export function defaultQaPort(rootDir) {
  const identity = createQaServerIdentity(rootDir);
  return qaPortBase + (Number.parseInt(identity.slice(0, 8), 16) % qaPortRange);
}

export function createQaServerReadyPath(rootDir) {
  return `${qaReadyPrefix}${createQaServerIdentity(rootDir)}`;
}

export function isQaServerReadyPath(pathname, rootDir) {
  return pathname === createQaServerReadyPath(rootDir);
}

export function isQaServerReadyRequest(pathname) {
  return String(pathname || "").startsWith(qaReadyPrefix);
}
