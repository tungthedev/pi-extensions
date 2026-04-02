import assert from "node:assert/strict";
import test from "node:test";

import { FORGE_MODES, getForgeModeDefinition, isForgeModeName } from "./modes.ts";

test("isForgeModeName accepts known Forge mode names", () => {
  assert.equal(isForgeModeName("forge"), true);
  assert.equal(isForgeModeName("sage"), true);
  assert.equal(isForgeModeName("muse"), true);
  assert.equal(isForgeModeName("worker"), false);
});

test("Forge mode definitions expose stable active tool presets", () => {
  assert.deepEqual(getForgeModeDefinition("forge").activeTools, [
    "read",
    "write",
    "shell",
    "fs_search",
    "patch",
    "followup",
    "todo_write",
    "todo_read",
  ]);
  assert.deepEqual(FORGE_MODES.muse.activeTools, ["read", "fs_search", "followup", "todo_write", "todo_read"]);
});
