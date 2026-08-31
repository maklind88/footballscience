import path from "node:path";

export function pathIsWithinRoot(root, candidate, pathImplementation = path) {
  const relativePath = pathImplementation.relative(root, candidate);
  return relativePath === ""
    || (relativePath !== ".."
      && !relativePath.startsWith(`..${pathImplementation.sep}`)
      && !pathImplementation.isAbsolute(relativePath));
}
