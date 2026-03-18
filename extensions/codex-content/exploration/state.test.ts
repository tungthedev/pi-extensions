import assert from "node:assert/strict";
import test from "node:test";

import {
  combinedExplorationSummaryLines,
  explorationItemFromEvent,
  isExplorationToolName,
  liveExplorationSummary,
  summarizeExplorationItems,
} from "./state.ts";

test("compatibility tool names are recognized as exploration tools", () => {
  assert.equal(isExplorationToolName("read_file"), true);
  assert.equal(isExplorationToolName("grep_files"), true);
  assert.equal(isExplorationToolName("list_dir"), true);
  assert.equal(isExplorationToolName("shell_command"), false);
});

test("explorationItemFromEvent formats compatibility tool calls", () => {
  const readItem = explorationItemFromEvent({
    toolName: "read_file",
    toolCallId: "t1",
    input: {
      file_path: "/tmp/example.ts",
      offset: 10,
      limit: 5,
    },
    content: [{ type: "text", text: "L10: const value = 1;" }],
    isError: false,
  } as never);

  assert.deepEqual(readItem, {
    toolName: "read_file",
    detail: "Read /tmp/example.ts:10-14",
    failed: false,
    errorPreview: undefined,
  });

  const grepItem = explorationItemFromEvent({
    toolName: "grep_files",
    toolCallId: "t2",
    input: {
      pattern: "registerTool",
      path: "/repo",
      include: "**/*.ts",
    },
    content: [{ type: "text", text: "/repo/src/index.ts" }],
    isError: false,
  } as never);

  assert.deepEqual(grepItem, {
    toolName: "grep_files",
    detail: "Search /registerTool/ in /repo (**/*.ts)",
    failed: false,
    errorPreview: undefined,
  });

  const listItem = explorationItemFromEvent({
    toolName: "list_dir",
    toolCallId: "t3",
    input: {
      dir_path: "/repo/src",
    },
    content: [{ type: "text", text: "Absolute path: /repo/src" }],
    isError: false,
  } as never);

  assert.deepEqual(listItem, {
    toolName: "list_dir",
    detail: "List /repo/src",
    failed: false,
    errorPreview: undefined,
  });
});

test("summarizeExplorationItems coalesces adjacent read operations", () => {
  assert.deepEqual(
    summarizeExplorationItems([
      { toolName: "list_dir", detail: "List /repo/src" },
      { toolName: "read_file", detail: "Read /repo/src/a.ts:1-20" },
      { toolName: "read_file", detail: "Read /repo/src/b.ts:5-18" },
      { toolName: "grep_files", detail: "Search /foo/ in /repo/src" },
    ]),
    [
      { detail: "List /repo/src", failed: undefined, errorPreview: undefined },
      {
        detail: "Read /repo/src/a.ts:1-20, /repo/src/b.ts:5-18",
        failed: undefined,
        errorPreview: undefined,
      },
      { detail: "Search /foo/ in /repo/src", failed: undefined, errorPreview: undefined },
    ],
  );
});

test("liveExplorationSummary renders compact counters", () => {
  assert.equal(
    liveExplorationSummary({
      items: [
        { toolName: "read", detail: "Read a" },
        { toolName: "read_file", detail: "Read b" },
        { toolName: "grep", detail: "Search c" },
        { toolName: "grep_files", detail: "Search d" },
        { toolName: "ls", detail: "List e" },
        { toolName: "list_dir", detail: "List f" },
        { toolName: "list_dir", detail: "List g" },
      ],
    }),
    "Exploring: Read x2, Search x2, List x3",
  );
});

test("combinedExplorationSummaryLines aggregates completed groups into one compact line", () => {
  const theme = {
    fg: (_color: string, text: string) => text,
  } as any;

  assert.deepEqual(
    combinedExplorationSummaryLines(theme, [
      {
        items: [
          { toolName: "read", detail: "Read a" },
          { toolName: "grep", detail: "Search b" },
        ],
      },
      {
        items: [
          { toolName: "grep_files", detail: "Search c" },
          { toolName: "list_dir", detail: "List d" },
        ],
      },
    ]),
    ["Explored: Read x1, Search x2, List x1"],
  );
});
