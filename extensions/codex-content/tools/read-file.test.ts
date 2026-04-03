import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildLineRecords,
  isSecretFilePath,
  readIndentationBlock,
  registerReadFileTool,
} from "./read-file.ts";

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
