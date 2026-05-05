import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChildTaskPath,
  normalizeTaskPath,
  resolveTaskTarget,
  validateAgentTarget,
  validateTaskSegment,
} from "./task-paths.ts";

test("resolveTaskTarget accepts canonical and relative targets", () => {
  assert.equal(buildChildTaskPath("/root/researcher", "reviewer"), "/root/researcher/reviewer");

  const records = [
    { agentId: "a", name: "researcher", taskPath: "/root/researcher" },
    { agentId: "b", name: "reviewer", taskPath: "/root/researcher/reviewer" },
  ];

  assert.equal(resolveTaskTarget(records, "/root", "researcher")?.agentId, "a");
  assert.equal(resolveTaskTarget(records, "/root/researcher", "reviewer")?.agentId, "b");
  assert.equal(resolveTaskTarget(records, "/root", "/root/researcher/reviewer")?.agentId, "b");
});

test("resolveTaskTarget falls back to legacy public names for records without paths", () => {
  const records = [
    { agentId: "legacy", name: "reviewer" },
  ];

  assert.equal(resolveTaskTarget(records, "/root/researcher", "reviewer")?.agentId, "legacy");
});

test("task path validation rejects invalid paths and segments", () => {
  assert.equal(normalizeTaskPath("/root/researcher/"), "/root/researcher");
  assert.equal(validateTaskSegment("worker-1"), "worker-1");
  assert.equal(validateAgentTarget("/root/researcher/reviewer"), "/root/researcher/reviewer");

  assert.throws(() => normalizeTaskPath("/other"), /task path must be/);
  assert.throws(() => validateTaskSegment("BadName"), /lowercase letters/);
  assert.throws(() => validateAgentTarget("has space"), /lowercase letters/);
});
