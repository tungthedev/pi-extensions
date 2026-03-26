import assert from "node:assert/strict";
import test from "node:test";

import { buildUpdatePlanResultLines, normalizePlanItems, syncPlanUi } from "./plan.ts";

test("syncPlanUi clears the status segment and keeps the widget", () => {
  const calls: Array<{ key: string; value: string | undefined }> = [];
  const widgets: Array<{
    key: string;
    lines: string[] | undefined;
    placement: string | undefined;
  }> = [];
  const ui = {
    theme: {
      fg: (_color: string, text: string) => text,
    },
    setStatus: (key: string, value?: string) => {
      calls.push({ key, value });
    },
    setWidget: (key: string, lines?: string[], options?: { placement?: string }) => {
      widgets.push({ key, lines, placement: options?.placement });
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
      placement: "aboveEditor",
    },
  ]);
});

test("syncPlanUi hides the widget when the plan is fully completed", () => {
  const calls: Array<{ key: string; value: string | undefined }> = [];
  const widgets: Array<{
    key: string;
    lines: string[] | undefined;
    placement: string | undefined;
  }> = [];
  const ui = {
    theme: {
      fg: (_color: string, text: string) => text,
    },
    setStatus: (key: string, value?: string) => {
      calls.push({ key, value });
    },
    setWidget: (key: string, lines?: string[], options?: { placement?: string }) => {
      widgets.push({ key, lines, placement: options?.placement });
    },
  };

  syncPlanUi({ ui } as any, undefined, [
    { step: "Inspect codex-content widgets", status: "completed" },
    { step: "Move workflow widget above the editor", status: "completed" },
  ]);

  assert.deepEqual(calls, [{ key: "codex-content:plan", value: undefined }]);
  assert.deepEqual(widgets, [
    {
      key: "codex-content:plan",
      lines: undefined,
      placement: "aboveEditor",
    },
  ]);
});

test("normalizePlanItems trims aliases and drops blank steps", () => {
  assert.deepEqual(
    normalizePlanItems([
      { description: "  Inspect repo  ", status: "done" },
      { step: "   " },
      { step: "Keep going", status: "active", note: "  now  " },
    ]),
    [
      { id: undefined, step: "Inspect repo", status: "completed", note: undefined },
      { id: undefined, step: "Keep going", status: "in_progress", note: "now" },
    ],
  );
});

test("buildUpdatePlanResultLines collapses hidden tasks around the focus item", () => {
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as any;

  const lines = buildUpdatePlanResultLines(
    theme,
    {
      changeType: "updated",
      items: [
        { step: "one", status: "completed" },
        { step: "two", status: "completed" },
        { step: "three", status: "in_progress" },
        { step: "four", status: "pending" },
        { step: "five", status: "pending" },
        { step: "six", status: "pending" },
      ],
    },
    false,
  );

  assert.equal(lines[0], "• Updated Plan");
  assert.match(lines.at(-1) ?? "", /\+1 more task/);
});
