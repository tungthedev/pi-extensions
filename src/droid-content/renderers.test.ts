import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Box } from "@mariozechner/pi-tui";

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

test("Glob uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerDroidGlobTool, "Glob");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ folder: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["Glob src"]);

  const collapsed = tool.renderResult(
    { details: { count: 4 }, content: [{ type: "text", text: "4 matching files\nsrc/a.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["Glob src"]);
});

test("LS uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerDroidListDirectoryTool, "LS");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ directory_path: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["List src"]);

  const collapsed = tool.renderResult(
    { details: { count: 6 }, content: [{ type: "text", text: "Absolute path: src\n1. [file] a.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["List src"]);
});

test("Grep file_paths mode uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerDroidGrepTool, "Grep");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ pattern: "needle", path: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Grep needle in src",
  ]);

  const collapsed = tool.renderResult(
    { details: { outputMode: "file_paths", count: 3 }, content: [{ type: "text", text: "src/a.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Grep needle in src",
  ]);
});

test("Grep content mode decorates grep stats and hides collapsed result", async () => {
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
    const state: Record<string, unknown> = {};
    const call = tool.renderCall({ pattern: "match", path: dir }, theme, {
      state,
      lastComponent: undefined,
    } as never);

    const collapsed = tool.renderResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      { state, isError: false, lastComponent: undefined } as never,
    );

    assert.equal(tool.renderShell, "self");
    assert.ok(call instanceof Box);
    assert.deepEqual(collapsed.render(120), []);
    assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
      `Grep match in ${dir}`,
    ]);
  });
});
