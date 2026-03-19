import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildLineRecords,
  execCommand,
  findContentMatches,
  findMatchingFiles,
  formatGrepFilesOutput,
  formatListDirectoryOutput,
  formatFindFilesOutput,
  isSecretFilePath,
  listDirectoryEntries,
  readIndentationBlock,
  resolveAbsolutePath,
  resolveAbsolutePathWithVariants,
  resolveShellInvocation,
  splitLeadingCdCommand,
  stripTrailingBackgroundOperator,
} from "./codex-tools.ts";
import { registerGrepFilesTool } from "./compatibility-tools/grep-files.ts";
import { registerReadFileTool } from "./compatibility-tools/read-file.ts";

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
      if (tool.name === name) registeredTool = tool;
    },
  });
  assert.ok(registeredTool, `expected tool ${name} to be registered`);
  return registeredTool;
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

test("formatListDirectoryOutput includes skipped-directory notes when present", () => {
  const output = formatListDirectoryOutput(
    "/tmp/project",
    [{ sortKey: "src", relativePath: "src/", typeLabel: "dir" }],
    { skippedCount: 2 },
  );

  assert.equal(
    output,
    ["Absolute path: /tmp/project", "1. [dir] src/", "[Skipped 2 unreadable directories.]"].join(
      "\n",
    ),
  );
});

test("formatListDirectoryOutput keeps skipped-directory notes even when no entries are visible", () => {
  const output = formatListDirectoryOutput("/tmp/project", [], { skippedCount: 1 });

  assert.equal(
    output,
    ["Absolute path: /tmp/project", "[Skipped 1 unreadable directory.]"].join("\n"),
  );
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

test("splitLeadingCdCommand extracts a leading cd into a workdir", () => {
  assert.deepEqual(splitLeadingCdCommand('cd "nested dir" && bun test'), {
    workdir: "nested dir",
    command: "bun test",
  });

  assert.equal(splitLeadingCdCommand("bun test"), null);
});

test("stripTrailingBackgroundOperator removes a trailing background operator", () => {
  assert.deepEqual(stripTrailingBackgroundOperator("bun test &"), {
    command: "bun test",
    stripped: true,
  });

  assert.deepEqual(stripTrailingBackgroundOperator("bun test"), {
    command: "bun test",
    stripped: false,
  });
});

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

test("formatFindFilesOutput prints a count header and pagination guidance", () => {
  const output = formatFindFilesOutput(
    [
      { absolutePath: "/tmp/one.ts", mtimeMs: 2 },
      { absolutePath: "/tmp/two.ts", mtimeMs: 1 },
      { absolutePath: "/tmp/three.ts", mtimeMs: 0 },
    ],
    { offset: 1, limit: 1 },
  );

  assert.equal(
    output,
    [
      "3 matching files",
      "/tmp/two.ts",
      "",
      "[Showing 2-2 of 3 matches. Use offset 2 to continue.]",
    ].join("\n"),
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

test("isSecretFilePath blocks .env files but allows template variants", () => {
  assert.equal(isSecretFilePath("/tmp/.env"), true);
  assert.equal(isSecretFilePath("/tmp/.env.local"), true);
  assert.equal(isSecretFilePath("/tmp/.env.example"), false);
  assert.equal(isSecretFilePath("/tmp/.env.template.dev"), false);
});

test("read_file refuses obvious secret files", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerReadFileTool, "read_file");
    const secretPath = path.join(dir, ".env");
    await writeFile(secretPath, "TOKEN=secret\n");

    const result = await tool.execute("call-1", { file_path: secretPath }, undefined, undefined, {
      cwd: dir,
    });

    assert.equal(result.isError, true);
    assert.match(String(result.content?.[0]?.text ?? ""), /Refused to read/);
  });
});

test("read_file reports file-not-found before secret blocking", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerReadFileTool, "read_file");

    await assert.rejects(
      tool.execute("call-2", { file_path: path.join(dir, ".env") }, undefined, undefined, {
        cwd: dir,
      }),
      /file not found:/,
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

test("formatGrepFilesOutput includes a count header and truncation guidance", () => {
  const output = formatGrepFilesOutput(
    {
      matches: [
        { absolutePath: "/tmp/one.ts", mtimeMs: 3 },
        { absolutePath: "/tmp/two.ts", mtimeMs: 2 },
        { absolutePath: "/tmp/three.ts", mtimeMs: 1 },
      ],
      skippedCount: 1,
    },
    { limit: 2 },
  );

  assert.equal(
    output,
    [
      "3 matching files",
      "/tmp/one.ts",
      "/tmp/two.ts",
      "",
      "[Showing 2 of 3 matches. Use limit to see more.]",
      "",
      "[Skipped 1 unreadable file.]",
    ].join("\n"),
  );
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
