import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildLineRecords,
  formatListDirectoryOutput,
  listDirectoryEntries,
  readIndentationBlock,
  resolveShellInvocation,
} from "./codex-tools.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("readIndentationBlock keeps header comments and excludes sibling blocks by default", () => {
  const records = buildLineRecords(
    [
      "function outer() {",
      "    if (cond) {",
      "        // header comment",
      "        if (inner) {",
      "            work();",
      "        }",
      "        const sibling = 1;",
      "    }",
      "}",
    ].join("\n"),
  );

  const block = readIndentationBlock(records, 5, 10, {
    anchor_line: 5,
    max_levels: 1,
    include_siblings: false,
    include_header: true,
  });

  assert.equal(
    block,
    [
      "L3:         // header comment",
      "L4:         if (inner) {",
      "L5:             work();",
      "L6:         }",
    ].join("\n"),
  );
});

test("formatListDirectoryOutput includes 1-indexed numbers, type labels, and continuation guidance", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "alpha.txt"), "alpha\n");
    await mkdir(path.join(dir, "nested"), { recursive: true });
    await writeFile(path.join(dir, "nested", "beta.ts"), "export default 1\n");

    const entries = await listDirectoryEntries(dir, 2);
    const output = formatListDirectoryOutput(dir, entries, { offset: 2, limit: 1 });

    assert.equal(
      output,
      [
        `Absolute path: ${dir}`,
        "2. [dir] nested/",
        "More than 1 entries found (3 total). Use offset 3 to continue.",
      ].join("\n"),
    );
  });
});

test("resolveShellInvocation uses supported user shells and falls back for unknown shells", () => {
  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/bin/zsh",
      login: true,
      shellExists: (shellPath) => shellPath === "/bin/zsh",
    }),
    {
      shell: "/bin/zsh",
      shellArgs: ["-lc", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/opt/homebrew/bin/nu",
      login: true,
      shellExists: (shellPath) => shellPath === "/bin/bash",
    }),
    {
      shell: "/bin/bash",
      shellArgs: ["-lc", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/opt/homebrew/bin/fish",
      login: false,
      shellExists: (shellPath) => shellPath === "/opt/homebrew/bin/fish",
    }),
    {
      shell: "/opt/homebrew/bin/fish",
      shellArgs: ["-c", "echo hi"],
    },
  );
});
