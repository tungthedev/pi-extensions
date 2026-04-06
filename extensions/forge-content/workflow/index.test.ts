import assert from "node:assert/strict";
import test from "node:test";

import { registerForgeWorkflow } from "./index.ts";

test("registerForgeWorkflow registers shared Forge todo aliases", () => {
  const toolNames: string[] = [];

  registerForgeWorkflow({
    on() {},
    registerTool(tool: { name: string }) {
      toolNames.push(tool.name);
    },
  } as never);

  assert.deepEqual(toolNames.sort(), ["todos_read", "todos_write"]);
});
