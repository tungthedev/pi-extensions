import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSubagentLifecycleService } from "./lifecycle-service.ts";
import { SUBAGENT_ENTRY_TYPES } from "./types.ts";
import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";

function withTempHome(testBody: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-lifecycle-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  const finish = () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(root, { recursive: true, force: true });
  };

  return Promise.resolve()
    .then(() => testBody(root))
    .finally(finish);
}

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
      findAddressableChildByName: (name: string) =>
        [...records.values()].find((record) => record.name === name),
      attachChild: async () => ({ attachment: attachment as never, record: records.get("agent-1")! }),
      launchInteractiveChild: async () => ({ attachment, record: records.get("agent-1")! }),
      watchInteractiveAttachment() {},
      sendPromptToAttachment: async () => records.get("agent-1")!,
      ensureLiveAttachment: async () => ({ attachment }),
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
      listWaitableChildIds: () => ["agent-1"],
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
      name: "worker",
      prompt: "run",
      runInBackground: true,
    }),
    /boom/,
  );

  assert.deepEqual(persisted, ["subagent:create", "subagent:close"]);
  assert.equal(closed, 1);
});

test("lifecycle service resumes detached interactive agents by attaching with the resume input", async () => {
  let sentInteractiveInputs = 0;
  let ensureOptions:
    | {
        interactiveInput?: string;
        taskSummary?: string;
      }
    | undefined;
  const { deps, records } = createBaseDeps();
  const interactiveAttachment: LiveChildAttachment = {
    agentId: "agent-1",
    transport: "interactive",
    stateWaiters: [],
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
    surface: "pane-1",
    sessionFile: "/tmp/interactive-child.jsonl",
    abortController: new AbortController(),
  };
  records.set("agent-1", {
    ...records.get("agent-1")!,
    transport: "interactive",
    status: "live_idle",
    sessionFile: "/tmp/interactive-child.jsonl",
  });
  const service = createSubagentLifecycleService({
    ...deps,
    ensureLiveAttachment: async (_agentId, options) => {
      ensureOptions = options;
      return { attachment: interactiveAttachment, deliveredInputAtAttach: true };
    },
    isInteractiveAttachment: () => true,
    sendInteractiveInput() {
      sentInteractiveInputs += 1;
    },
  });

  const resumed = await service.resume({
    mode: "codex",
    agentId: "agent-1",
    input: "continue with the fix",
    taskSummary: "continue fix",
  });

  assert.deepEqual(ensureOptions, {
    interactiveInput: "continue with the fix",
    taskSummary: "continue fix",
  });
  assert.equal(sentInteractiveInputs, 0);
  assert.equal(resumed.commandType, "interactive_input");
  assert.equal(resumed.input, "continue with the fix");
  assert.equal(resumed.snapshot.status, "running");
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
  const waitedAny = await service.waitAny({ timeoutMs: 45_000 });
  records.set("agent-1", { ...records.get("agent-1")!, status: "live_idle" });
  const stopped = await service.stop("agent-1");

  assert.equal(waited.timedOut, false);
  assert.equal(waited.snapshots[0]?.status, "idle");
  assert.equal(waitedAny.timedOut, false);
  assert.equal(waitedAny.snapshots[0]?.status, "idle");
  assert.equal(stopped.snapshot.status, "closed");
  assert.equal(increments, 2);
  assert.equal(decrements, 2);
  assert.equal(flushed, 2);
  assert.equal(closed, 1);
});

test("lifecycle service waitAny rejects when no child agents are available", async () => {
  const { deps } = createBaseDeps({
    listWaitableChildIds: () => [],
  });
  const service = createSubagentLifecycleService(deps);

  await assert.rejects(service.waitAny({ timeoutMs: 45_000 }), /No child agents are available to wait on/);
});

test("lifecycle service lets role defaults beat inherited parent defaults when no explicit override is provided", async () => {
  await withTempHome(async (homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(path.join(cwd, ".agents"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".agents", "reviewer.md"),
      `---\nname: reviewer\ndescription: Reviewer\nmodel: openai/gpt-5\nthinking: high\n---\n\nPrompt\n`,
    );

    let spawnedRecordModel: string | undefined;
    let latestRecord: DurableChildRecord | undefined;
    const { deps, records, attachment } = createBaseDeps({
      resolveParentSpawnDefaults: () => ({ model: "anthropic/claude-haiku-4-5", reasoningEffort: "low" }),
      attachChild: async (record) => {
        spawnedRecordModel = record.model;
        latestRecord = record;
        records.set(record.agentId, record);
        return { attachment: attachment as never, record };
      },
      sendPromptToAttachment: async () => latestRecord!,
    });
    const service = createSubagentLifecycleService(deps);

    const result = await service.spawn({
      mode: "task",
      ctx: {
        cwd,
        sessionManager: { getEntries: () => [], getLeafId: () => null, getSessionFile: () => "/tmp/session.jsonl" },
        model: undefined,
      } as never,
      name: "reviewer_task",
      prompt: "Review",
      requestedAgentType: "reviewer",
      runInBackground: true,
    });

    assert.equal(spawnedRecordModel, "openai/gpt-5");
    assert.equal(result.record.model, "openai/gpt-5");
  });
});
