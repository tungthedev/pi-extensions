import assert from "node:assert/strict";
import test from "node:test";

import { registerCodexWorkflowTools } from "./index.ts";

test("registerCodexWorkflowTools registers shared todo aliases and request_user_input", () => {
  const toolNames: string[] = [];

  registerCodexWorkflowTools({
    on() {},
    registerTool(tool: { name: string }) {
      toolNames.push(tool.name);
    },
  } as never);

  assert.deepEqual(toolNames.sort(), ["read_plan", "request_user_input", "update_plan"]);
});
