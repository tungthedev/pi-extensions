import assert from "node:assert/strict";
import test from "node:test";

import {
  isInteractiveAttachment,
  notifyStateChange,
  queueAgentOperation,
  waitForStateChange,
  waitForAnyStateChange,
} from "./live-attachment-utils.ts";

function createAttachment(transport: "rpc" | "interactive" = "rpc") {
  return {
    agentId: "agent-1",
    transport,
    stateWaiters: [] as Array<() => void>,
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
  };
}

test("isInteractiveAttachment narrows by transport", () => {
  assert.equal(isInteractiveAttachment(createAttachment("interactive") as never), true);
  assert.equal(isInteractiveAttachment(createAttachment("rpc") as never), false);
});

test("notifyStateChange resolves waiters registered by waitForStateChange", async () => {
  const attachment = createAttachment();
  const waiting = waitForStateChange(attachment as never, 1000);
  notifyStateChange(attachment as never);
  await waiting;
  assert.equal(attachment.stateWaiters.length, 0);
});

test("waitForAnyStateChange resolves true when any attachment changes", async () => {
  const first = createAttachment();
  const second = createAttachment();

  const waiting = waitForAnyStateChange([first as never, second as never], 1000);
  notifyStateChange(second as never);

  assert.equal(await waiting, true);
});

test("queueAgentOperation runs operations sequentially", async () => {
  const attachment = createAttachment();
  const events: string[] = [];

  const first = queueAgentOperation(attachment as never, async () => {
    events.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push("first:end");
    return "first";
  });

  const second = queueAgentOperation(attachment as never, async () => {
    events.push("second:start");
    events.push("second:end");
    return "second";
  });

  assert.equal(await first, "first");
  assert.equal(await second, "second");
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});
