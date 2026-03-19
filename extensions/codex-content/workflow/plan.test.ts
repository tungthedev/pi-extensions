import assert from "node:assert/strict";
import test from "node:test";

import { buildUpdatePlanResultLines, planWidgetLines, syncPlanUi } from "./plan.ts";

const ctx = {
  ui: {
    theme: {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    },
  },
} as any;

test("planWidgetLines renders compact active-step summary", () => {
  const lines = planWidgetLines(ctx, "Current plan state", [
    { step: "Inspect codex-content widgets", status: "completed" },
    { step: "Inspect handoff extension UI", status: "completed" },
    { step: "Draw realistic ASCII layout", status: "in_progress" },
    { step: "Review layout ordering", status: "pending" },
  ]);

  assert.deepEqual(lines, ["Plan 2/4 • Draw realistic ASCII layout"]);
});

test("planWidgetLines renders compact completed summary", () => {
  const lines = planWidgetLines(ctx, undefined, [
    { step: "Ship compact widgets", status: "completed" },
    { step: "Verify renderer output", status: "completed" },
  ]);

  assert.deepEqual(lines, ["Plan 2/2 • complete"]);
});

test("syncPlanUi clears the status segment and keeps the widget", () => {
  const calls: Array<{ key: string; value: string | undefined }> = [];
  const widgets: Array<{ key: string; lines: string[] | undefined }> = [];
  const ui = {
    theme: {
      fg: (_color: string, text: string) => text,
    },
    setStatus: (key: string, value?: string) => {
      calls.push({ key, value });
    },
    setWidget: (key: string, lines?: string[]) => {
      widgets.push({ key, lines });
    },
  };

  syncPlanUi({ ui } as any, undefined, [
    { step: "Inspect codex-content widgets", status: "completed" },
    { step: "Draw realistic ASCII layout", status: "in_progress" },
  ]);

  assert.deepEqual(calls, [{ key: "codex-content:plan", value: undefined }]);
  assert.deepEqual(widgets, [
    {
      key: "codex-content:plan",
      lines: ["Plan 1/2 • Draw realistic ASCII layout"],
    },
  ]);
});

test("planWidgetLines truncates long step text to 150 chars", () => {
  const longStep = "A".repeat(180);
  const lines = planWidgetLines(ctx, undefined, [
    { step: longStep, status: "in_progress" },
    { step: "Review layout ordering", status: "pending" },
  ]);

  assert.deepEqual(lines, [`Plan 0/2 • ${"A".repeat(147)}...`]);
});

test("buildUpdatePlanResultLines renders a new plan block", () => {
  const lines = buildUpdatePlanResultLines(
    ctx.ui.theme,
    {
      changeType: "new",
      explanation: "Test plan for exercising plan rendering and per-item status updates.",
      items: [
        { step: "Create a tiny test plan with three items", status: "pending" },
        { step: "Mark the first item in progress", status: "pending" },
        {
          step: "Complete the first item and advance the rest one by one",
          status: "pending",
        },
      ],
    },
    false,
  );

  assert.deepEqual(lines, [
    "• New Plan",
    "└ Test plan for exercising plan rendering and per-item status updates.",
    "  □ Create a tiny test plan with three items",
    "  □ Mark the first item in progress",
    "  □ Complete the first item and advance the rest one by one",
  ]);
});

test("buildUpdatePlanResultLines renders an updated plan block", () => {
  const lines = buildUpdatePlanResultLines(
    ctx.ui.theme,
    {
      changeType: "updated",
      explanation: "Complete the second item and start the third.",
      items: [
        {
          step: "Create a tiny test plan with three items",
          status: "completed",
        },
        { step: "Mark the first item in progress", status: "completed" },
        {
          step: "Complete the first item and advance the rest one by one",
          status: "pending",
        },
      ],
    },
    false,
  );

  assert.deepEqual(lines, [
    "• Updated Plan",
    "└ Complete the second item and start the third.",
    "  ✔ Create a tiny test plan with three items",
    "  ✔ Mark the first item in progress",
    "  □ Complete the first item and advance the rest one by one",
  ]);
});

test("buildUpdatePlanResultLines collapses long plans around the active item", () => {
  const lines = buildUpdatePlanResultLines(
    ctx.ui.theme,
    {
      changeType: "updated",
      explanation: "Keep focus near the active item.",
      items: [
        { step: "Task 1", status: "completed" },
        { step: "Task 2", status: "completed" },
        { step: "Task 3", status: "completed" },
        { step: "Task 4", status: "completed" },
        { step: "Task 5", status: "in_progress" },
        { step: "Task 6", status: "pending" },
        { step: "Task 7", status: "pending" },
        { step: "Task 8", status: "pending" },
      ],
    },
    false,
  );

  assert.deepEqual(lines, [
    "• Updated Plan",
    "└ Keep focus near the active item.",
    "  ✔ Task 3",
    "  ✔ Task 4",
    "  ◐ Task 5",
    "  □ Task 6",
    "  □ Task 7",
    "  ... +3 more tasks (Ctrl+O to expand)",
  ]);
});

test("buildUpdatePlanResultLines shows all long-plan items when expanded", () => {
  const lines = buildUpdatePlanResultLines(
    ctx.ui.theme,
    {
      changeType: "updated",
      explanation: "Keep focus near the active item.",
      items: [
        { step: "Task 1", status: "completed" },
        { step: "Task 2", status: "completed" },
        { step: "Task 3", status: "completed" },
        { step: "Task 4", status: "completed" },
        { step: "Task 5", status: "in_progress" },
        { step: "Task 6", status: "pending" },
        { step: "Task 7", status: "pending" },
        { step: "Task 8", status: "pending" },
      ],
    },
    true,
  );

  assert.deepEqual(lines, [
    "• Updated Plan",
    "└ Keep focus near the active item.",
    "  ✔ Task 1",
    "  ✔ Task 2",
    "  ✔ Task 3",
    "  ✔ Task 4",
    "  ◐ Task 5",
    "  □ Task 6",
    "  □ Task 7",
    "  □ Task 8",
  ]);
});
