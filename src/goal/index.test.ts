import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_SET_STATUS_SEGMENT_EVENT } from "../editor/events.js";
import goalExtension from "./index.js";
import type { GoalCustomEntry, GoalExtensionBridge, GoalBridgeProjectionUpdate } from "./types.js";

const GOAL_ICON = String.fromCodePoint(0x1f3af);

type EventHandler = (event: object, ctx: ExtensionContext) => unknown | Promise<unknown>;
type TestWidgetFactory = (
  tui: { requestRender(): void },
  theme: ExtensionContext["ui"]["theme"],
) => { render(width: number): string[] };

function createGoalHarness(options: { bridge?: GoalExtensionBridge } = {}) {
  const entries: ReturnType<ExtensionCommandContext["sessionManager"]["getBranch"]> = [];
  const handlers = new Map<string, EventHandler[]>();
  const sentMessages: Array<{
    message: Parameters<ExtensionAPI["sendMessage"]>[0];
    options: Parameters<ExtensionAPI["sendMessage"]>[1];
  }> = [];
  const emitted: Array<{ event: string; data: unknown }> = [];
  const notifications: Array<{ message: string; level?: string }> = [];
  const tools = new Map<string, Record<string, any>>();
  let aborts = 0;
  const widgets: Array<{
    key: string;
    lines: string[] | TestWidgetFactory | undefined;
    placement?: string;
  }> = [];
  let commandHandler:
    | ((args: string, ctx: ExtensionCommandContext) => void | Promise<void>)
    | null = null;
  let entryIndex = 0;

  const sessionManager: ExtensionCommandContext["sessionManager"] = {
    getBranch: () => entries,
    getCwd: () => "/tmp",
    getEntries: () => entries,
    getEntry: () => undefined,
    getHeader: () => null,
    getLabel: () => undefined,
    getLeafEntry: () => undefined,
    getLeafId: () => null,
    getSessionDir: () => "/tmp",
    getSessionFile: () => undefined,
    getSessionId: () => "session",
    getSessionName: () => undefined,
    getTree: () => [],
  };

  const ctx = {
    cwd: "/tmp",
    hasUI: true,
    hasPendingMessages: () => false,
    isIdle: () => true,
    sessionManager,
    abort() {
      aborts += 1;
    },
    ui: {
      theme: {
        fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      },
      confirm: async () => true,
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      setStatus() {},
      setWidget(key: string, lines: string[] | TestWidgetFactory | undefined, options?: { placement?: string }) {
        widgets.push({ key, lines, placement: options?.placement });
      },
    },
  } as unknown as ExtensionCommandContext;

  goalExtension(
    {
      appendEntry(customType: string, data: unknown) {
        entries.push({
          type: "custom",
          id: `entry-${++entryIndex}`,
          parentId: null,
          timestamp: new Date(0).toISOString(),
          customType,
          data,
        });
      },
      events: {
        emit(event: string, data: unknown) {
          emitted.push({ event, data });
        },
      },
      on(event: string, handler: EventHandler) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      registerCommand(name: string, options: { handler: typeof commandHandler }) {
        if (name === "goal") commandHandler = options.handler;
      },
      registerTool(tool: Record<string, any>) {
        tools.set(tool.name as string, tool);
      },
      sendMessage(
        message: Parameters<ExtensionAPI["sendMessage"]>[0],
        options: Parameters<ExtensionAPI["sendMessage"]>[1],
      ) {
        sentMessages.push({ message, options });
      },
    } as never,
    { bridge: options.bridge },
  );

  return {
    ctx,
    emitted,
    widgets,
    notifications,
    sentMessages,
    tools,
    entries,
    get aborts() {
      return aborts;
    },
    currentGoal() {
      const goalEntries = entries
        .map((entry) => (entry as { data?: unknown }).data as GoalCustomEntry | undefined)
        .filter((entry): entry is GoalCustomEntry => entry?.version === 1);
      const last = goalEntries.at(-1);
      return last?.kind === "set" ? last.goal : null;
    },
    async runCommand(args: string) {
      assert.ok(commandHandler);
      await commandHandler(args, ctx);
    },
    async runEvent(event: string, payload: object) {
      for (const handler of handlers.get(event) ?? []) {
        await handler(payload, ctx as unknown as ExtensionContext);
      }
    },
  };
}

test("session reload emits a projection update without a transition", async () => {
  const updates: GoalBridgeProjectionUpdate[] = [];
  const harness = createGoalHarness({
    bridge: {
      onGoalUpdate(update) {
        updates.push(update);
      },
    },
  });

  await harness.runCommand("ship the feature");
  updates.length = 0;

  await harness.runEvent("session_tree", {});

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.state.goal?.objective, "ship the feature");
  assert.equal(updates[0]?.transition, undefined);
});

