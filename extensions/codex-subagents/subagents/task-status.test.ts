import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompletionSignature,
  normalizeRecoveredTaskStatus,
  resolveTaskFacingStatus,
  shouldNotifyForTaskStatus,
  shouldWaitForTaskCompletion,
} from "./task-status.ts";

test("resolveTaskFacingStatus keeps running while durable status is live_idle but task status is running", () => {
  assert.equal(resolveTaskFacingStatus({ status: "live_idle", taskStatus: "running" }), "running");
});

test("shouldWaitForTaskCompletion does not treat live_idle/running as ready", () => {
  assert.equal(
    shouldWaitForTaskCompletion({ status: "live_idle", taskStatus: "running" }, true),
    true,
  );
  assert.equal(
    shouldWaitForTaskCompletion({ status: "live_idle", taskStatus: "running" }, false),
    false,
  );
});

test("shouldNotifyForTaskStatus only notifies on task-facing idle or failed states", () => {
  assert.equal(shouldNotifyForTaskStatus({ status: "live_idle", taskStatus: "running" }), false);
  assert.equal(shouldNotifyForTaskStatus({ status: "live_idle", taskStatus: "idle" }), true);
  assert.equal(shouldNotifyForTaskStatus({ status: "failed", taskStatus: "failed" }), true);
});

test("normalizeRecoveredTaskStatus closes previously live task states after session restore", () => {
  assert.equal(normalizeRecoveredTaskStatus("closed", "running"), "closed");
  assert.equal(normalizeRecoveredTaskStatus("closed", "idle"), "closed");
  assert.equal(normalizeRecoveredTaskStatus("failed", "running"), "failed");
  assert.equal(normalizeRecoveredTaskStatus("detached", "running"), "detached");
});

test("buildCompletionSignature changes when task-facing completion signals change", () => {
  const before = buildCompletionSignature({
    status: "live_idle",
    taskStatus: "running",
    lastError: undefined,
    lastAssistantText: "draft",
    finalResultText: undefined,
  });
  const after = buildCompletionSignature({
    status: "live_idle",
    taskStatus: "idle",
    lastError: undefined,
    lastAssistantText: "draft",
    finalResultText: "final",
  });

  assert.notEqual(before, after);
});
