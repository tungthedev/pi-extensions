import assert from "node:assert/strict";
import test from "node:test";

import { getForgeResourcePaths } from "./discover.ts";

test("getForgeResourcePaths points at bundled skills and prompts", () => {
  const paths = getForgeResourcePaths();

  assert.equal(paths.skillPaths.length, 1);
  assert.equal(paths.promptPaths.length, 1);
  assert.match(paths.skillPaths[0] ?? "", /extensions[\\/]forge-content[\\/]resources[\\/]skills$/);
  assert.match(paths.promptPaths[0] ?? "", /extensions[\\/]forge-content[\\/]resources[\\/]prompts$/);
});
