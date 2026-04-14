import { SessionManager } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import subagentsExtension from "./index.ts";
import childEntry from "./child-entry.ts";
import interactiveChildEntry from "./interactive-child-entry.ts";
import {
  buildSendMessageContent,
  buildSpawnAgentContent,
  buildWaitAgentContent,
  createSubagentRuntimeStore,
  formatSubagentNotificationMessage,
  normalizeWaitAgentTimeoutMs,
  parseSubagentNotificationMessage,
  resolveForkContextSessionFile,
  resolveParentSpawnDefaults,
  validateSubagentName,
} from "./internal-test-helpers.ts";
import { registerCodexToolAdapters } from "./subagents/tool-adapters-codex.ts";
import { getSubagentNotificationDeliveryOptions } from "./subagents/notifications.ts";
import { isWaitableChild } from "./subagents/runtime-store.ts";
import { registerTaskToolAdapters } from "./subagents/tool-adapters-task.ts";
import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";

const EXISTING_FILE = fileURLToPath(new URL("../../package.json", import.meta.url));

function createPersistedSessionFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "codex-subagents-"));
  const cwd = path.join(root, "repo");
  const sessionDir = path.join(root, "sessions");
  mkdirSync(cwd, { recursive: true });

  const manager = SessionManager.create(cwd, sessionDir);
  const user1 = manager.appendMessage({
    role: "user",
    content: "hello",
    timestamp: Date.now(),
  } as never);
  const assistant1 = manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "hi" }],
    provider: "test",
    model: "test-model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  } as never);
  const user2 = manager.appendMessage({
    role: "user",
    content: "follow up",
    timestamp: Date.now(),
  } as never);
  const assistant2 = manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    provider: "test",
    model: "test-model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  } as never);

  return {
    root,
    cwd,
    manager,
    sessionFile: manager.getSessionFile()!,
    ids: { user1, assistant1, user2, assistant2 },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function createMockCtx(cwd = "/tmp/project") {
  return {
    cwd,
    model: undefined,
    sessionManager: {
      getEntries: () => [],
      getLeafId: () => null,
      getSessionFile: () => "/tmp/session.jsonl",
    },
  } as never;
}

function createRenderTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `**${text}**`,
  } as never;
}

