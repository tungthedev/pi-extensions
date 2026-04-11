import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import registerReadExtension from "./index.ts";

function captureReadTool(): any {
  let tool: any;

  registerReadExtension({
    on() {},
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  return tool;
}

test("read extension resolves relative paths from the session cwd", async () => {
  const tool = captureReadTool();
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-session-cwd-"));
  const nested = path.join(root, "nested");
  const target = path.join(root, "note.txt");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(target, "hello from session cwd\n", "utf8");

  try {
    const result = await tool.execute(
      "call-1",
      { path: "../note.txt" },
      undefined,
      () => undefined,
      { cwd: nested },
    );

    assert.match(JSON.stringify(result), /hello from session cwd/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("read extension keeps absolute paths and nested cwd resolution intact", async () => {
  const tool = captureReadTool();
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-absolute-cwd-"));
  const nested = path.join(root, "deep", "nested");
  const absoluteTarget = path.join(root, "absolute.txt");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(absoluteTarget, "absolute path\n", "utf8");
  fs.writeFileSync(path.join(nested, "local.txt"), "nested path\n", "utf8");

  try {
    const absoluteResult = await tool.execute(
      "call-2",
      { path: absoluteTarget },
      undefined,
      () => undefined,
      { cwd: nested },
    );
    const nestedResult = await tool.execute(
      "call-3",
      { path: "local.txt" },
      undefined,
      () => undefined,
      { cwd: nested },
    );

    assert.match(JSON.stringify(absoluteResult), /absolute path/);
    assert.match(JSON.stringify(nestedResult), /nested path/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
