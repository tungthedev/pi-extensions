import assert from "node:assert/strict";
import test from "node:test";

import { createAttachmentRegistry } from "./attachment-registry.ts";
import { createCompletionTracker } from "./completion-tracker.ts";

test("createAttachmentRegistry stores durable records and live attachments independently", () => {
  const registry = createAttachmentRegistry();
  const record = {
    agentId: "agent-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_running",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  };
  const attachment = { agentId: "agent-1", transport: "rpc" };

  registry.setDurable("agent-1", record as never);
  registry.setLive("agent-1", attachment as never);

  assert.deepEqual(registry.getDurable("agent-1"), record);
  assert.equal(registry.getLive("agent-1"), attachment);
  assert.deepEqual(registry.listLive(), [attachment]);
});

test("createCompletionTracker increments completion version once per unique terminal signature", () => {
  const tracker = createCompletionTracker();
  const record = {
    agentId: "agent-1",
    status: "live_idle",
    lastAssistantText: "done",
  };

  tracker.recordTerminal("agent-1", record as never);
  tracker.recordTerminal("agent-1", record as never);

  assert.equal(tracker.get("agent-1").version, 1);
});

test("createCompletionTracker preserves active waits until the waiter clears them", () => {
  const tracker = createCompletionTracker();
  tracker.beginWait(["agent-1"]);
  tracker.recordTerminal("agent-1", {
    agentId: "agent-1",
    status: "closed",
  } as never);

  assert.equal(tracker.get("agent-1").activeWaitCount, 1);

  tracker.endWait(["agent-1"]);
  assert.equal(tracker.get("agent-1").activeWaitCount, 0);
});
