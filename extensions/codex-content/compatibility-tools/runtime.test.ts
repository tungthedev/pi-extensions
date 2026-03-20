import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  execCommand,
  resolveAbsolutePath,
  resolveAbsolutePathWithVariants,
  resolveShellInvocation,
} from "./runtime.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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
      userShell: "/bin/zsh",
      shellExists: (shellPath) => shellPath === "/bin/zsh",
    }),
    {
      shell: "/bin/zsh",
      shellArgs: ["-c", "echo hi"],
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

test("execCommand preserves timeout exit codes and partial stdout", async () => {
  const result = await execCommand(
    process.execPath,
    ["-e", "process.stdout.write('ready\\n'); setTimeout(() => {}, 1000);"],
    process.cwd(),
    { timeoutMs: 50 },
  );

  assert.equal(result.exitCode, 124);
  assert.match(result.stdout, /ready/);
  assert.match(result.stderr, /Command timed out after 50ms/);
});

test("resolveAbsolutePath expands home references and strips the @ prefix", () => {
  assert.equal(
    resolveAbsolutePath("/workspace", "@~/sample.txt"),
    path.join(os.homedir(), "sample.txt"),
  );
});

test("resolveAbsolutePathWithVariants falls back to macOS-style unicode variants", async () => {
  await withTempDir(async (dir) => {
    const nfdName = "Cafe\u0301.txt";
    const actualPath = path.join(dir, nfdName);
    await writeFile(actualPath, "hello\n");

    const resolved = resolveAbsolutePathWithVariants(dir, "Café.txt");
    assert.equal(resolved.normalize("NFC"), actualPath.normalize("NFC"));
  });
});
