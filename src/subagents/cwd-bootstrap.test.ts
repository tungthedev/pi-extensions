import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import test from "node:test";

import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";
import { SUBAGENT_CWD_ENV } from "./subagents/types.ts";

test("bootstrapSubagentCwd restores the inherited subagent cwd", () => {
  const originalEnv = process.env[SUBAGENT_CWD_ENV];
  const originalCwd = process.cwd();
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "subagent-cwd-"));

  process.env[SUBAGENT_CWD_ENV] = tempRoot;

  try {
    process.chdir("/");
    bootstrapSubagentCwd();
    assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(tempRoot));
  } finally {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env[SUBAGENT_CWD_ENV];
    } else {
      process.env[SUBAGENT_CWD_ENV] = originalEnv;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