function createCodexLifecycleMock() {
  const calls: Record<string, unknown[]> = {
    spawn: [],
    resumeByName: [],
    waitAny: [],
    waitByNames: [],
    stopByName: [],
  };

  const snapshots = new Map<string, {
    agent_id: string;
    name: string;
    status: "running" | "idle" | "failed" | "closed" | "timeout" | "detached";
    durable_status: "live_running" | "live_idle" | "failed" | "closed" | "detached";
    cwd: string;
    last_assistant_text?: string;
    last_error?: string;
  }>();
  const waitedSnapshots = new Map<string, {
    agent_id: string;
    name: string;
    status: "running" | "idle" | "failed" | "closed" | "timeout" | "detached";
    durable_status: "live_running" | "live_idle" | "failed" | "closed" | "detached";
    cwd: string;
    last_assistant_text?: string;
    last_error?: string;
  }>();

  const buildSnapshot = (
    name: string,
    status: "running" | "idle" | "failed" | "closed" | "timeout" | "detached" = "idle",
    output = `${name} done`,
  ) => ({
    agent_id: `internal-${name}`,
    name,
    status,
    durable_status:
      status === "running"
        ? "live_running"
        : status === "detached"
          ? "detached"
          : status === "closed"
            ? "closed"
            : status === "failed"
              ? "failed"
              : "live_idle",
    cwd: "/tmp/project",
    ...(status === "failed" ? { last_error: output } : { last_assistant_text: output }),
  } as const);

  return {
    calls,
    setSnapshot(name: string, status: "running" | "idle" | "failed" | "closed" | "timeout" | "detached", output?: string) {
      snapshots.set(name, buildSnapshot(name, status, output));
    },
    setWaitedSnapshot(name: string, status: "running" | "idle" | "failed" | "closed" | "timeout" | "detached", output?: string) {
      waitedSnapshots.set(name, buildSnapshot(name, status, output));
    },
    lifecycle: {
      async spawn(request: { name: string; prompt: string; runInBackground?: boolean }) {
        calls.spawn.push(request);
        return {
          agentId: "internal-1",
          name: request.name,
          prompt: request.prompt,
          record: {
            agentId: "internal-1",
            transport: "rpc",
            cwd: "/tmp/project",
            name: request.name,
            status: "live_running",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          attachment: {} as never,
          completedAgent: request.runInBackground
            ? undefined
            : {
                agent_id: "internal-1",
                name: request.name,
                status: "idle",
                durable_status: "live_idle",
                cwd: "/tmp/project",
                last_assistant_text: "child done",
              },
        };
      },
      async resumeByName(request: { name: string; input: string; interrupt?: boolean }) {
        calls.resumeByName.push(request);
        return {
          submissionId: "submission-1",
          commandType: request.interrupt ? "steer" : "follow_up",
          input: request.input,
          snapshot: buildSnapshot(request.name, "running", request.input),
        };
      },
      async waitAny(request: { timeoutMs: number }) {
        calls.waitAny.push(request);
        return {
          snapshots: [buildSnapshot("researcher_one", "idle", "researcher_one done")],
          timedOut: false,
        };
      },
      async waitByNames(request: { names: string[]; timeoutMs: number }) {
        calls.waitByNames.push(request);
        return {
          snapshots: request.names.map((name) => waitedSnapshots.get(name) ?? buildSnapshot(name, "idle")),
          timedOut: false,
        };
      },
      getSnapshotByName(name: string) {
        return {
          snapshot: snapshots.get(name) ?? buildSnapshot(name, "idle"),
        };
      },
      async stopByName(name: string) {
        calls.stopByName.push({ name });
        return {
          snapshot: {
            agent_id: `internal-${name}`,
            name,
            status: "closed" as const,
            durable_status: "closed" as const,
            cwd: "/tmp/project",
          },
        };
      },
    },
  };
}

function captureTools(register: (pi: { registerTool(def: unknown): void }) => void) {
  const tools = new Map<string, Record<string, unknown>>();
  register({
    registerTool(def: Record<string, unknown>) {
      tools.set(def.name as string, def);
    },
  });
  return tools;
}

test("subagents public entrypoint registers tools and sync hooks for parent sessions", () => {
  const tools: string[] = [];
  const events: string[] = [];

  subagentsExtension({
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    on(event: string) {
      events.push(event);
    },
    registerCommand() {},
    registerMessageRenderer() {},
    sendMessage() {},
    appendEntry() {},
    getAllTools: () => [],
    setActiveTools() {},
  } as never);

  assert.ok(tools.length > 0);
  assert.equal(events.includes("session_start"), true);
  assert.equal(events.includes("before_agent_start"), true);
});

test("child entrypoints register codex plus shell, web, and skill tools", () => {
  const childTools: string[] = [];
  const childEvents: string[] = [];

  const pi = {
    registerTool(tool: { name: string }) {
      childTools.push(tool.name);
    },
    on(event: string) {
      childEvents.push(event);
    },
    registerCommand() {},
    registerMessageRenderer() {},
    sendMessage() {},
    appendEntry() {},
    getAllTools: () => [],
    setActiveTools() {},
  } as never;

  childEntry(pi);
  interactiveChildEntry(pi);

  assert.equal(childTools.includes("shell"), true);
  assert.equal(childTools.includes("skill"), true);
  assert.equal(childTools.includes("FetchUrl"), true);
  assert.equal(childTools.includes("request_user_input"), true);
  assert.equal(childTools.includes("Execute"), true);
  assert.equal(childTools.includes("TodoWrite"), true);
  assert.equal(childTools.includes("spawn_agent"), false);
  assert.equal(childTools.includes("send_message"), false);
  assert.equal(childTools.includes("wait_agent"), false);
  assert.equal(childTools.includes("close_agent"), false);
  assert.equal(childTools.includes("Task"), false);
  assert.equal(childTools.includes("TaskOutput"), false);
  assert.equal(childTools.includes("TaskStop"), false);
  assert.equal(childEvents.includes("session_start"), true);
  assert.equal(childEvents.includes("before_agent_start"), true);
});

test("validateSubagentName accepts lowercase names and rejects invalid ones", () => {
  assert.equal(validateSubagentName("research_auth"), "research_auth");
  assert.equal(validateSubagentName("research-auth"), "research-auth");
  assert.equal(validateSubagentName(" task2 "), "task2");
  assert.equal(validateSubagentName("a_1"), "a_1");
  assert.throws(() => validateSubagentName("BadName"), /lowercase letters, digits, underscores, and hyphens/);
  assert.throws(() => validateSubagentName("has space"), /lowercase letters, digits, underscores, and hyphens/);
  assert.throws(() => validateSubagentName(""), /name is required/);
});

test("runtime store resolves only publicly addressable names and releases closed names", () => {
  const store = createSubagentRuntimeStore();
  store.setDurableChild("live", {
    agentId: "live",
    transport: "rpc",
    cwd: "/tmp/project",
    name: "worker_one",
    status: "live_running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.setDurableChild("detached-rpc", {
    agentId: "detached-rpc",
    transport: "rpc",
    cwd: "/tmp/project",
    name: "worker_two",
    status: "detached",
    sessionFile: EXISTING_FILE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.setDurableChild("detached-interactive", {
    agentId: "detached-interactive",
    transport: "interactive",
    cwd: "/tmp/project",
    name: "worker_three",
    status: "detached",
    sessionFile: EXISTING_FILE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.setDurableChild("failed", {
    agentId: "failed",
    transport: "rpc",
    cwd: "/tmp/project",
    name: "worker_four",
    status: "failed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.setDurableChild("closed", {
    agentId: "closed",
    transport: "rpc",
    cwd: "/tmp/project",
    name: "worker_five",
    status: "closed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.equal(store.findChildByPublicName("worker_one")?.agentId, "live");
  assert.equal(store.findChildByPublicName("worker_two")?.agentId, "detached-rpc");
  assert.equal(store.findChildByPublicName("worker_four")?.agentId, "failed");
  assert.equal(store.findChildByPublicName("worker_three"), undefined);
  assert.equal(store.findChildByPublicName("worker_five"), undefined);
  assert.equal(store.hasAddressableChildName("worker_five"), false);
});

test("isWaitableChild excludes completed agents unless they have an unconsumed completion", () => {
  const running = {
    agentId: "running-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "live_running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as const;
  const completed = {
    ...running,
    agentId: "done-1",
    status: "live_idle",
  } as const;
  const failed = {
    ...running,
    agentId: "failed-1",
    status: "failed",
  } as const;

  assert.equal(isWaitableChild(running), true);
  assert.equal(isWaitableChild(completed), false);
  assert.equal(isWaitableChild(failed), false);
  assert.equal(isWaitableChild(completed, { hasUnconsumedCompletion: true }), true);
  assert.equal(isWaitableChild(failed, { hasUnconsumedCompletion: true }), true);
});

test("shared resolver switches Codex subagent tool family to send_message", () => {
  const toolInfos = resolveRegisteredToolInfos([
    { name: "spawn_agent", description: "subagent" },
    { name: "send_message", description: "subagent" },
    { name: "wait_agent", description: "subagent" },
    { name: "close_agent", description: "subagent" },
    { name: "Task", description: "task" },
    { name: "TaskOutput", description: "task" },
    { name: "TaskStop", description: "task" },
    { name: "WebSearch", description: "web" },
  ]);

  assert.deepEqual(resolveToolsetToolNames("codex", toolInfos), [
    "WebSearch",
    "spawn_agent",
    "send_message",
    "wait_agent",
    "close_agent",
  ]);
  assert.deepEqual(resolveToolsetToolNames("droid", toolInfos), [
    "WebSearch",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});

test("codex tool adapters use public names and do not leak agent ids", async () => {
  const { lifecycle, calls } = createCodexLifecycleMock();
  const tools = captureTools((pi) =>
    registerCodexToolAdapters(pi as never, {
      lifecycle: lifecycle as never,
      renderSpawnPromptPreview: () => new Text("preview", 0, 0),
      normalizeWaitAgentTimeoutMs,
    }),
  );

  const spawnAgent = tools.get("spawn_agent");
  const sendMessage = tools.get("send_message");
  const waitAgent = tools.get("wait_agent");
  const closeAgent = tools.get("close_agent");

  assert.ok(spawnAgent);
  assert.ok(sendMessage);
  assert.ok(waitAgent);
  assert.ok(closeAgent);

  const spawnResult = await (spawnAgent!.execute as (...args: unknown[]) => Promise<any>)("call-1", {
    name: "researcher_one",
    message: "Investigate auth flow",
  }, undefined, undefined, createMockCtx());
  assert.equal(calls.spawn.length, 1);
  assert.equal((calls.spawn[0] as { name: string }).name, "researcher_one");
  assert.equal((calls.spawn[0] as { runInBackground: boolean }).runInBackground, true);
  assert.deepEqual(JSON.parse(spawnResult.content[0].text), {
    name: "researcher_one",
  });
  assert.equal(JSON.stringify(spawnResult).includes("agent_id"), false);

  const spawnForegroundExplicit = await (spawnAgent!.execute as (...args: unknown[]) => Promise<any>)("call-1b", {
    name: "researcher_two",
    message: "Investigate billing flow",
    wait_for_agent: true,
  }, undefined, undefined, createMockCtx());
  assert.equal(calls.spawn.length, 2);
  const explicitForegroundSpawnCall = calls.spawn[1] as Record<string, unknown>;
  assert.equal(explicitForegroundSpawnCall.mode, "codex");
  assert.equal(explicitForegroundSpawnCall.name, "researcher_two");
  assert.equal(explicitForegroundSpawnCall.prompt, "Investigate billing flow");
  assert.equal(explicitForegroundSpawnCall.runInBackground, false);
  assert.deepEqual(JSON.parse(spawnForegroundExplicit.content[0].text), {
    name: "researcher_two",
    status: { researcher_two: "idle" },
    timed_out: false,
    agent: {
      name: "researcher_two",
      status: "idle",
      durable_status: "live_idle",
      cwd: "/tmp/project",
      last_assistant_text: "child done",
    },
    agents: [
      {
        name: "researcher_two",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "child done",
      },
    ],
  });

  const sendResult = await (sendMessage!.execute as (...args: unknown[]) => Promise<any>)("call-2", {
    target: "researcher_one",
    message: "Keep digging",
    interrupt: true,
  });
  assert.deepEqual(calls.resumeByName, [
    { mode: "codex", name: "researcher_one", input: "Keep digging", interrupt: true },
  ]);
  assert.deepEqual(JSON.parse(sendResult.content[0].text), { submission_id: "submission-1" });
  assert.equal(JSON.stringify(sendResult.details).includes("agent_id"), false);

  const waitResult = await (waitAgent!.execute as (...args: unknown[]) => Promise<any>)("call-3", {
    timeout_ms: 45_000,
  });
  assert.deepEqual(calls.waitAny, [{ timeoutMs: 45_000 }]);
  assert.deepEqual(JSON.parse(waitResult.content[0].text), {
    status: { researcher_one: "idle" },
    timed_out: false,
    agents: [
      {
        name: "researcher_one",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "researcher_one done",
      },
    ],
  });

  const closeResult = await (closeAgent!.execute as (...args: unknown[]) => Promise<any>)("call-4", { target: "researcher_one" });
  assert.deepEqual(calls.stopByName, [{ name: "researcher_one" }]);
  assert.deepEqual(JSON.parse(closeResult.content[0].text), {
    name: "researcher_one",
    status: "closed",
  });
});

test("spawn_agent renders foreground prompt in call output and content-only result previews", async () => {
  const { lifecycle } = createCodexLifecycleMock();
  const tools = captureTools((pi) =>
    registerCodexToolAdapters(pi as never, {
      lifecycle: lifecycle as never,
      renderSpawnPromptPreview: (prompt) => new Text(prompt, 0, 0),
      normalizeWaitAgentTimeoutMs,
    }),
  );

  const spawnAgent = tools.get("spawn_agent");
  assert.ok(spawnAgent);

  const theme = createRenderTheme();
  const foregroundCall = (spawnAgent!.renderCall as (...args: unknown[]) => unknown)(
    { name: "worker", agent_type: "researcher", message: "Investigate auth flow", wait_for_agent: true },
    theme,
  ) as { children?: Array<{ text?: string }> };
  assert.equal(foregroundCall.children?.[0]?.text, "**Spawn **worker [researcher]");
  assert.equal(foregroundCall.children?.[1]?.text, "Investigate auth flow");

  const backgroundCall = (spawnAgent!.renderCall as (...args: unknown[]) => unknown)(
    { name: "worker", message: "Investigate auth flow" },
    theme,
  ) as { text?: string };
  assert.equal(backgroundCall.text, "**Spawn running **worker");

  const collapsedResult = (spawnAgent!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        wait_for_agent: true,
        agents: [
          {
            name: "worker",
            status: "idle",
            durable_status: "live_idle",
            cwd: "/tmp/project",
            last_assistant_text: "line 1\nline 2\nline 3\nline 4",
          },
        ],
      },
    },
    { expanded: false },
    theme,
  ) as { text?: string };
  assert.equal(collapsedResult.text, "line 1\nline 2\nline 3\n... (+1 more line, ctrl+o to expand)");

  const expandedResult = (spawnAgent!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        wait_for_agent: true,
        agents: [
          {
            name: "worker",
            status: "idle",
            durable_status: "live_idle",
            cwd: "/tmp/project",
            last_assistant_text: "line 1\nline 2\nline 3\nline 4",
          },
        ],
      },
    },
    { expanded: true },
    theme,
  ) as { text?: string };
  assert.equal(expandedResult.text, "line 1\nline 2\nline 3\nline 4");

  const backgroundResult = (spawnAgent!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        wait_for_agent: false,
        prompt: "Investigate auth flow",
      },
    },
    { expanded: false },
    theme,
  ) as { children?: unknown[] };
  assert.deepEqual(backgroundResult.children, []);
});

test("task tool adapters require names for spawn and do not leak task ids", async () => {
  const { lifecycle, calls, setSnapshot, setWaitedSnapshot } = createCodexLifecycleMock();
  const tools = captureTools((pi) =>
    registerTaskToolAdapters(pi as never, {
      lifecycle: lifecycle as never,
      normalizeWaitAgentTimeoutMs,
    }),
  );

  const taskTool = tools.get("Task");
  const taskOutput = tools.get("TaskOutput");
  const taskStop = tools.get("TaskStop");

  assert.ok(taskTool);
  assert.ok(taskOutput);
  assert.ok(taskStop);

  const theme = createRenderTheme();
  const foregroundTaskCall = (taskTool!.renderCall as (...args: unknown[]) => unknown)(
    { name: "task_alpha", subagent_type: "researcher", prompt: "Do work", complexity: "high", wait_for_task: true },
    theme,
  ) as { children?: Array<{ text?: string }> };
  assert.equal(foregroundTaskCall.children?.[0]?.text, "**Task **task_alpha [researcher]");
  assert.equal(foregroundTaskCall.children?.[1]?.text, "Do work");

  const backgroundTaskCall = (taskTool!.renderCall as (...args: unknown[]) => unknown)(
    { name: "task_alpha", prompt: "Do work" },
    theme,
  ) as { text?: string };
  assert.equal(backgroundTaskCall.text, "**Task running **task_alpha");

  const backgroundTaskResult = (taskTool!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        name: "task_alpha",
        status: "running",
        durable_status: "live_running",
        cwd: "/tmp/project",
      },
    },
    { expanded: false },
    theme,
  ) as { children?: unknown[] };
  assert.deepEqual(backgroundTaskResult.children, []);

  const collapsedForegroundTaskResult = (taskTool!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        agents: [
          {
            name: "task_alpha",
            status: "idle",
            durable_status: "live_idle",
            cwd: "/tmp/project",
            last_assistant_text: "line 1\nline 2\nline 3\nline 4",
          },
        ],
      },
    },
    { expanded: false },
    theme,
  ) as { text?: string };
  assert.equal(collapsedForegroundTaskResult.text, "line 1\nline 2\nline 3\n... (+1 more line, ctrl+o to expand)");

  const expandedForegroundTaskResult = (taskTool!.renderResult as (...args: unknown[]) => unknown)(
    {
      details: {
        agents: [
          {
            name: "task_alpha",
            status: "idle",
            durable_status: "live_idle",
            cwd: "/tmp/project",
            last_assistant_text: "line 1\nline 2\nline 3\nline 4",
          },
        ],
      },
    },
    { expanded: true },
    theme,
  ) as { text?: string };
  assert.equal(expandedForegroundTaskResult.text, "line 1\nline 2\nline 3\nline 4");

  await assert.rejects(
    (taskTool!.execute as (...args: unknown[]) => Promise<any>)(
      "call-1",
      { prompt: "Do work" },
      undefined,
      undefined,
      createMockCtx(),
    ),
    /name is required/,
  );

  const taskSpawn = await (taskTool!.execute as (...args: unknown[]) => Promise<any>)(
    "call-2",
    { name: "task_alpha", prompt: "Do work" },
    undefined,
    undefined,
    createMockCtx(),
  );
  assert.deepEqual(JSON.parse(taskSpawn.content[0].text), {
    name: "task_alpha",
    status: "running",
  });
  assert.equal(JSON.stringify(taskSpawn.details).includes("task_id"), false);

  const taskSpawnForeground = await (taskTool!.execute as (...args: unknown[]) => Promise<any>)(
    "call-2b",
    { name: "task_sync", prompt: "Do work in foreground", wait_for_task: true },
    undefined,
    undefined,
    createMockCtx(),
  );
  assert.deepEqual(JSON.parse(taskSpawnForeground.content[0].text), {
    name: "task_sync",
    status: "idle",
    output: "child done",
  });

  const taskResume = await (taskTool!.execute as (...args: unknown[]) => Promise<any>)(
    "call-3",
    { resume: "task_alpha", prompt: "Continue" },
    undefined,
    undefined,
    createMockCtx(),
  );
  assert.deepEqual(JSON.parse(taskResume.content[0].text), {
    name: "task_alpha",
    submission_id: "submission-1",
  });

  setSnapshot("task_wait", "running", "still working");
  setWaitedSnapshot("task_wait", "idle", "finished after resume");
  const taskResumeForeground = await (taskTool!.execute as (...args: unknown[]) => Promise<any>)(
    "call-3b",
    { resume: "task_wait", prompt: "Continue in foreground", wait_for_task: true },
    undefined,
    undefined,
    createMockCtx(),
  );
  assert.deepEqual(JSON.parse(taskResumeForeground.content[0].text), {
    name: "task_wait",
    submission_id: "submission-1",
    status: "idle",
    output: "finished after resume",
    timed_out: false,
  });
  assert.deepEqual(calls.waitByNames, [{ names: ["task_wait"], timeoutMs: 45_000 }]);

  const output = await (taskOutput!.execute as (...args: unknown[]) => Promise<any>)("call-4", { name: "task_alpha", block: false });
  assert.deepEqual(JSON.parse(output.content[0].text), {
    name: "task_alpha",
    status: "idle",
    output: "task_alpha done",
    timed_out: false,
  });

  const stop = await (taskStop!.execute as (...args: unknown[]) => Promise<any>)("call-5", { name: "task_alpha" });
  assert.deepEqual(JSON.parse(stop.content[0].text), {
    name: "task_alpha",
    status: "closed",
  });
});

