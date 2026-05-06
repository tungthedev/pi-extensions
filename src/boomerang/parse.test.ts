import assert from "node:assert/strict";
import test from "node:test";

import { BranchSummaryMessageComponent, initTheme } from "@mariozechner/pi-coding-agent";

import boomerangExtension, {
  extractRethrow,
  getEffectiveArgs,
  installBoomerangBranchSummaryRendererPatch,
  parseChain,
} from "./index.ts";
import {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "../editor/events.ts";

const BOOMERANG_ICON = String.fromCodePoint(0x1fa83);

function createBoomerangHarness(options: { commandCapable?: boolean } = {}) {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const shortcuts = new Map<string, { handler: (ctx: any) => Promise<void> }>();
  const handlers = new Map<string, Function[]>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  const customMessages: Array<{ message: unknown; options: unknown }> = [];

  boomerangExtension({
    getThinkingLevel: () => "off",
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, command);
    },
    registerShortcut(name: string, shortcut: { handler: (ctx: any) => Promise<void> }) {
      shortcuts.set(name, shortcut);
    },
    registerTool() {},
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    sendMessage(message: unknown, options: unknown) {
      customMessages.push({ message, options });
    },
    sendUserMessage() {},
    events: {
      emit(event: string, data: unknown) {
        emitted.push({ event, data });
      },
    },
  } as never);

  const notifications: string[] = [];
  const statuses: Array<string | undefined> = [];
  let reloadCalls = 0;
  let navigateTreeCalls = 0;
  let branchWithSummaryCalls = 0;
  const ctx = {
    cwd: "/repo",
    hasUI: true,
    model: { provider: "test", id: "test-model" },
    sessionManager: {
      getLeafId: () => "entry-1",
      getBranch: () => [
        { id: "entry-1", type: "message", message: { role: "user", content: "start" } },
        { id: "entry-2", type: "message", message: { role: "assistant", content: "done" } },
      ],
      branchWithSummary: () => {
        branchWithSummaryCalls += 1;
        return "summary-1";
      },
    },
    isIdle: () => true,
    reload: async () => {
      reloadCalls += 1;
    },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      notify(message: string) {
        notifications.push(message);
      },
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
      setEditorComponent() {
        throw new Error("setEditorComponent should not be used for fallback reload");
      },
      getEditorText: () => "",
      setEditorText() {},
    },
  } as any;

  if (options.commandCapable) {
    ctx.navigateTree = async () => {
      navigateTreeCalls += 1;
      return { cancelled: false };
    };
  }

  return {
    commands,
    shortcuts,
    handlers,
    emitted,
    ctx,
    notifications,
    statuses,
    customMessages,
    getReloadCalls: () => reloadCalls,
    getNavigateTreeCalls: () => navigateTreeCalls,
    getBranchWithSummaryCalls: () => branchWithSummaryCalls,
  };
}

async function startAutoBoomerangTask(
  handlers: Map<string, Function[]>,
  ctx: any,
  task: string,
): Promise<string> {
  for (const handler of handlers.get("input") ?? []) {
    await handler({ text: task }, ctx);
  }
  const event = { systemPrompt: "base" };
  let result: { systemPrompt?: string } | undefined;
  for (const handler of handlers.get("before_agent_start") ?? []) {
    result = await handler(event, ctx);
  }
  return result?.systemPrompt ?? event.systemPrompt;
}

async function finishAgentTurn(handlers: Map<string, Function[]>, ctx: any): Promise<void> {
  for (const handler of handlers.get("agent_end") ?? []) {
    await handler({}, ctx);
  }
}

test("parseChain handles chained templates with inline and global args", () => {
  const result = parseChain('/scout "auth" -> /planner -> /impl -- "shared arg"');

  assert.deepEqual(result, {
    steps: [
      { templateRef: "scout", args: ["auth"] },
      { templateRef: "planner", args: [] },
      { templateRef: "impl", args: [] },
    ],
    globalArgs: ["shared arg"],
  });
});

