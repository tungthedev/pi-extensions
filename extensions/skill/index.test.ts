import assert from "node:assert/strict";
import test from "node:test";

import registerSkillExtension from "./index.ts";

const AVAILABLE_TOOLS = [
  { name: "read", description: "custom read" },
  { name: "grep", description: "builtin grep" },
  { name: "find", description: "builtin find" },
  { name: "ls", description: "builtin ls" },
  { name: "edit", description: "builtin edit" },
  { name: "write", description: "builtin write" },
  { name: "bash", description: "builtin bash" },
  { name: "shell", description: "compat shell" },
  { name: "WebSearch", description: "web search" },
  { name: "WebSummary", description: "web summary" },
  { name: "FetchUrl", description: "fetch" },
  { name: "skill", description: "skill" },
  { name: "Task", description: "task" },
  { name: "TaskOutput", description: "task" },
  { name: "TaskStop", description: "task" },
];

test("skill extension registers the global skill tool and shared mode handlers", async () => {
  const handlers = new Map<string, Function[]>();
  const tools: string[] = [];
  let activeTools: string[] | undefined;

  registerSkillExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition: { name: string }) {
      tools.push(definition.name);
    },
    getAllTools() {
      return AVAILABLE_TOOLS;
    },
    setActiveTools(value: string[]) {
      activeTools = value;
    },
  } as never);

  assert.deepEqual(tools, ["skill"]);
  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);

  const sessionStartHandlers = handlers.get("session_start") ?? [];
  const ctx = {
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "pi" } }];
      },
    },
  };

  for (const handler of sessionStartHandlers) {
    await handler(undefined, ctx as never);
  }

  assert.deepEqual(activeTools, [
    "read",
    "grep",
    "find",
    "ls",
    "edit",
    "write",
    "bash",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "skill",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});
