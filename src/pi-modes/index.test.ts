import assert from "node:assert/strict";
import test from "node:test";

import { registerPiModesExtension } from "./index.js";

test("pi modes bundle does not synchronously register mode-specific tools", () => {
  const tools: string[] = [];

  registerPiModesExtension({
    appendEntry() {},
    events: { emit() {} },
    getAllTools: () => [],
    on() {},
    registerCommand() {},
    registerMessageRenderer() {},
    registerShortcut() {},
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    setActiveTools() {},
  } as never);

  assert.deepEqual(tools, []);
});

test("pi modes bundle lazily registers codex tools before agent start", async () => {
  const tools: string[] = [];
  const handlers = new Map<string, Function[]>();
  let activeTools: string[] = [];

  registerPiModesExtension({
    appendEntry() {},
    events: { emit() {} },
    getAllTools: () => tools.map((name) => ({ name, description: name })),
    on(event: string, handler: Function) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand() {},
    registerMessageRenderer() {},
    registerShortcut() {},
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    sendMessage() {},
    setActiveTools(names: string[]) {
      activeTools = names;
    },
  } as never);

  const ctx = {
    cwd: process.cwd(),
    model: { id: "gpt-test" },
    sessionManager: {
      getBranch: () => [
        { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
      ],
      getEntries: () => [],
      getLeafId: () => null,
      getSessionFile: () => "/tmp/pi-extensions-test-session.jsonl",
    },
  };

  for (const handler of handlers.get("before_agent_start") ?? []) {
    await handler({ systemPrompt: "base", systemPromptOptions: {} }, ctx);
  }

  assert.equal(tools.includes("list_dir"), true);
  assert.equal(tools.includes("apply_patch"), true);
  assert.equal(activeTools.includes("list_dir"), true);
  assert.equal(activeTools.includes("apply_patch"), true);
});