test("parseChain rejects non-chain or malformed chains", () => {
  assert.equal(parseChain("/single"), null);
  assert.equal(parseChain("/a -> b"), null);
  assert.equal(parseChain("/a ->"), null);
});

test("extractRethrow removes valid rethrow metadata before global args", () => {
  assert.deepEqual(extractRethrow('/a -> /b --rethrow 2 -- "global arg"'), {
    task: '/a -> /b -- "global arg"',
    rethrowCount: 2,
  });
});

test("extractRethrow leaves rethrow tokens after standalone separator alone", () => {
  assert.equal(extractRethrow("/task -- --rethrow 2"), null);
});

test("getEffectiveArgs prefers step args and falls back to global args", () => {
  assert.deepEqual(
    getEffectiveArgs({ templateRef: "x", template: { content: "", models: [] }, args: ["local"] }, [
      "global",
    ]),
    ["local"],
  );
  assert.deepEqual(
    getEffectiveArgs({ templateRef: "x", template: { content: "", models: [] }, args: [] }, [
      "global",
    ]),
    ["global"],
  );
});

test("boomerang command emits editor status segment without forcing expanded tools", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  let setToolsExpandedCalls = 0;
  const sentMessages: string[] = [];

  boomerangExtension({
    getThinkingLevel: () => "off",
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, command);
    },
    registerShortcut() {},
    registerTool() {},
    on() {},
    sendUserMessage(message: string) {
      sentMessages.push(message);
    },
    events: {
      emit(event: string, data: unknown) {
        emitted.push({ event, data });
      },
    },
  } as never);

  await commands.get("boomerang")!.handler("refactor auth flow", {
    cwd: "/repo",
    hasUI: true,
    model: { provider: "test", id: "test-model" },
    sessionManager: {
      getLeafId: () => "entry-1",
      getBranch: () => [{ id: "entry-1", type: "message", message: { role: "user", content: "start" } }],
    },
    isIdle: () => true,
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      notify() {},
      setStatus() {},
      setToolsExpanded() {
        setToolsExpandedCalls += 1;
      },
    },
  });

  assert.deepEqual(sentMessages, ["refactor auth flow"]);
  assert.equal(setToolsExpandedCalls, 0);
  assert.deepEqual(emitted.at(-1), {
    event: EDITOR_SET_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang", text: BOOMERANG_ICON, align: "right", priority: -1 },
  });
});

test("boomerang session reset removes editor status segment", async () => {
  const handlers = new Map<string, Function[]>();
  const emitted: Array<{ event: string; data: unknown }> = [];

  boomerangExtension({
    getThinkingLevel: () => "off",
    registerCommand() {},
    registerShortcut() {},
    registerTool() {},
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    events: {
      emit(event: string, data: unknown) {
        emitted.push({ event, data });
      },
    },
  } as never);

  for (const handler of handlers.get("session_start") ?? []) {
    await handler(undefined, {
      hasUI: true,
      ui: {
        theme: { fg: (_color: string, text: string) => text },
        setStatus() {},
      },
    });
  }

  assert.deepEqual(emitted.at(-1), {
    event: EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang" },
  });
});

test("auto-boomerang shortcut advertises one-shot and always-on in the editor bar", async () => {
  const { shortcuts, ctx, emitted } = createBoomerangHarness();
  const shortcut = shortcuts.get("ctrl+alt+b");
  assert.ok(shortcut);

  await shortcut.handler(ctx);
  assert.deepEqual(emitted.at(-1), {
    event: EDITOR_SET_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang", text: `${BOOMERANG_ICON}+1`, align: "right", priority: -1 },
  });

  await shortcut.handler(ctx);
  assert.deepEqual(emitted.at(-1), {
    event: EDITOR_SET_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang", text: `${BOOMERANG_ICON}+∞`, align: "right", priority: -1 },
  });

  await shortcut.handler(ctx);
  assert.deepEqual(emitted.at(-1), {
    event: EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang" },
  });
});

