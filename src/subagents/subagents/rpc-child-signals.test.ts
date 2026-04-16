import assert from "node:assert/strict";
import { StringDecoder } from "node:string_decoder";
import test from "node:test";

import {
  buildDurablePatchFromGetState,
  ingestCallerUpdate,
} from "./index.ts";
import { createReadySnapshotCoordinator } from "./ready-snapshot-coordinator.ts";
import { childSnapshot } from "./registry.ts";
import { handleRpcMessage } from "./rpc.ts";
import { createSubagentRuntimeStore } from "./runtime-store.ts";
import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment, RpcLiveChildAttachment } from "./types.ts";

function createRecord(agentId: string, overrides: Partial<DurableChildRecord> = {}): DurableChildRecord {
  return {
    agentId,
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_running",
    createdAt: "2026-04-14T00:00:00.000Z",
    updatedAt: "2026-04-14T00:00:00.000Z",
    ...overrides,
  };
}

function createAttachment(agentId: string): RpcLiveChildAttachment {
  return {
    agentId,
    transport: "rpc",
    stateWaiters: [],
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
    process: {} as RpcLiveChildAttachment["process"],
    stdoutBuffer: "",
    stdoutDecoder: new StringDecoder("utf8"),
    stderr: "",
    nextCommandId: 1,
    pendingResponses: new Map(),
  };
}

function createHarness() {
  const store = createSubagentRuntimeStore();
  const notifications: Array<{ snapshot: AgentSnapshot; taskSummary?: string }> = [];
  const coordinator = createReadySnapshotCoordinator({
    store,
    childSnapshot,
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

  const updateDurableChild = (
    agentId: string,
    patch: Partial<DurableChildRecord>,
  ): DurableChildRecord => {
    const current = store.getDurableChild(agentId);
    if (!current) {
      throw new Error(`Unknown agent_id: ${agentId}`);
    }

    const next =
      patch.status === "live_running"
        ? store.markRunning(agentId, patch)
        : patch.status === "live_idle"
          ? store.markCompleted(agentId, patch)
          : patch.status === "failed"
            ? store.markFailed(agentId, patch)
            : patch.status === "closed"
              ? store.markClosed(agentId, patch)
              : (() => {
                  const updated: DurableChildRecord = {
                    ...current,
                    ...patch,
                    updatedAt: patch.updatedAt ?? "2026-04-14T00:00:01.000Z",
                  };
                  store.setDurableChild(agentId, updated);
                  return updated;
                })();

    if (!next) {
      throw new Error(`Failed to update durable child ${agentId}`);
    }

    return next;
  };

  return {
    coordinator,
    notifications,
    store,
    updateDurableChild,
    notifyParentOfChildStatus(record: DurableChildRecord) {
      coordinator.notifyParentOfChildStatus(record);
    },
  };
}

test("handleRpcMessage ingests caller_update on the correct child without resolving pending responses", () => {
  const { notifyParentOfChildStatus, store, updateDurableChild } = createHarness();
  const attachment = createAttachment("agent-1");
  const otherAttachment = createAttachment("agent-2");
  let resolved = 0;
  let rejected = 0;

  attachment.pendingResponses.set("agent-1:1", {
    resolve() {
      resolved += 1;
    },
    reject() {
      rejected += 1;
    },
  });

  store.setDurableChild("agent-1", createRecord("agent-1"));
  store.setDurableChild("agent-2", createRecord("agent-2"));
  store.setLiveAttachment("agent-1", attachment);
  store.setLiveAttachment("agent-2", otherAttachment as LiveChildAttachment);

  handleRpcMessage({
    rawMessage: JSON.stringify({ type: "caller_update", message: "still working" }),
    attachment,
    onParseError(error) {
      throw error;
    },
    onCallerUpdate(message) {
      ingestCallerUpdate({
        agentId: attachment.agentId,
        message,
        store,
        updateDurableChild,
        notifyParentOfChildStatus,
      });
    },
    onUnsolicitedMessage() {
      assert.fail("caller_update should not fall through to unsolicited event handling");
    },
  });

  assert.equal(resolved, 0);
  assert.equal(rejected, 0);
  assert.equal(attachment.pendingResponses.size, 1);
  assert.equal(store.getDurableChild("agent-1")?.lastUpdateMessage, "still working");
  assert.equal(store.getDurableChild("agent-2")?.lastUpdateMessage, undefined);
  assert.equal(store.getDurableChild("agent-1")?.status, "live_running");
  assert.equal(store.getLiveAttachment("agent-1"), attachment);
});

test("repeated rpc caller_update events coalesce through the shared coordinator path", () => {
  const { coordinator, notifications, notifyParentOfChildStatus, store, updateDurableChild } = createHarness();
  const attachment = createAttachment("agent-1");

  store.setDurableChild("agent-1", createRecord("agent-1", { taskSummary: "audit" }));
  store.setLiveAttachment("agent-1", attachment);
  store.beginWait(["agent-1"]);

  for (const message of ["first update", "latest update"]) {
    handleRpcMessage({
      rawMessage: JSON.stringify({ type: "caller_update", message }),
      attachment,
      onParseError(error) {
        throw error;
      },
      onCallerUpdate(updateMessage) {
        ingestCallerUpdate({
          agentId: attachment.agentId,
          message: updateMessage,
          store,
          updateDurableChild,
          notifyParentOfChildStatus,
        });
      },
      onUnsolicitedMessage() {
        assert.fail("caller_update should not fall through to unsolicited event handling");
      },
    });
  }

  assert.equal(notifications.length, 0);
  assert.equal(store.getDurableChild("agent-1")?.lastUpdateMessage, "latest update");
  assert.equal(store.getConsumedUpdateVersion("agent-1"), 0);
  assert.equal(store.getLiveAttachment("agent-1"), attachment);

  store.endWait(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);
  coordinator.flushSuppressedNotifications(["agent-1"]);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.snapshot.status, "running");
  assert.equal(notifications[0]?.snapshot.update_message, "latest update");
  assert.equal(notifications[0]?.taskSummary, "audit");
  assert.equal(store.getDurableChild("agent-1")?.status, "live_running");
});

test("get_state refresh patch preserves a fresh caller_update on running children", () => {
  const { coordinator, notifyParentOfChildStatus, store, updateDurableChild } = createHarness();
  const attachment = createAttachment("agent-1");

  store.setDurableChild("agent-1", createRecord("agent-1"));
  store.setLiveAttachment("agent-1", attachment);
  store.beginWait(["agent-1"]);

  ingestCallerUpdate({
    agentId: "agent-1",
    message: "still working",
    store,
    updateDurableChild,
    notifyParentOfChildStatus,
  });

  updateDurableChild("agent-1", buildDurablePatchFromGetState({
    isStreaming: true,
    sessionId: "session-1",
    sessionFile: "/tmp/agent-1.jsonl",
  }));

  assert.equal(store.getDurableChild("agent-1")?.lastUpdateMessage, "still working");
  assert.equal(coordinator.claimReadySnapshot("agent-1")?.update_message, "still working");
  assert.equal(store.getDurableChild("agent-1")?.sessionId, "session-1");
  assert.equal(store.getDurableChild("agent-1")?.sessionFile, "/tmp/agent-1.jsonl");
});
