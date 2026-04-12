import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import registerPiCustomExtension from "./index.ts";

function captureTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  registerPiCustomExtension({
    on() {},
    registerTool(definition: { name: string }) {
      tools[definition.name] = definition;
    },
  } as never);

  return tools;
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("read resolves relative paths from the session cwd", async () => {
  const tools = captureTools();
  const tool = tools.read;
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

test("write uses call summary and hides collapsed result", () => {
  const tools = captureTools();
  const tool = tools.write;

  const call = tool.renderCall(
    { path: "src/a.ts", content: "one\ntwo" },
    theme,
    { lastComponent: undefined } as never,
  );
  assert.equal(call.text, "Wrote src/a.ts (2 lines)");

  const collapsed = tool.renderResult(
    { content: [{ type: "text", text: "ok" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );
  assert.deepEqual(collapsed.render(120), []);
});

test("find shows a one-line collapsed summary", () => {
  const tools = captureTools();
  const tool = tools.find;

  const collapsed = tool.renderResult(
    { details: { count: 14 }, content: [{ type: "text", text: "..." }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 14 files (ctrl+o to expand)"]);
});

test("grep shows a one-line collapsed summary", async () => {
  const tools = captureTools();
  const tool = tools.grep;
  const root = fs.mkdtempSync(path.join(tmpdir(), "grep-summary-"));
  const fileA = path.join(root, "a.ts");
  const fileB = path.join(root, "b.ts");
  fs.writeFileSync(fileA, "match\nother\nmatch\n", "utf8");
  fs.writeFileSync(fileB, "match\n", "utf8");

  try {
    const result = await tool.execute(
      "call-2",
      { pattern: "match", path: root, glob: "*.ts" },
      undefined,
      () => undefined,
      { cwd: root },
    );

    const collapsed = tool.renderResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      { isError: false, lastComponent: undefined } as never,
    );

    assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Matched 3 lines in 2 files"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
