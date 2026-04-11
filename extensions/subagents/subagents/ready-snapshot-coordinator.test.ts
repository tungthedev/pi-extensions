import assert from "node:assert/strict";
import test from "node:test";

import { createReadySnapshotCoordinator } from "./ready-snapshot-coordinator.ts";
import { createSubagentRuntimeStore } from "./runtime-store.ts";
import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";

function createRecord(overrides: Partial<DurableChildRecord> = {}): DurableChildRecord {
  return {
    agentId: "agent-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_idle",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function createSnapshot(record: DurableChildRecord, attachment?: LiveChildAttachment): AgentSnapshot {
  return {
    agent_id: record.agentId,
    transport: attachment?.transport ?? record.transport,
    durable_status: record.status,
    status: record.status === "live_running" ? "running" : record.status === "live_idle" ? "idle" : record.status,
    cwd: record.cwd,
    last_assistant_text: record.lastAssistantText,
    last_error: record.lastError,
  } as AgentSnapshot;
}

test("claimReadySnapshot only returns a completion once per completion version", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("agent-1", createRecord({ lastAssistantText: "done" }));

  const coordinator = createReadySnapshotCoordinator({
    store,
    childSnapshot: createSnapshot,
    requireDurableChild: (agentId) => {
      const record = store.getDurableChild(agentId);
      if (!record) throw new Error(`Unknown agent_id: ${agentId}`);
      return record;
    },
    waitForAnyStateChange: async () => false,
    maxWaitTimeoutMs: 90_000,
    sendNotification() {},
  });

  assert.equal(coordinator.claimReadySnapshot("agent-1")?.agent_id, "agent-1");
  assert.equal(coordinator.claimReadySnapshot("agent-1"), undefined);

  store.setDurableChild(
    "agent-1",
    createRecord({ updatedAt: "2026-04-10T00:01:00.000Z", lastAssistantText: "done again" }),
  );
  assert.equal(coordinator.claimReadySnapshot("agent-1")?.last_assistant_text, "done again");
});

test("notifyParentOfChildStatus suppresses notifications during waits and flushes them later", () => {
  const store = createSubagentRuntimeStore();
  const notifications: Array<{ snapshot: AgentSnapshot; taskSummary?: string }> = [];
  store.setDurableChild("agent-1", createRecord({ lastAssistantText: "done", taskSummary: "audit" }));

  const coordinator = createReadySnapshotCoordinator({
    store,
    childSnapshot: createSnapshot,
    requireDurableChild: (agentId) => {
      const record = store.getDurableChild(agentId);
      if (!record) throw new Error(`Unknown agent_id: ${agentId}`);
      return record;
    },
    waitForAnyStateChange: async () => false,
    maxWaitTimeoutMs: 90_000,
    sendNotification(snapshot, taskSummary) {
      notifications.push({ snapshot, taskSummary });
    },
  });

  store.beginWait(["agent-1"]);
  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);
  assert.equal(notifications.length, 0);

  store.endWait(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.snapshot.agent_id, "agent-1");
  assert.equal(notifications[0]?.taskSummary, "audit");
});
