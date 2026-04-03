import assert from "node:assert/strict";
import test from "node:test";

import registerShellExtension, { syncCustomShellTools } from "./index.ts";

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
  assert.equal(handlers.has("session_switch"), true);
  assert.equal(handlers.has("before_agent_start"), true);
});

test("syncCustomShellTools replaces builtin bash with shell when enabled", () => {
  assert.deepEqual(
    syncCustomShellTools(["read", "bash", "write"], ["read", "bash", "shell", "write"], true),
    ["read", "write", "shell"],
  );
});

test("syncCustomShellTools restores builtin bash when disabled", () => {
  assert.deepEqual(
    syncCustomShellTools(["read", "shell", "write"], ["read", "bash", "shell", "write"], false),
    ["read", "write", "bash"],
  );
});
