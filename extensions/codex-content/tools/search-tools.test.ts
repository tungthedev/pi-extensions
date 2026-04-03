import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findMatchingFiles } from "./find-files.ts";
import { findContentMatches, registerGrepFilesTool } from "./grep-files.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function getRegisteredTool(register: (pi: any) => void, name: string) {
  let registeredTool: any;
  register({
    registerTool(tool: any) {
      if (tool.name === name) {
        registeredTool = tool;
      }
    },
  });
  assert.ok(registeredTool, `expected tool ${name} to be registered`);
  return registeredTool;
}

test("findMatchingFiles returns absolute paths sorted by most recent modification time", async () => {
  await withTempDir(async (dir) => {
    const alpha = path.join(dir, "alpha.ts");
    const beta = path.join(dir, "nested", "beta.ts");

    await mkdir(path.dirname(beta), { recursive: true });
    await writeFile(alpha, "export const alpha = 1\n");
    await writeFile(beta, "export const beta = 2\n");

    const oldTime = new Date("2024-01-01T00:00:00.000Z");
    const newTime = new Date("2024-01-02T00:00:00.000Z");
    await utimes(alpha, oldTime, oldTime);
    await utimes(beta, newTime, newTime);

    const matches = await findMatchingFiles(dir, "**/*.ts");
    assert.deepEqual(
      matches.map((entry) => entry.absolutePath),
      [beta, alpha],
    );
  });
});

test("findContentMatches excludes .git and sorts by most recent modification time", async () => {
  await withTempDir(async (dir) => {
    const alpha = path.join(dir, "alpha.ts");
    const beta = path.join(dir, "nested", "beta.ts");
    const ignored = path.join(dir, ".git", "ignored.ts");

    await mkdir(path.dirname(beta), { recursive: true });
    await mkdir(path.dirname(ignored), { recursive: true });
    await writeFile(alpha, "const token = 'needle'\n");
    await writeFile(beta, "const token = 'needle'\n");
    await writeFile(ignored, "const token = 'needle'\n");

    const older = new Date("2024-01-03T00:00:00.000Z");
    const newer = new Date("2024-01-04T00:00:00.000Z");
    await utimes(alpha, older, older);
    await utimes(beta, newer, newer);

    const result = await findContentMatches(dir, "needle");
    assert.deepEqual(
      result.matches.map((entry) => entry.absolutePath),
      [beta, alpha],
    );
  });
});

test("grep_files reports invalid regex errors clearly", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerGrepFilesTool, "grep_files");
    await writeFile(path.join(dir, "alpha.ts"), "const token = 'needle'\n");

    await assert.rejects(
      tool.execute("call-3", { pattern: "(", path: dir }, undefined, undefined, { cwd: dir }),
      /invalid regex:/i,
    );
  });
});
