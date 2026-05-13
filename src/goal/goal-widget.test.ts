import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import assert from "node:assert/strict";
import test from "node:test";

import { GoalWidget, renderGoalWidgetLine, syncGoalWidget } from "./goal-widget.js";
import type { ThreadGoal } from "./types.js";

const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as ExtensionContext["ui"]["theme"];

const plainTheme = {
  fg: (_color: string, text: string) => text,
} as ExtensionContext["ui"]["theme"];

function goal(overrides: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    goalId: "goal-1",
    objective: "ship the feature",
    status: "active",
    tokenBudget: null,
    usage: { tokensUsed: 12_400, activeSeconds: 180 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}

test("GoalWidget preserves usage metadata when objective text is truncated", () => {
  assert.deepEqual(new GoalWidget(goal(), plainTheme).render(48), [
    " ● ship the feature                  3m · 12.4k ",
  ]);

  assert.equal(
    stripAnsi(renderGoalWidgetLine(
      goal({ objective: "ship the feature this is a long long long goal" }),
      plainTheme,
      48,
    )),
    "● ship the feature this is a long ... 3m · 12.4k",
  );
});

test("GoalWidget reserves width for the budget usage glyph", () => {
  const rendered = new GoalWidget(
    goal({
      objective: "ship the feature this is a long long long goal",
      tokenBudget: 10_000,
    }),
    plainTheme,
  ).render(48)[0] ?? "";

  assert.equal(visibleWidth(rendered), 48);
  assert.match(rendered, /12\.4k\/10k $/);
});

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
