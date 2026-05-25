import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import { syncGoalWidget } from "./goal-widget.js";

const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as ExtensionContext["ui"]["theme"];

test("syncGoalWidget hides the above-editor widget when no goal is set", () => {
  const calls: Array<{ key: string; lines: string[] | undefined; placement?: string }> = [];
  const ctx = {
    hasUI: true,
    ui: {
      theme,
      setWidget(key: string, lines: string[] | undefined, options?: { placement?: string }) {
        calls.push({ key, lines, placement: options?.placement });
      },
    },
  } as unknown as ExtensionContext;

  syncGoalWidget(ctx, null);

  assert.deepEqual(calls, [{ key: "goal", lines: undefined, placement: "aboveEditor" }]);
});