test("auto-boomerang consumes one-shot but keeps always-on enabled", async () => {
  const onceHarness = createBoomerangHarness();
  const onceShortcut = onceHarness.shortcuts.get("ctrl+alt+b");
  assert.ok(onceShortcut);

  await onceShortcut.handler(onceHarness.ctx);
  const oncePrompt = await startAutoBoomerangTask(
    onceHarness.handlers,
    onceHarness.ctx,
    "one-shot task",
  );
  assert.match(oncePrompt, /BOOMERANG MODE ACTIVE/);
  assert.deepEqual(onceHarness.emitted.at(-1), {
    event: EDITOR_SET_STATUS_SEGMENT_EVENT,
    data: { key: "boomerang", text: BOOMERANG_ICON, align: "right", priority: -1 },
  });

  const alwaysHarness = createBoomerangHarness();
  const shortcut = alwaysHarness.shortcuts.get("ctrl+alt+b");
  assert.ok(shortcut);

  await shortcut.handler(alwaysHarness.ctx);
  await shortcut.handler(alwaysHarness.ctx);

  for (const task of ["first task", "second task"]) {
    const prompt = await startAutoBoomerangTask(alwaysHarness.handlers, alwaysHarness.ctx, task);
    assert.match(prompt, /BOOMERANG MODE ACTIVE/);
    assert.deepEqual(alwaysHarness.emitted.at(-1), {
      event: EDITOR_SET_STATUS_SEGMENT_EVENT,
      data: { key: "boomerang", text: `${BOOMERANG_ICON}+∞`, align: "right", priority: -1 },
    });

    await finishAgentTurn(alwaysHarness.handlers, alwaysHarness.ctx);
    assert.deepEqual(alwaysHarness.emitted.at(-1), {
      event: EDITOR_SET_STATUS_SEGMENT_EVENT,
      data: { key: "boomerang", text: `${BOOMERANG_ICON}+∞`, align: "right", priority: -1 },
    });
  }
});

test("auto-boomerang fallback reload uses context reload instead of temporary editor submission", async () => {
  const { shortcuts, handlers, ctx, notifications, customMessages, getReloadCalls } =
    createBoomerangHarness();
  const shortcut = shortcuts.get("ctrl+alt+b");
  assert.ok(shortcut);

  await shortcut.handler(ctx);
  await startAutoBoomerangTask(handlers, ctx, "summarize through fallback");
  await finishAgentTurn(handlers, ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getReloadCalls(), 1);
  assert.equal(
    notifications.some((message) => message.includes("automatic /reload failed")),
    false,
  );
  assert.equal(customMessages.length, 1);
});

test("auto-boomerang shortcut uses command navigation when available", async () => {
  const {
    shortcuts,
    handlers,
    ctx,
    getNavigateTreeCalls,
    getBranchWithSummaryCalls,
    getReloadCalls,
  } = createBoomerangHarness({ commandCapable: true });
  const shortcut = shortcuts.get("ctrl+alt+b");
  assert.ok(shortcut);

  await shortcut.handler(ctx);
  await startAutoBoomerangTask(handlers, ctx, "summarize through navigateTree");
  await finishAgentTurn(handlers, ctx);

  assert.equal(getNavigateTreeCalls(), 1);
  assert.equal(getBranchWithSummaryCalls(), 0);
  assert.equal(getReloadCalls(), 0);
});

test("boomerang branch summary patch shows task in collapsed branch output", () => {
  initTheme("ayu-dark", false);
  installBoomerangBranchSummaryRendererPatch();
  const component = new BranchSummaryMessageComponent({
    type: "branch_summary",
    id: "summary-1",
    summary: "summary body",
    details: { task: "Improve boomerang editor integration" },
  } as never);

  assert.match(component.render(100).join("\n"), /Improve boomerang editor integration/);
});
