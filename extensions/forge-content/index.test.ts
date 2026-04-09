import assert from "node:assert/strict";
import test from "node:test";

import registerForgeContentExtension from "./index.ts";

const AVAILABLE_TOOLS = [
  { name: "write", description: "builtin write" },
  { name: "shell", description: "compat shell" },
  { name: "read_file", description: "compat read" },
  { name: "WebSearch", description: "web search" },
  { name: "FetchUrl", description: "fetch" },
  { name: "fs_search", description: "forge" },
  { name: "patch", description: "forge" },
  { name: "followup", description: "forge" },
  { name: "todos_write", description: "forge" },
  { name: "todos_read", description: "forge" },
  { name: "Task", description: "task" },
  { name: "TaskOutput", description: "task" },
  { name: "TaskStop", description: "task" },
];

test("forge-content registers shared mode handlers without inner mode commands", async () => {
  const commands: string[] = [];
  const tools: string[] = [];
  const handlers = new Map<string, Function[]>();
  let activeTools: string[] | undefined;

  registerForgeContentExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition: { name: string }) {
      tools.push(definition.name);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    getAllTools() {
      return AVAILABLE_TOOLS;
    },
    setActiveTools(value: string[]) {
      activeTools = value;
    },
  } as never);

  const sessionStartHandlers = handlers.get("session_start") ?? [];
  assert.notEqual(sessionStartHandlers.length, 0);

  const ctx = {
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "forge" } }];
      },
    },
    ui: {
      setStatus() {},
      setWidget() {},
    },
  };

  for (const handler of sessionStartHandlers) {
    await handler(undefined, ctx as never);
  }

  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);
  assert.equal(commands.includes("forge"), false);
  assert.equal(commands.includes("sage"), false);
  assert.equal(commands.includes("muse"), false);
  assert.equal(commands.includes("forge-mode"), false);
  assert.equal(tools.includes("shell"), false);
  assert.deepEqual(activeTools, [
    "write",
    "shell",
    "read_file",
    "WebSearch",
    "FetchUrl",
    "fs_search",
    "patch",
    "followup",
    "todos_write",
    "todos_read",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});
