import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import { registerGoalTools } from "./tools.js";
import type { ThreadGoal } from "./types.js";

function captureGoalTools(host: {
  getGoal(): ThreadGoal | null;
  setGoal(goal: ThreadGoal, source: string, ctx: ExtensionContext): void;
  completeGoal(source: string, ctx: ExtensionContext): { ok: boolean; message: string; goal: ThreadGoal | null };
}) {
  const tools = new Map<string, Record<string, any>>();
  registerGoalTools(
    {
      registerTool(tool: Record<string, any>) {
        tools.set(tool.name as string, tool);
      },
    } as unknown as ExtensionAPI,
    host as never,
  );
  return tools;
}

function toolText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.ok(typeof text === "string");
  return text;
}

test("create_goal persists a valid goal and rejects replacing an active goal", async () => {
  let currentGoal: ThreadGoal | null = null;
  const persisted: ThreadGoal[] = [];
  const tools = captureGoalTools({
    getGoal: () => currentGoal,
    setGoal(goal) {
      currentGoal = goal;
      persisted.push(goal);
    },
    completeGoal: () => ({ ok: false, message: "unused", goal: currentGoal }),
  });

  const createGoal = tools.get("create_goal");
  assert.ok(createGoal);

  const created = await createGoal.execute("tool-call", {
    objective: " ship the feature ",
    token_budget: 50_000,
  }, undefined, undefined, {});

  assert.equal(persisted.length, 1);
  const persistedGoal = persisted.at(-1);
  assert.ok(persistedGoal);
  assert.equal(persistedGoal.objective, "ship the feature");
  assert.equal(persistedGoal.tokenBudget, 50_000);
  assert.equal(JSON.parse(toolText(created)).remainingTokens, 50_000);

  const rejected = await createGoal.execute("tool-call", {
    objective: "replace it",
  }, undefined, undefined, {});

  assert.equal(persisted.length, 1);
  assert.match(toolText(rejected), /^Error: cannot create a new goal/);
});

test("update_goal completes through the host and reports final budget usage", async () => {
  const completedGoal: ThreadGoal = {
    goalId: "goal-1",
    objective: "ship the feature",
    status: "complete",
    tokenBudget: 50_000,
    usage: { tokensUsed: 12_400, activeSeconds: 180 },
    createdAt: 1,
    updatedAt: 2,
  };
  const calls: string[] = [];
  const tools = captureGoalTools({
    getGoal: () => completedGoal,
    setGoal() {},
    completeGoal(source) {
      calls.push(source);
      return { ok: true, message: "Goal marked complete.", goal: completedGoal };
    },
  });

  const updateGoal = tools.get("update_goal");
  assert.ok(updateGoal);

  const result = await updateGoal.execute("tool-call", { status: "complete" }, undefined, undefined, {});
  const details = JSON.parse(toolText(result));

  assert.deepEqual(calls, ["tool"]);
  assert.equal(details.goal.status, "complete");
  assert.match(details.completionBudgetReport, /tokens used: 12,400 of 50,000/);
});