test("TaskOutput returns immediately for non-running tasks and waits for running tasks", async () => {
  const { lifecycle, calls, setSnapshot, setWaitedSnapshot } = createCodexLifecycleMock();
  const tools = captureTools((pi) =>
    registerTaskToolAdapters(pi as never, {
      lifecycle: lifecycle as never,
      normalizeWaitAgentTimeoutMs,
    }),
  );
  const taskOutput = tools.get("TaskOutput");
  assert.ok(taskOutput);

  setSnapshot("task_done", "idle", "finished already");
  const completed = await (taskOutput!.execute as (...args: unknown[]) => Promise<any>)("call-complete", {
    name: "task_done",
  });

  assert.deepEqual(JSON.parse(completed.content[0].text), {
    name: "task_done",
    status: "idle",
    output: "finished already",
    timed_out: false,
  });
  assert.deepEqual(calls.waitByNames, []);

  setSnapshot("task_detached", "detached", "detached state");
  const detached = await (taskOutput!.execute as (...args: unknown[]) => Promise<any>)("call-detached", {
    name: "task_detached",
  });

  assert.deepEqual(JSON.parse(detached.content[0].text), {
    name: "task_detached",
    status: "detached",
    output: "detached state",
    timed_out: false,
  });
  assert.deepEqual(calls.waitByNames, []);

  setSnapshot("task_running", "running", "still working");
  setWaitedSnapshot("task_running", "idle", "finished after wait");
  const waited = await (taskOutput!.execute as (...args: unknown[]) => Promise<any>)("call-wait", {
    name: "task_running",
    timeout: 45_000,
  });

  assert.deepEqual(JSON.parse(waited.content[0].text), {
    name: "task_running",
    status: "idle",
    output: "finished after wait",
    timed_out: false,
  });
  assert.deepEqual(calls.waitByNames, [{ names: ["task_running"], timeoutMs: 45_000 }]);

});

