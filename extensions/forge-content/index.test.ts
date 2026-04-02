import assert from "node:assert/strict";
import test from "node:test";

import registerForgeContentExtension from "./index.ts";

test("forge-content no longer registers inner mode commands", async () => {
  const commands: string[] = [];
  const handlers = new Map<string, Function[]>();

  registerForgeContentExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool() {},
    registerCommand(name: string) {
      commands.push(name);
    },
    setActiveTools() {},
  } as never);

  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);
  assert.equal(commands.includes("forge"), false);
  assert.equal(commands.includes("sage"), false);
  assert.equal(commands.includes("muse"), false);
  assert.equal(commands.includes("forge-mode"), false);
});
