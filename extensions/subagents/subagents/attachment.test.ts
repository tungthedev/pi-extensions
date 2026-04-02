import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveChildSessionDir } from "./attachment.ts";

test("resolveChildSessionDir stores child sessions under ~/.pi/subagents/sessions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subagent-home-"));
  const homeDir = path.join(root, "home");

  try {
    const sessionDir = resolveChildSessionDir({ HOME: homeDir }, homeDir);

    assert.equal(sessionDir, path.join(homeDir, ".pi", "subagents", "sessions"));
    assert.equal(existsSync(sessionDir), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