test("buildWaitAgentContent uses public names in status payloads", () => {
  const content = buildWaitAgentContent(
    [
      {
        name: "alpha",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "done",
      },
      {
        name: "beta",
        status: "failed",
        durable_status: "failed",
        cwd: "/tmp/project",
        last_error: "boom",
      },
    ],
    false,
  );

  assert.deepEqual(JSON.parse(content), {
    status: { alpha: "idle", beta: "failed" },
    timed_out: false,
    agents: [
      {
        name: "alpha",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "done",
      },
      {
        name: "beta",
        status: "failed",
        durable_status: "failed",
        cwd: "/tmp/project",
        last_error: "boom",
      },
    ],
  });
});

test("buildSpawnAgentContent and buildSendMessageContent use public contract fields", () => {
  assert.deepEqual(JSON.parse(buildSpawnAgentContent("alpha")), {
    name: "alpha",
  });

  assert.deepEqual(
    JSON.parse(
      buildSpawnAgentContent("beta", {
        name: "beta",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "done",
      }),
    ),
    {
      name: "beta",
      status: { beta: "idle" },
      timed_out: false,
      agent: {
        name: "beta",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "done",
      },
      agents: [
        {
          name: "beta",
          status: "idle",
          durable_status: "live_idle",
          cwd: "/tmp/project",
          last_assistant_text: "done",
        },
      ],
    },
  );

  assert.deepEqual(JSON.parse(buildSendMessageContent("submission-1")), {
    submission_id: "submission-1",
  });
});

