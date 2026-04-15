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

function createAttachment(overrides: Partial<LiveChildAttachment> = {}): LiveChildAttachment {
  return {
    agentId: "agent-1",
    transport: "interactive",
    stateWaiters: [],
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
    surface: "surface",
    sessionFile: "/tmp/session.jsonl",
    abortController: new AbortController(),
    ...overrides,
  } as LiveChildAttachment;
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
    update_message: record.lastUpdateMessage,
  } as AgentSnapshot;
}

function createCoordinator() {
  const store = createSubagentRuntimeStore();
  const notifications: Array<{ snapshot: AgentSnapshot; taskSummary?: string }> = [];

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

  return { coordinator, notifications, store };
}

test("wait returns a running snapshot with the latest update_message", async () => {
  const { coordinator, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ status: "live_running" }));
  store.setLiveAttachment("agent-1", createAttachment());
  store.recordUpdate("agent-1", "first update");
  store.recordUpdate("agent-1", "latest update");

  const snapshots = await coordinator.waitForReadySnapshots(["agent-1"], { claim: true, timeoutMs: 1 });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.status, "running");
  assert.equal(snapshots[0]?.update_message, "latest update");
  assert.equal(store.getConsumedUpdateVersion("agent-1"), store.getUpdateVersion("agent-1"));
});

test("notification path does not replay an already-consumed update", () => {
  const { coordinator, notifications, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ status: "live_running" }));
  store.setLiveAttachment("agent-1", createAttachment());
  store.recordUpdate("agent-1", "still working");

  assert.equal(coordinator.claimReadySnapshot("agent-1")?.update_message, "still working");

  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);
  assert.equal(notifications.length, 0);
});

test("pending completion remains claimable after an update was consumed", () => {
  const { coordinator, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ status: "live_running" }));
  store.setLiveAttachment("agent-1", createAttachment());
  store.recordUpdate("agent-1", "still working");

  assert.equal(coordinator.claimReadySnapshot("agent-1")?.update_message, "still working");

  store.markCompleted("agent-1", { lastAssistantText: "done" });
  assert.equal(coordinator.claimReadySnapshot("agent-1")?.last_assistant_text, "done");
});

test("update/completion precedence is explicit and stable", () => {
  const { coordinator, notifications, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ lastAssistantText: "done" }));
  store.recordUpdate("agent-1", "stale update");

  const snapshot = coordinator.claimReadySnapshot("agent-1");
  assert.equal(snapshot?.status, "idle");
  assert.equal(snapshot?.last_assistant_text, "done");
  assert.equal(snapshot?.update_message, undefined);

  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);
  assert.equal(notifications.length, 0);
});

test("suppressed update notification flushes once after wait ends", () => {
  const { coordinator, notifications, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ status: "live_running", taskSummary: "audit" }));
  store.setLiveAttachment("agent-1", createAttachment());
  store.recordUpdate("agent-1", "still working");

  store.beginWait(["agent-1"]);
  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);
  assert.equal(notifications.length, 0);

  store.endWait(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.snapshot.status, "running");
  assert.equal(notifications[0]?.snapshot.update_message, "still working");
  assert.equal(notifications[0]?.taskSummary, "audit");
});

test("stale update is not surfaced after terminal transition", () => {
  const { coordinator, notifications, store } = createCoordinator();
  store.setDurableChild("agent-1", createRecord({ status: "live_running", taskSummary: "audit" }));
  store.setLiveAttachment("agent-1", createAttachment());
  store.recordUpdate("agent-1", "still working");

  store.beginWait(["agent-1"]);
  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);
  store.markCompleted("agent-1", { lastAssistantText: "done" });
  coordinator.notifyParentOfChildStatus(store.getDurableChild("agent-1")!);

  store.endWait(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.snapshot.status, "idle");
  assert.equal(notifications[0]?.snapshot.last_assistant_text, "done");
  assert.equal(notifications[0]?.snapshot.update_message, undefined);
});
