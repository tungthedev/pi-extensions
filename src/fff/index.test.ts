import assert from "node:assert/strict";
import test from "node:test";

import registerFffLifecycleExtension from "./index.js";
import {
  getSessionFffRuntimeCount,
  resetSessionFffRuntimesForTests,
} from "./session-runtime.js";

test.afterEach(() => {
  resetSessionFffRuntimesForTests();
});

test("fff lifecycle does not create or warm a runtime during startup hooks", async () => {
  const handlers = new Map<string, Function>();

  registerFffLifecycleExtension({
    registerCommand() {},
    registerMessageRenderer() {},
    on(event: string, handler: Function) {
      handlers.set(event, handler);
    },
    sendMessage() {},
  } as never);

  const ctx = {
    cwd: process.cwd(),
    sessionManager: {
      getSessionFile: () => "/tmp/pi-extensions-test-session.jsonl",
    },
  };

  await handlers.get("session_start")?.({ reason: "startup" }, ctx);
  await handlers.get("before_agent_start")?.({}, ctx);

  assert.equal(getSessionFffRuntimeCount(), 0);
});