test("formatSubagentNotificationMessage wraps public name payloads", () => {
  const message = formatSubagentNotificationMessage({
    agent_id: "internal-1",
    name: "alpha",
    status: "idle",
    durable_status: "live_idle",
    last_assistant_text: "child done",
  });

  const payload = JSON.parse(message.split("\n")[1] ?? "{}");
  assert.deepEqual(payload, {
    name: "alpha",
    status: "idle",
    durable_status: "live_idle",
    last_assistant_text: "child done",
  });
  assert.equal(parseSubagentNotificationMessage(message)?.name, "alpha");
});

test("getSubagentNotificationDeliveryOptions steers notifications while parent is streaming", () => {
  assert.deepEqual(getSubagentNotificationDeliveryOptions(true), { deliverAs: "steer" });
  assert.deepEqual(getSubagentNotificationDeliveryOptions(false), { triggerTurn: true });
});

test("resolveParentSpawnDefaults inherits parent provider-qualified model and thinking level from session context", () => {
  const fixture = createPersistedSessionFixture();

  fixture.manager.appendModelChange("openai", "gpt-5");
  fixture.manager.appendThinkingLevelChange("high");

  const resolved = resolveParentSpawnDefaults({
    sessionEntries: fixture.manager.getEntries() as never,
    leafId: fixture.manager.getLeafId(),
  });

  assert.deepEqual(resolved, { model: "openai/gpt-5", reasoningEffort: "high" });
  fixture.cleanup();
});

