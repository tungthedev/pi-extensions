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
      findAddressableChildByTarget: (target: string, currentTaskPath: string) =>
        [...records.values()].find((record) => {
          if (target.startsWith("/")) return record.taskPath === target;
          return record.taskPath === `${currentTaskPath}/${target}` || (!record.taskPath && record.name === target);
        }),
      findAddressableChildByTaskPath: (taskPath: string) =>
        [...records.values()].find((record) => record.taskPath === taskPath),
      listAddressableChildren: () => [...records.values()].filter((record) => record.status !== "closed"),
      listDescendantsByTaskPath: (taskPath: string) =>
        [...records.values()].filter((record) => record.taskPath?.startsWith(`${taskPath}/`)),
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

  await service.resume({ mode: "codex", agentId: "agent-1", input: "do work", steer: true });
  await service.resume({ mode: "task", agentId: "agent-1", input: "resume task" });

  assert.deepEqual(sentCommands, ["steer", "follow_up"]);
});

test("lifecycle service starts a new turn when steering an inactive codex agent", async () => {
  const sentCommands: string[] = [];
  const { deps, records } = createBaseDeps({
    sendAttachmentMessage: async (_attachment, _input, commandType) => {
      sentCommands.push(commandType);
      return "submission-1";
    },
  });
  records.set("agent-1", { ...records.get("agent-1")!, status: "live_idle" });
  const service = createSubagentLifecycleService(deps);

  const resumed = await service.resume({ mode: "codex", agentId: "agent-1", input: "do work", steer: true });

  assert.equal(resumed.commandType, "prompt");
  assert.deepEqual(sentCommands, ["prompt"]);
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

test("lifecycle service stores canonical task paths when spawning", async () => {
  const previousTaskPath = process.env.PI_SUBAGENT_TASK_PATH;
  delete process.env.PI_SUBAGENT_TASK_PATH;
  try {
    let latestRecord: DurableChildRecord | undefined;
    const { deps, records, attachment } = createBaseDeps({
      attachChild: async (record) => {
        latestRecord = record;
        records.set(record.agentId, record);
        return { attachment: attachment as never, record };
      },
      sendPromptToAttachment: async () => latestRecord!,
    });
    const service = createSubagentLifecycleService(deps);

    const rootSpawn = await service.spawn({
      mode: "codex",
      ctx: {
        cwd: "/tmp/project",
        sessionManager: { getEntries: () => [], getLeafId: () => null, getSessionFile: () => "/tmp/session.jsonl" },
      } as never,
      name: "reviewer",
      prompt: "Review",
      runInBackground: true,
    });

    assert.equal(rootSpawn.record.parentTaskPath, "/root");
    assert.equal(rootSpawn.record.taskPath, "/root/reviewer");

    process.env.PI_SUBAGENT_TASK_PATH = "/root/reviewer";
    const childSpawn = await service.spawn({
      mode: "codex",
      ctx: {
        cwd: "/tmp/project",
        sessionManager: { getEntries: () => [], getLeafId: () => null, getSessionFile: () => "/tmp/session.jsonl" },
      } as never,
      name: "auditor",
      prompt: "Audit",
      runInBackground: true,
    });

    assert.equal(childSpawn.record.parentTaskPath, "/root/reviewer");
    assert.equal(childSpawn.record.taskPath, "/root/reviewer/auditor");
  } finally {
    if (previousTaskPath === undefined) delete process.env.PI_SUBAGENT_TASK_PATH;
    else process.env.PI_SUBAGENT_TASK_PATH = previousTaskPath;
  }
});

test("lifecycle service allows duplicate task names under different parent paths", async () => {
  const previousTaskPath = process.env.PI_SUBAGENT_TASK_PATH;
  process.env.PI_SUBAGENT_TASK_PATH = "/root/researcher";
  try {
    let latestRecord: DurableChildRecord | undefined;
    const { deps, records, attachment } = createBaseDeps({
      attachChild: async (record) => {
        latestRecord = record;
        records.set(record.agentId, record);
        return { attachment: attachment as never, record };
      },
      sendPromptToAttachment: async () => latestRecord!,
    });
    records.set("root-reviewer", {
      ...records.get("agent-1")!,
      agentId: "root-reviewer",
      name: "reviewer",
      taskPath: "/root/reviewer",
      parentTaskPath: "/root",
    });
    const service = createSubagentLifecycleService(deps);

    const spawned = await service.spawn({
      mode: "codex",
      ctx: {
        cwd: "/tmp/project",
        sessionManager: { getEntries: () => [], getLeafId: () => null, getSessionFile: () => "/tmp/session.jsonl" },
      } as never,
      name: "reviewer",
      prompt: "Review nested scope",
      runInBackground: true,
    });

    assert.equal(spawned.record.taskPath, "/root/researcher/reviewer");
  } finally {
    if (previousTaskPath === undefined) delete process.env.PI_SUBAGENT_TASK_PATH;
    else process.env.PI_SUBAGENT_TASK_PATH = previousTaskPath;
  }
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

test("lifecycle service resolves relative and canonical targets from current task path", async () => {
  const previousTaskPath = process.env.PI_SUBAGENT_TASK_PATH;
  process.env.PI_SUBAGENT_TASK_PATH = "/root/researcher";
  const sentTo: string[] = [];
  try {
    const { deps, records } = createBaseDeps({
      ensureLiveAttachment: async (agentId) => {
        sentTo.push(agentId);
        return { attachment: { ...createBaseDeps().attachment, agentId } as never };
      },
    });
    records.set("nested", {
      ...records.get("agent-1")!,
      agentId: "nested",
      name: "reviewer",
      taskPath: "/root/researcher/reviewer",
      parentTaskPath: "/root/researcher",
    });
    records.set("other", {
      ...records.get("agent-1")!,
      agentId: "other",
      name: "reviewer",
      taskPath: "/root/other/reviewer",
      parentTaskPath: "/root/other",
    });
    const service = createSubagentLifecycleService(deps);

    await service.resumeByName({ mode: "codex", name: "reviewer", input: "go" });
    await service.resumeByName({ mode: "codex", name: "/root/other/reviewer", input: "go" });

    assert.deepEqual(sentTo, ["nested", "other"]);
  } finally {
    if (previousTaskPath === undefined) delete process.env.PI_SUBAGENT_TASK_PATH;
    else process.env.PI_SUBAGENT_TASK_PATH = previousTaskPath;
  }
});

test("lifecycle service resolves relative list_agents prefixes from current task path", () => {
  const previousTaskPath = process.env.PI_SUBAGENT_TASK_PATH;
  process.env.PI_SUBAGENT_TASK_PATH = "/root/researcher";
  try {
    const { deps, records } = createBaseDeps();
    records.clear();
    records.set("nested", {
      agentId: "nested",
      transport: "rpc",
      cwd: "/tmp/project",
      status: "live_running",
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z",
      name: "reviewer",
      taskPath: "/root/researcher/reviewer",
      parentTaskPath: "/root/researcher",
    });
    records.set("nested-child", {
      ...records.get("nested")!,
      agentId: "nested-child",
      name: "auditor",
      taskPath: "/root/researcher/reviewer/auditor",
      parentTaskPath: "/root/researcher/reviewer",
    });
    records.set("root", {
      ...records.get("nested")!,
      agentId: "root",
      taskPath: "/root/reviewer",
      parentTaskPath: "/root",
    });
    records.set("sibling-prefix", {
      ...records.get("nested")!,
      agentId: "sibling-prefix",
      name: "reviewer_extra",
      taskPath: "/root/researcher/reviewer_extra",
      parentTaskPath: "/root/researcher",
    });
    const service = createSubagentLifecycleService(deps);

    assert.deepEqual(
      service.listAgents({ pathPrefix: "reviewer" }).snapshots.map((snapshot) => snapshot.agent_id),
      ["nested", "nested-child"],
    );
    assert.deepEqual(
      service.listAgents({ pathPrefix: "/root/reviewer" }).snapshots.map((snapshot) => snapshot.agent_id),
      ["root"],
    );
  } finally {
    if (previousTaskPath === undefined) delete process.env.PI_SUBAGENT_TASK_PATH;
    else process.env.PI_SUBAGENT_TASK_PATH = previousTaskPath;
  }
});

test("lifecycle service closes descendants when closing a task path", async () => {
  const closed: string[] = [];
  const { deps, records } = createBaseDeps({
    closeLiveAttachment: async (attachment) => {
      closed.push(attachment.agentId);
    },
    ensureLiveAttachment: async (agentId) => ({ attachment: { ...createBaseDeps().attachment, agentId } as never }),
  });
  records.set("parent", {
    ...records.get("agent-1")!,
    agentId: "parent",
    name: "researcher",
    taskPath: "/root/researcher",
    parentTaskPath: "/root",
  });
  records.set("child", {
    ...records.get("agent-1")!,
    agentId: "child",
    name: "reviewer",
    taskPath: "/root/researcher/reviewer",
    parentTaskPath: "/root/researcher",
  });
  const service = createSubagentLifecycleService(deps);

  const result = await service.stopByName("/root/researcher");

  assert.equal(result.snapshot.status, "closed");
  assert.equal(result.closedDescendantCount, 1);
  assert.deepEqual(closed, ["child", "parent"]);
  assert.equal(records.get("child")?.status, "closed");
  assert.equal(records.get("parent")?.status, "closed");
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