test("goal mutations emit one projection update with a Pi-owned transition id", async () => {
  const updates: GoalBridgeProjectionUpdate[] = [];
  const harness = createGoalHarness({
    bridge: {
      onGoalUpdate(update) {
        updates.push(update);
      },
    },
  });

  await harness.runCommand("ship the feature");

  const created = updates.at(-1);
  assert.equal(created?.transition?.kind, "created");
  assert.match(created?.transition?.eventId ?? "", /^goal-created-/);
  updates.length = 0;

  await harness.runCommand("pause");

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.state.goal?.status, "paused");
  assert.equal(updates[0]?.transition?.kind, "paused");
  assert.match(updates[0]?.transition?.eventId ?? "", /^goal-paused-/);
});

test("/goal objective queues hidden follow-up and shows target icon in editor border", async () => {
  const harness = createGoalHarness();

  await harness.runCommand("ship the feature");

  assert.equal(harness.sentMessages.length, 1);
  assert.deepEqual(harness.sentMessages[0]?.options, { triggerTurn: true, deliverAs: "followUp" });
  assert.deepEqual(harness.emitted.at(-1), {
    event: EDITOR_SET_STATUS_SEGMENT_EVENT,
    data: { key: "goal", text: GOAL_ICON, align: "right", priority: -2 },
  });
});

test("/goal pause, resume, and clear update persisted state and queued work", async () => {
  const harness = createGoalHarness();

  await harness.runCommand("ship the feature");
  const activeGoal = harness.currentGoal();
  assert.equal(activeGoal?.status, "active");

  await harness.runCommand("pause");

  assert.equal(harness.currentGoal()?.status, "paused");
  assert.equal(harness.notifications.at(-1)?.message, "Goal marked paused.");

  await harness.runCommand("resume");

  assert.equal(harness.currentGoal()?.status, "active");
  assert.equal(harness.sentMessages.length, 2);
  const resumeMessage = harness.sentMessages.at(-1);
  assert.ok(resumeMessage);
  assert.deepEqual(resumeMessage.options, { triggerTurn: true, deliverAs: "followUp" });
  assert.deepEqual((resumeMessage.message as { details?: unknown }).details, {
    kind: "command_resume",
    goalId: activeGoal?.goalId,
  });

  await harness.runCommand("clear");

  assert.equal(harness.currentGoal(), null);
  assert.equal(harness.notifications.at(-1)?.message, "Goal cleared.");
});

test("budget limit hard-stops the active turn without injecting a hidden steer", async () => {
  const harness = createGoalHarness();
  const createGoal = harness.tools.get("create_goal");
  assert.ok(createGoal);

  await createGoal.execute("tool-call", {
    objective: "ship the feature",
    token_budget: 10,
  }, undefined, undefined, harness.ctx);

  await harness.runEvent("turn_start", {});
  await harness.runEvent("turn_end", {
    message: {
      role: "assistant",
      usage: { input: 7, output: 5 },
      stopReason: "endTurn",
    },
  });

  assert.equal(harness.currentGoal()?.status, "budgetLimited");
  assert.equal(harness.aborts, 1);
  assert.equal(harness.sentMessages.some((sent) => sent.options?.deliverAs === "steer"), false);
  assert.match(harness.notifications.at(-1)?.message ?? "", /token budget/i);
});

test("/goal budget updates and clears the active goal token budget", async () => {
  const harness = createGoalHarness();

  await harness.runCommand("ship the feature");
  await harness.runCommand("budget 5000");

  assert.equal(harness.currentGoal()?.tokenBudget, 5000);
  assert.equal(harness.notifications.at(-1)?.message, "Goal token budget set to 5,000.");

  await harness.runCommand("budget 0");

  assert.equal(harness.currentGoal()?.tokenBudget, null);
  assert.equal(harness.notifications.at(-1)?.message, "Goal token budget cleared.");
});

test("/goal resume --budget updates the budget before queueing resumed work", async () => {
  const harness = createGoalHarness();

  await harness.runCommand("ship the feature");
  const activeGoal = harness.currentGoal();
  await harness.runCommand("pause");
  await harness.runCommand("resume --budget 7500");

  assert.equal(harness.currentGoal()?.status, "active");
  assert.equal(harness.currentGoal()?.tokenBudget, 7500);
  assert.equal(harness.sentMessages.length, 2);
  assert.deepEqual((harness.sentMessages.at(-1)?.message as { details?: unknown } | undefined)?.details, {
    kind: "command_resume",
    goalId: activeGoal?.goalId,
  });
});
