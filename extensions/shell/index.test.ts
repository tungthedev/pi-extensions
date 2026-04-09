import assert from "node:assert/strict";
import test from "node:test";

import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";
import registerShellExtension from "./index.ts";

test("shell extension registers only the shared shell tool and lifecycle hooks", () => {
  const registeredTools: string[] = [];
  const handlers = new Map<string, Function[]>();

  registerShellExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition: { name: string }) {
      registeredTools.push(definition.name);
    },
  } as never);

  assert.deepEqual(registeredTools, ["shell"]);
  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);
});

test("shared resolver keeps bash in Pi mode and shell in Codex or Forge mode", () => {
  const toolInfos = resolveRegisteredToolInfos([
    { name: "read", description: "builtin" },
    { name: "write", description: "builtin" },
    { name: "bash", description: "builtin bash" },
    { name: "shell", description: "compat shell" },
    { name: "Task", description: "task" },
    { name: "TaskOutput", description: "task" },
    { name: "TaskStop", description: "task" },
  ]);

  assert.deepEqual(resolveToolsetToolNames("pi", toolInfos), ["read", "write", "bash", "Task", "TaskOutput", "TaskStop"]);
  assert.deepEqual(resolveToolsetToolNames("codex", toolInfos), ["shell"]);
  assert.deepEqual(resolveToolsetToolNames("forge", toolInfos), ["write", "shell", "Task", "TaskOutput", "TaskStop"]);
  assert.deepEqual(resolveToolsetToolNames("droid", toolInfos), ["Task", "TaskOutput", "TaskStop"]);
});
