import assert from "node:assert/strict";
import test from "node:test";

import { createSubagentRuntimeStore } from "./runtime-store.ts";
import type { DurableChildRecord } from "./types.ts";

function createRecord(overrides: Partial<DurableChildRecord> = {}): DurableChildRecord {
  return {
    agentId: "agent-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_running",
    createdAt: "2026-04-14T00:00:00.000Z",
    updatedAt: "2026-04-14T00:00:00.000Z",
    ...overrides,
  };
}

test("recordUpdate keeps only the latest unconsumed update per agent", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("agent-1", createRecord());

  store.recordUpdate("agent-1", "first update");
  store.recordUpdate("agent-1", "latest update");

  assert.deepEqual(store.updateState("agent-1"), {
    message: "latest update",
    version: 2,
    consumedVersion: 0,
    suppressedVersion: undefined,
  });
});

test("consuming an update does not consume terminal completion", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("agent-1", createRecord());

  store.recordUpdate("agent-1", "still working");
  store.setConsumedUpdateVersion("agent-1", store.getUpdateVersion("agent-1"));
  store.markCompleted("agent-1", { lastAssistantText: "done" });

  assert.equal(store.getConsumedUpdateVersion("agent-1"), 1);
  assert.equal(store.getCompletionVersion("agent-1"), 1);
  assert.equal(store.getConsumedCompletionVersion("agent-1"), 0);
});

test("recordUpdate versions repeated identical messages as new arrivals", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("agent-1", createRecord());

  store.recordUpdate("agent-1", "same message");
  store.setConsumedUpdateVersion("agent-1", store.getUpdateVersion("agent-1"));
  store.recordUpdate("agent-1", "same message");

  assert.deepEqual(store.updateState("agent-1"), {
    message: "same message",
    version: 2,
    consumedVersion: 1,
    suppressedVersion: undefined,
  });
});

test("markRunning preserves update tracking while terminal transitions clear it", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("agent-1", createRecord());

  store.recordUpdate("agent-1", "still working");
  store.setSuppressedUpdateVersion("agent-1", store.getUpdateVersion("agent-1"));
  store.markRunning("agent-1", { updatedAt: "2026-04-14T00:01:00.000Z" });

  assert.deepEqual(store.updateState("agent-1"), {
    message: "still working",
    version: 1,
    consumedVersion: 0,
    suppressedVersion: 1,
  });

  store.markCompleted("agent-1", {
    status: "live_idle",
    updatedAt: "2026-04-14T00:02:00.000Z",
    lastAssistantText: "done",
  });
  assert.deepEqual(store.updateState("agent-1"), {
    message: undefined,
    version: 1,
    consumedVersion: 1,
    suppressedVersion: undefined,
  });

  store.markRunning("agent-1", { status: "live_running", updatedAt: "2026-04-14T00:03:00.000Z" });
  store.recordUpdate("agent-1", "retrying");
  store.markFailed("agent-1", { updatedAt: "2026-04-14T00:04:00.000Z", lastError: "boom" });
  assert.deepEqual(store.updateState("agent-1"), {
    message: undefined,
    version: 2,
    consumedVersion: 2,
    suppressedVersion: undefined,
  });

  store.markRunning("agent-1", { status: "live_running", updatedAt: "2026-04-14T00:05:00.000Z" });
  store.recordUpdate("agent-1", "closing soon");
  store.markClosed("agent-1", { updatedAt: "2026-04-14T00:06:00.000Z", closedAt: "2026-04-14T00:06:00.000Z" });
  assert.deepEqual(store.updateState("agent-1"), {
    message: undefined,
    version: 3,
    consumedVersion: 3,
    suppressedVersion: undefined,
  });
});

test("runtime store resolves task paths and permits duplicate names under different parents", () => {
  const store = createSubagentRuntimeStore();
  const firstReviewer = createRecord({
    agentId: "reviewer-a",
    name: "reviewer",
    taskPath: "/root/researcher/reviewer",
    parentTaskPath: "/root/researcher",
  });
  const secondReviewer = createRecord({
    agentId: "reviewer-b",
    name: "reviewer",
    taskPath: "/root/auditor/reviewer",
    parentTaskPath: "/root/auditor",
  });

  store.setDurableChild(firstReviewer.agentId, firstReviewer);
  store.setDurableChild(secondReviewer.agentId, secondReviewer);

  assert.equal(store.findChildByTaskPath("/root/researcher/reviewer")?.agentId, "reviewer-a");
  assert.equal(store.findChildByTaskPath("/root/auditor/reviewer")?.agentId, "reviewer-b");
  assert.equal(store.findChildByTarget("reviewer", "/root/researcher")?.agentId, "reviewer-a");
  assert.equal(store.findChildByTarget("reviewer", "/root/auditor")?.agentId, "reviewer-b");
});

test("runtime store lists children and descendants by task path", () => {
  const store = createSubagentRuntimeStore();
  for (const record of [
    createRecord({ agentId: "parent", name: "researcher", taskPath: "/root/researcher", parentTaskPath: "/root" }),
    createRecord({ agentId: "child", name: "reviewer", taskPath: "/root/researcher/reviewer", parentTaskPath: "/root/researcher" }),
    createRecord({ agentId: "grandchild", name: "auditor", taskPath: "/root/researcher/reviewer/auditor", parentTaskPath: "/root/researcher/reviewer" }),
    createRecord({ agentId: "sibling", name: "writer", taskPath: "/root/writer", parentTaskPath: "/root" }),
  ]) {
    store.setDurableChild(record.agentId, record);
  }

  assert.deepEqual(
    store.listChildrenByParentTaskPath("/root/researcher").map((record) => record.agentId),
    ["child"],
  );
  assert.deepEqual(
    store.listDescendantsByTaskPath("/root/researcher").map((record) => record.agentId),
    ["child", "grandchild"],
  );
});