test("resolveParentSpawnDefaults prefers the live parent provider-qualified model over session history", () => {
  const fixture = createPersistedSessionFixture();

  fixture.manager.appendModelChange("openai", "gpt-5");
  fixture.manager.appendThinkingLevelChange("medium");

  const resolved = resolveParentSpawnDefaults({
    modelId: "custom-provider/gpt-5-mini",
    sessionEntries: fixture.manager.getEntries() as never,
    leafId: fixture.manager.getLeafId(),
  });

  assert.deepEqual(resolved, {
    model: "custom-provider/gpt-5-mini",
    reasoningEffort: "medium",
  });
  fixture.cleanup();
});

test("resolveForkContextSessionFile creates a durable branched session for the requested leaf", () => {
  const fixture = createPersistedSessionFixture();

  try {
    const forkedSessionFile = resolveForkContextSessionFile({
      sessionFile: fixture.sessionFile,
      leafId: fixture.ids.assistant1,
      currentCwd: fixture.cwd,
      childCwd: fixture.cwd,
    });

    assert.ok(existsSync(forkedSessionFile));

    const forked = SessionManager.open(forkedSessionFile);
    assert.equal(forked.getHeader()?.parentSession, fixture.sessionFile);
    assert.equal(forked.getLeafId(), fixture.ids.assistant1);
    assert.deepEqual(
      forked.getEntries().map((entry) => entry.id),
      fixture.manager.getBranch(fixture.ids.assistant1).map((entry) => entry.id),
    );
  } finally {
    fixture.cleanup();
  }
});

test("resolveForkContextSessionFile rejects workdir changes for fork_context", () => {
  const fixture = createPersistedSessionFixture();

  try {
    assert.throws(
      () =>
        resolveForkContextSessionFile({
          sessionFile: fixture.sessionFile,
          leafId: fixture.ids.assistant2,
          currentCwd: fixture.cwd,
          childCwd: path.join(fixture.cwd, "other"),
        }),
      /workdir matches the current cwd/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("resolveForkContextSessionFile rejects leaves that are not in the persisted session file", () => {
  const fixture = createPersistedSessionFixture();

  try {
    assert.throws(
      () =>
        resolveForkContextSessionFile({
          sessionFile: fixture.sessionFile,
          leafId: "missing-leaf",
          currentCwd: fixture.cwd,
          childCwd: fixture.cwd,
        }),
      /current leaf to exist in the persisted session file/,
    );
  } finally {
    fixture.cleanup();
  }
});
