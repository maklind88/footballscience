import assert from "node:assert/strict";
import { test } from "node:test";
import { posix, win32 } from "node:path";

import { pathIsWithinRoot } from "../tools/path-containment.mjs";

for (const [platform, pathImplementation, root] of [
  ["POSIX", posix, "/work/releases/build-1"],
  ["Windows", win32, "D:\\work\\releases\\build-1"],
]) {
  test(`${platform} release paths stay inside their configured root`, () => {
    assert.equal(pathIsWithinRoot(root, root, pathImplementation), true);
    assert.equal(pathIsWithinRoot(root, pathImplementation.join(root, "manifest.json"), pathImplementation), true);
    assert.equal(pathIsWithinRoot(root, pathImplementation.join(root, "assets", "app.js"), pathImplementation), true);
  });

  test(`${platform} release paths reject traversal and prefix collisions`, () => {
    assert.equal(pathIsWithinRoot(root, pathImplementation.resolve(root, "..", "secret"), pathImplementation), false);
    assert.equal(pathIsWithinRoot(root, `${root}-collision`, pathImplementation), false);
    assert.equal(pathIsWithinRoot(root, pathImplementation.resolve(root, "..", "build-10", "manifest.json"), pathImplementation), false);
  });
}
