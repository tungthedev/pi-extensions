import assert from "node:assert/strict";
import test from "node:test";

import { createSubagentLifecycleService } from "./lifecycle-service.ts";
import { SUBAGENT_ENTRY_TYPES } from "./types.ts";
import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";

function createBaseDeps(overrides: Partial<Parameters<typeof createSubagentLifecycleService>[0]> = {}) {
  const records = new Map<string, DurableChildRecord>();
  const attachment: LiveChildAttachment = {
    agentId: "agent-1",
    transport: "rpc",
    stateWaiters: [],
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
    process: {} as never,
    stdoutBuffer: "",
    stdoutDecoder: {} as never,
    stderr: "",
    nextCommandId: 1,
    pendingResponses: new Map(),
  };

  records.set("agent-1", {
    agentId: "agent-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    attachment,
    records,
    deps: {
      resolveParentSpawnDefaults: () => ({}),
      normalizeReasoningEffortToThinkingLevel: () => undefined,
      resolveForkContextSessionFile: () => "/tmp/fork.jsonl",
      resolveName: () => "worker",
      attachChild: async () => ({ attachment: attachment as never, record: records.get("agent-1")! }),
      launchInteractiveChild: async () => ({ attachment, record: records.get("agent-1")! }),
      watchInteractiveAttachment() {},
      sendPromptToAttachment: async () => records.get("agent-1")!,
      ensureLiveAttachment: async () => attachment,
      requireDurableChild: (agentId: string) => {
        const record = records.get(agentId);
        if (!record) throw new Error(`missing ${agentId}`);
        return record;
      },
      updateDurableChild: (agentId: string, patch: Partial<DurableChildRecord>) => {
        const next = { ...records.get(agentId)!, ...patch, updatedAt: new Date().toISOString() };
        records.set(agentId, next);
        return next;
      },
      childSnapshot: (record: DurableChildRecord): AgentSnapshot => ({
        agent_id: record.agentId,
        durable_status: record.status,
        status:
          record.status === "live_running"
            ? "running"
            : record.status === "live_idle"
              ? "idle"
              : record.status,
        cwd: record.cwd,
        ...(record.name ? { name: record.name } : {}),
        ...(record.lastAssistantText ? { last_assistant_text: record.lastAssistantText } : {}),
        ...(record.lastError ? { last_error: record.lastError } : {}),
      }),
      queueAgentOperation: async <T>(_attachment: LiveChildAttachment, operation: () => Promise<T>) => await operation(),
      isInteractiveAttachment: (candidate: LiveChildAttachment) => candidate.transport === "interactive",
      sendInteractiveInput() {},
      sendAttachmentMessage: async () => "submission-1",
      closeLiveAttachment: async () => undefined,
      waitForReadySnapshots: async () => [],
      incrementActiveWaits() {},
      decrementActiveWaits() {},
      flushSuppressedNotifications() {},
      markActivitySubmitted() {},
      markActivityRunning() {},
      persistRegistryEvent() {},
      entryTypes: SUBAGENT_ENTRY_TYPES,
      isMuxAvailable: () => true,
      muxUnavailableError: () => new Error("mux unavailable"),
      ...overrides,
    },
  };
}

test("lifecycle service uses shared resume semantics for codex and task adapters", async () => {
  const sentCommands: string[] = [];
  const { deps } = createBaseDeps({
    sendAttachmentMessage: async (_attachment, _input, commandType) => {
      sentCommands.push(commandType);
      return "submission-1";
    },
  });
  const service = createSubagentLifecycleService(deps);

  await service.resume({ mode: "codex", agentId: "agent-1", input: "do work", interrupt: true });
  await service.resume({ mode: "task", agentId: "agent-1", input: "resume task" });

  assert.deepEqual(sentCommands, ["steer", "follow_up"]);
});

test("lifecycle service spawn failure persists cleanup semantics", async () => {
  const persisted: string[] = [];
  let closed = 0;
  const { deps } = createBaseDeps({
    sendPromptToAttachment: async () => {
      throw new Error("boom");
    },
    persistRegistryEvent: (eventType) => {
      persisted.push(eventType);
    },
    closeLiveAttachment: async () => {
      closed += 1;
    },
  });
  const service = createSubagentLifecycleService(deps);

  await assert.rejects(
    service.spawn({
      mode: "task",
      ctx: {
        cwd: "/tmp/project",
        sessionManager: { getEntries: () => [], getLeafId: () => null, getSessionFile: () => "/tmp/session.jsonl" },
      } as never,
      prompt: "run",
      runInBackground: true,
      displayNameHint: "worker",
      nameSeed: "seed",
    }),
    /boom/,
  );

  assert.deepEqual(persisted, ["subagent:create", "subagent:close"]);
  assert.equal(closed, 1);
});

test("lifecycle service wait and stop share active wait and close behavior", async () => {
  let increments = 0;
  let decrements = 0;
  let flushed = 0;
  let closed = 0;
  const { deps, records } = createBaseDeps({
    waitForReadySnapshots: async () => [
      {
        agent_id: "agent-1",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
      },
    ],
    incrementActiveWaits: () => {
      increments += 1;
    },
    decrementActiveWaits: () => {
      decrements += 1;
    },
    flushSuppressedNotifications: () => {
      flushed += 1;
    },
    closeLiveAttachment: async () => {
      closed += 1;
    },
  });
  const service = createSubagentLifecycleService(deps);

  const waited = await service.wait({ ids: ["agent-1"], timeoutMs: 45_000 });
  records.set("agent-1", { ...records.get("agent-1")!, status: "live_idle" });
  const stopped = await service.stop("agent-1");

  assert.equal(waited.timedOut, false);
  assert.equal(waited.snapshots[0]?.status, "idle");
  assert.equal(stopped.snapshot.status, "closed");
  assert.equal(increments, 1);
  assert.equal(decrements, 1);
  assert.equal(flushed, 1);
  assert.equal(closed, 1);
});
