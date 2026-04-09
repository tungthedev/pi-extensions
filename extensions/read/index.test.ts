import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";
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

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("read extension renders the call like Pi native read", () => {
  const tool = captureReadTool();

  const rendered = tool.renderCall(
    { file_path: "src/app.ts", offset: 3, limit: 2 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Read src/app.ts:3-4");
});

test("read extension shortens cwd-local absolute paths but keeps outside paths absolute", () => {
  const tool = captureReadTool();

  const inside = tool.renderCall(
    { file_path: path.join(process.cwd(), "extensions/read/index.ts") },
    theme,
    { lastComponent: undefined } as never,
  );
  const outside = tool.renderCall(
    { file_path: "/tmp/outside.ts" },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((inside as any).text, "Read extensions/read/index.ts");
  assert.equal((outside as any).text, "Read /tmp/outside.ts");
});

test("read extension uses native Pi read rendering in collapsed and expanded modes", () => {
  const tool = captureReadTool();

  const collapsed = tool.renderResult(
    {
      content: [{ type: "text", text: "first line\nsecond line" }],
    },
    { expanded: false, isPartial: false },
    theme,
    { args: { file_path: "notes" }, showImages: false, lastComponent: undefined } as never,
  );

  assert.match((collapsed as any).text, /first line/);
  assert.match((collapsed as any).text, /second line/);

  const expanded = tool.renderResult(
    {
      content: [{ type: "text", text: "first line\nsecond line" }],
    },
    { expanded: true, isPartial: false },
    theme,
    { args: { file_path: "notes" }, showImages: false, lastComponent: undefined } as never,
  );

  assert.match((expanded as any).text, /first line/);
  assert.match((expanded as any).text, /second line/);
});

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
      { file_path: "../note.txt" },
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
      { file_path: absoluteTarget },
      undefined,
      () => undefined,
      { cwd: nested },
    );
    const nestedResult = await tool.execute(
      "call-3",
      { file_path: "local.txt" },
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

test("shared resolver enables read_file only for codex and forge modes", () => {
  const toolInfos = resolveRegisteredToolInfos([
    { name: "read", description: "builtin" },
    { name: "read_file", description: "enhanced" },
    { name: "write", description: "builtin" },
    { name: "shell", description: "shell" },
    { name: "Task", description: "task" },
    { name: "TaskOutput", description: "task" },
    { name: "TaskStop", description: "task" },
  ]);

  assert.deepEqual(resolveToolsetToolNames("pi", toolInfos), ["read", "write", "Task", "TaskOutput", "TaskStop"]);
  assert.deepEqual(resolveToolsetToolNames("codex", toolInfos), ["shell", "read_file"]);
  assert.deepEqual(resolveToolsetToolNames("forge", toolInfos), ["write", "shell", "read_file", "Task", "TaskOutput", "TaskStop"]);
  assert.deepEqual(resolveToolsetToolNames("droid", toolInfos), ["Task", "TaskOutput", "TaskStop"]);
});
