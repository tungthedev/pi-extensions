import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_SET_STATUS_SEGMENT_EVENT } from "../editor/events.js";
import goalExtension from "./index.js";

const GOAL_ICON = String.fromCodePoint(0x1f3af);

type EventHandler = (event: object, ctx: ExtensionContext) => unknown | Promise<unknown>;

function createGoalHarness() {
  const entries: ReturnType<ExtensionCommandContext["sessionManager"]["getBranch"]> = [];
  const handlers = new Map<string, EventHandler[]>();
  const sentMessages: Array<{
    message: Parameters<ExtensionAPI["sendMessage"]>[0];
    options: Parameters<ExtensionAPI["sendMessage"]>[1];
  }> = [];
  const emitted: Array<{ event: string; data: unknown }> = [];
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
    abort() {},
    ui: {
      confirm: async () => true,
      notify() {},
      setStatus() {},
    },
  } as unknown as ExtensionCommandContext;

  goalExtension({
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
    registerTool() {},
    sendMessage(
      message: Parameters<ExtensionAPI["sendMessage"]>[0],
      options: Parameters<ExtensionAPI["sendMessage"]>[1],
    ) {
      sentMessages.push({ message, options });
    },
  } as never);

  return {
    ctx,
    emitted,
    sentMessages,
    async runCommand(args: string) {
      assert.ok(commandHandler);
      await commandHandler(args, ctx);
    },
  };
}

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
