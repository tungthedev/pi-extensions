import assert from "node:assert/strict";
import test from "node:test";

import { registerShellExtension } from "./index.js";

test("shell extension registers only shell-owned behavior", () => {
  const tools: string[] = [];
  const events: string[] = [];
  let setActiveToolsCalls = 0;

  registerShellExtension({
    on(event: string) {
      events.push(event);
    },
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    setActiveTools() {
      setActiveToolsCalls += 1;
    },
  } as never);

  assert.deepEqual(tools, ["shell"]);
  assert.deepEqual(events, []);
  assert.equal(setActiveToolsCalls, 0);
});
