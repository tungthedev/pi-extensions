import assert from "node:assert/strict";
import test from "node:test";

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
