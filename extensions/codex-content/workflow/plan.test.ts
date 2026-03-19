import assert from "node:assert/strict";
import test from "node:test";

import { syncPlanUi } from "./plan.ts";

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
