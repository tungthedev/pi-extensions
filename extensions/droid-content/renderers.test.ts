import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerDroidGlobTool } from "./tools/glob.ts";
import { registerDroidGrepTool } from "./tools/grep.ts";
import { registerDroidListDirectoryTool } from "./tools/list-directory.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

function getRegisteredTool(register: (pi: any) => void, name: string) {
  let tool: any;

  register({
    registerTool(definition: any) {
      if (definition.name === name) {
        tool = definition;
      }
    },
  });

  assert.ok(tool, `expected tool ${name} to be registered`);
  return tool;
}

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "droid-renderers-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("Glob shows a collapsed file-count summary", () => {
  const tool = getRegisteredTool(registerDroidGlobTool, "Glob");

  const collapsed = tool.renderResult(
    { details: { count: 4 }, content: [{ type: "text", text: "..." }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 4 files (ctrl+o to expand)"]);
});

test("LS shows a collapsed entry-count summary", () => {
  const tool = getRegisteredTool(registerDroidListDirectoryTool, "LS");

  const collapsed = tool.renderResult(
    { details: { count: 6 }, content: [{ type: "text", text: "..." }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 6 entries (ctrl+o to expand)"]);
});

test("Grep uses matching-file summary wording for file_paths mode", () => {
  const tool = getRegisteredTool(registerDroidGrepTool, "Grep");

  const collapsed = tool.renderResult(
    { details: { outputMode: "file_paths", count: 3 }, content: [{ type: "text", text: "..." }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 3 matching files"]);
});

test("Grep content mode decorates grep stats and renders grep-style summary", async () => {
  const tool = getRegisteredTool(registerDroidGrepTool, "Grep");

  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "a.ts"), "match\nother\nmatch\n");
    await writeFile(path.join(dir, "b.ts"), "match\n");

    const result = await tool.execute(
      "call-1",
      { pattern: "match", path: dir, output_mode: "content", glob_pattern: "*.ts" },
      undefined,
      undefined,
      { cwd: dir },
    );

    assert.equal(result.details.matchCount, 3);
    assert.equal(result.details.fileCount, 2);

    const collapsed = tool.renderResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      { isError: false, lastComponent: undefined } as never,
    );

    assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Matched 3 lines in 2 files"]);
  });
});
