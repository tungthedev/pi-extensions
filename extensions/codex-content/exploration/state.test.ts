import assert from "node:assert/strict";
import test from "node:test";

import { ExplorationTracker, summarizeExplorationItems } from "./state.ts";

test("ExplorationTracker records a completed group from tool_execution_end when tool_result is absent", () => {
  const tracker = new ExplorationTracker();

  assert.equal(
    tracker.onToolExecutionStart("call-1", "read_file", {
      file_path: "/tmp/example.ts",
      offset: 1,
      limit: 20,
    }),
    true,
  );

  assert.equal(
    tracker.onToolExecutionEnd(
      "call-1",
      "read_file",
      {
        content: [{ type: "text", text: "L1: export const value = 1;" }],
      },
      false,
    ),
    true,
  );

  const groups = tracker.completedExplorationGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[0]?.items[0]?.detail, "Read /tmp/example.ts:1-20");
});

test("ExplorationTracker does not duplicate items when both tool_result and tool_execution_end fire", () => {
  const tracker = new ExplorationTracker();

  tracker.onToolExecutionStart("call-2", "find_files", {
    path: "/repo",
    pattern: "*.ts",
  });

  tracker.onToolResult({
    type: "tool_result",
    toolCallId: "call-2",
    toolName: "find_files",
    input: {
      path: "/repo",
      pattern: "*.ts",
    },
    content: [{ type: "text", text: "1 matching file\n/repo/index.ts" }],
    details: { count: 1 },
    isError: false,
  } as any);

  tracker.onToolExecutionEnd(
    "call-2",
    "find_files",
    {
      content: [{ type: "text", text: "1 matching file\n/repo/index.ts" }],
    },
    false,
  );

  const groups = tracker.completedExplorationGroups();
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.items.map((item) => item.detail),
    ["Find *.ts in /repo"],
  );
});

test("summarizeExplorationItems merges consecutive successful read items", () => {
  assert.deepEqual(
    summarizeExplorationItems([
      { toolName: "read_file", detail: "Read /repo/a.ts" },
      { toolName: "read", detail: "Read /repo/b.ts" },
      { toolName: "find_files", detail: "Find *.ts in /repo" },
    ]),
    [
      { detail: "Read /repo/a.ts, /repo/b.ts", failed: undefined, errorPreview: undefined },
      { detail: "Find *.ts in /repo", failed: undefined, errorPreview: undefined },
    ],
  );
});

test("ExplorationTracker summarizes live status from active exploration details", () => {
  const tracker = new ExplorationTracker();

  tracker.onToolExecutionStart("call-1", "read_file", {
    file_path: "/tmp/example.ts",
    offset: 1,
    limit: 20,
  });
  tracker.onToolExecutionStart("call-2", "find_files", {
    path: "/repo",
    pattern: "*.ts",
  });

  assert.equal(tracker.liveExplorationStatusText(), "Exploring: Read x1, Search x1");
});
