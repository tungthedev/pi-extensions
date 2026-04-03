import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  execCommand,
  getPiAgentDir,
  getPiBinDir,
  normalizeRipgrepGlob,
  resolveAbsolutePath,
  resolveAbsolutePathWithVariants,
  resolvePiManagedToolPath,
  resolvePiToolPath,
} from "./runtime.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withEnv(
  key: string,
  value: string | undefined,
  run: () => Promise<void> | void,
) {
  const previous = process.env[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

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

  assert.equal(
    resolveAbsolutePath("/workspace", "@~\\nested\\sample.txt"),
    path.join(os.homedir(), "nested", "sample.txt"),
  );
});

test("normalizeRipgrepGlob converts Windows separators to ripgrep glob separators", () => {
  assert.equal(normalizeRipgrepGlob("src\\**\\*.ts"), "src/**/*.ts");
});

test("resolvePiToolPath prefers Pi's managed bin directory", async () => {
  await withTempDir(async (dir) => {
    await withEnv("PI_CODING_AGENT_DIR", dir, async () => {
      const binDir = getPiBinDir();
      const toolPath = path.join(binDir, process.platform === "win32" ? "rg.exe" : "rg");

      assert.equal(getPiAgentDir(), dir);
      await mkdir(binDir, { recursive: true });
      await writeFile(toolPath, "");

      assert.equal(resolvePiManagedToolPath("rg"), toolPath);
      assert.equal(resolvePiToolPath("rg"), toolPath);
    });
  });
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
