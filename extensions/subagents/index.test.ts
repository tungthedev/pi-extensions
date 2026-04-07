import { SessionManager } from "@mariozechner/pi-coding-agent";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSendInputContent,
  buildSpawnAgentContent,
  buildWaitAgentContent,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  deriveDurableStatusFromState,
  extractLastAssistantText,
  flattenCollabItems,
  formatSubagentNotificationMessage,
  getWaitAgentResultTitle,
  isResumable,
  normalizeReasoningEffortToThinkingLevel,
  normalizeWaitAgentTimeoutMs,
  normalizeThinkingLevelToReasoningEffort,
  parseSubagentNotificationMessage,
  rebuildDurableRegistry,
  resolveAgentIdAlias,
  resolveAgentIdsAlias,
  resolveForkContextSessionFile,
  resolveParentSpawnDefaults,
  resolveSpawnPrompt,
  wrapInteractiveSpawnPrompt,
} from "./index.ts";
import { getSubagentNotificationDeliveryOptions } from "./subagents/notifications.ts";

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

test("extractLastAssistantText returns the most recent assistant text blocks", () => {
  const text = extractLastAssistantText([
    {
      role: "assistant",
      content: [{ type: "text", text: "older" }],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "latest line 1" },
        { type: "image", data: "..." },
        { type: "text", text: "latest line 2" },
      ],
    },
  ]);

  assert.equal(text, "latest line 1\nlatest line 2");
});

test("deriveDurableStatusFromState distinguishes running and idle child states", () => {
  assert.equal(deriveDurableStatusFromState(undefined), "live_running");
  assert.equal(deriveDurableStatusFromState({ isStreaming: true }), "live_running");
  assert.equal(deriveDurableStatusFromState({ pendingMessageCount: 1 }), "live_running");
  assert.equal(
    deriveDurableStatusFromState({
      isStreaming: false,
      pendingMessageCount: 0,
    }),
    "live_idle",
  );
});

test("rebuildDurableRegistry reconstructs the latest durable record and closes stale live states", () => {
  const records = rebuildDurableRegistry([
    {
      type: "custom",
      customType: "subagent:create",
      data: {
        record: {
          agentId: "agent-1",
          cwd: "/tmp/project",
          status: "live_running",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      },
    },
    {
      type: "custom",
      customType: "subagent:update",
      data: {
        record: {
          agentId: "agent-1",
          cwd: "/tmp/project",
          status: "live_idle",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:01:00.000Z",
          sessionFile: "/tmp/project/.pi/session.jsonl",
        },
      },
    },
  ] as never);

  assert.equal(records.size, 1);
  assert.deepEqual(records.get("agent-1"), {
    agentId: "agent-1",
    transport: "rpc",
    cwd: "/tmp/project",
    status: "closed",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:01:00.000Z",
    sessionFile: "/tmp/project/.pi/session.jsonl",
  });
});

test("resolveAgentIdAlias and resolveAgentIdsAlias accept Codex and legacy field names", () => {
  assert.equal(resolveAgentIdAlias({ id: "agent-a" }), "agent-a");
  assert.equal(resolveAgentIdAlias({ agent_id: "agent-b" }), "agent-b");
  assert.deepEqual(
    resolveAgentIdsAlias({
      id: "agent-a",
      ids: ["agent-b"],
      agent_ids: ["agent-b", "agent-c"],
    }),
    ["agent-a", "agent-b", "agent-c"],
  );
});

test("flattenCollabItems and resolveSpawnPrompt compose Codex-style item payloads", () => {
  const items = [
    { type: "text", text: "Inspect the auth flow" },
    { type: "mention", path: "app://github" },
    { type: "local_image", path: "./screenshot.png" },
  ];

  assert.equal(
    flattenCollabItems(items),
    ["Inspect the auth flow", "mention: app://github", "local_image: ./screenshot.png"].join("\n"),
  );

  assert.equal(
    resolveSpawnPrompt({
      context: "Focus on login bugs.",
      message: "Check the repo.",
      items,
    }),
    [
      "Focus on login bugs.",
      "Check the repo.",
      "Inspect the auth flow\nmention: app://github\nlocal_image: ./screenshot.png",
    ].join("\n\n"),
  );
});

test("wrapInteractiveSpawnPrompt instructs the child to summarize and call subagent_done", () => {
  const wrapped = wrapInteractiveSpawnPrompt("Inspect the auth flow and report back.");

  assert.match(wrapped, /interactive delegated child session/i);
  assert.match(wrapped, /call the subagent_done tool/i);
  assert.match(wrapped, /FINAL assistant message/i);
  assert.match(wrapped, /Inspect the auth flow and report back\./);
});

test("normalizeReasoningEffortToThinkingLevel maps Codex effort values to Pi thinking levels", () => {
  assert.equal(normalizeReasoningEffortToThinkingLevel(undefined), undefined);
  assert.equal(normalizeReasoningEffortToThinkingLevel("minimal"), "minimal");
  assert.equal(normalizeReasoningEffortToThinkingLevel("low"), "low");
  assert.equal(normalizeReasoningEffortToThinkingLevel("medium"), "medium");
  assert.equal(normalizeReasoningEffortToThinkingLevel("high"), "high");
  assert.equal(normalizeReasoningEffortToThinkingLevel("xhigh"), "xhigh");
  assert.equal(normalizeReasoningEffortToThinkingLevel("none"), "off");
  assert.equal(normalizeReasoningEffortToThinkingLevel("off"), "off");
  assert.equal(normalizeReasoningEffortToThinkingLevel(" High "), "high");
});

test("normalizeReasoningEffortToThinkingLevel rejects unsupported values", () => {
  assert.throws(
    () => normalizeReasoningEffortToThinkingLevel("turbo"),
    /Unsupported reasoning_effort: turbo/,
  );
});

test("normalizeThinkingLevelToReasoningEffort keeps supported inherited values", () => {
  assert.equal(normalizeThinkingLevelToReasoningEffort(undefined), undefined);
  assert.equal(normalizeThinkingLevelToReasoningEffort("off"), "off");
  assert.equal(normalizeThinkingLevelToReasoningEffort("minimal"), "minimal");
  assert.equal(normalizeThinkingLevelToReasoningEffort("low"), "low");
  assert.equal(normalizeThinkingLevelToReasoningEffort("medium"), "medium");
  assert.equal(normalizeThinkingLevelToReasoningEffort("high"), "high");
  assert.equal(normalizeThinkingLevelToReasoningEffort("xhigh"), "xhigh");
  assert.equal(normalizeThinkingLevelToReasoningEffort("weird"), undefined);
});

test("normalizeWaitAgentTimeoutMs applies wait_agent default, clamp, and validation", () => {
  assert.equal(normalizeWaitAgentTimeoutMs(undefined), 45_000);
  assert.equal(normalizeWaitAgentTimeoutMs(30_000), 30_000);
  assert.equal(normalizeWaitAgentTimeoutMs(5_000), 30_000);
  assert.equal(normalizeWaitAgentTimeoutMs(95_000), 90_000);
  assert.throws(() => normalizeWaitAgentTimeoutMs(0), /timeout_ms must be greater than zero/);
});

test("resolveParentSpawnDefaults inherits parent model and thinking level from session context", () => {
  const fixture = createPersistedSessionFixture();

  fixture.manager.appendModelChange("openai", "gpt-5");
  fixture.manager.appendThinkingLevelChange("high");

  const resolved = resolveParentSpawnDefaults({
    sessionEntries: fixture.manager.getEntries() as never,
    leafId: fixture.manager.getLeafId(),
  });

  assert.deepEqual(resolved, { model: "gpt-5", reasoningEffort: "high" });

  fixture.cleanup();
});

test("resolveParentSpawnDefaults prefers the live parent model over session history", () => {
  const fixture = createPersistedSessionFixture();

  fixture.manager.appendModelChange("openai", "gpt-5");
  fixture.manager.appendThinkingLevelChange("medium");

  const resolved = resolveParentSpawnDefaults({
    modelId: "gpt-5-mini",
    sessionEntries: fixture.manager.getEntries() as never,
    leafId: fixture.manager.getLeafId(),
  });

  assert.deepEqual(resolved, {
    model: "gpt-5-mini",
    reasoningEffort: "medium",
  });

  fixture.cleanup();
});

test("buildWaitAgentContent exposes child assistant text in tool content", () => {
  const content = buildWaitAgentContent(
    [
      {
        agent_id: "agent-1",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "child done",
      },
      {
        agent_id: "agent-2",
        status: "failed",
        durable_status: "failed",
        cwd: "/tmp/project",
        last_error: "boom",
      },
    ],
    false,
  );

  assert.deepEqual(JSON.parse(content), {
    status: {
      "agent-1": "idle",
      "agent-2": "failed",
    },
    timed_out: false,
    agents: [
      {
        agent_id: "agent-1",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        last_assistant_text: "child done",
      },
      {
        agent_id: "agent-2",
        status: "failed",
        durable_status: "failed",
        cwd: "/tmp/project",
        last_error: "boom",
      },
    ],
  });
});

test("buildWaitAgentContent returns empty status when wait_agent times out", () => {
  const content = buildWaitAgentContent([], true);

  assert.deepEqual(JSON.parse(content), {
    status: {},
    timed_out: true,
    agents: [],
  });
});

test("getWaitAgentResultTitle reports timeout when no agent completed", () => {
  assert.equal(getWaitAgentResultTitle(true, 0), "Waiting timed out");
  assert.equal(getWaitAgentResultTitle(false, 0), "Agents finished");
  assert.equal(getWaitAgentResultTitle(true, 1), "Agent finished");
  assert.equal(getWaitAgentResultTitle(false, 2), "Agents finished");
});

test("buildSpawnAgentContent matches Codex JSON shape and preserves null nickname", () => {
  assert.deepEqual(JSON.parse(buildSpawnAgentContent("agent-1")), {
    agent_id: "agent-1",
    nickname: null,
  });

  assert.deepEqual(JSON.parse(buildSpawnAgentContent("agent-2", "explorer")), {
    agent_id: "agent-2",
    nickname: "explorer",
  });
});

test("buildSpawnAgentContent includes a completed agent snapshot for foreground spawn_agent calls", () => {
  assert.deepEqual(
    JSON.parse(
      buildSpawnAgentContent("agent-3", "reviewer", {
        agent_id: "agent-3",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        name: "reviewer",
        last_assistant_text: "child done",
      }),
    ),
    {
      agent_id: "agent-3",
      nickname: "reviewer",
      status: {
        "agent-3": "idle",
      },
      timed_out: false,
      agent: {
        agent_id: "agent-3",
        status: "idle",
        durable_status: "live_idle",
        cwd: "/tmp/project",
        name: "reviewer",
        last_assistant_text: "child done",
      },
      agents: [
        {
          agent_id: "agent-3",
          status: "idle",
          durable_status: "live_idle",
          cwd: "/tmp/project",
          name: "reviewer",
          last_assistant_text: "child done",
        },
      ],
    },
  );
});

test("buildSendInputContent matches Codex JSON shape", () => {
  assert.deepEqual(JSON.parse(buildSendInputContent("submission-1")), {
    submission_id: "submission-1",
  });
});

test("formatSubagentNotificationMessage wraps model-visible subagent status payloads", () => {
  const message = formatSubagentNotificationMessage({
    agent_id: "agent-1",
    status: "idle",
    durable_status: "live_idle",
    last_assistant_text: "child done",
  });

  assert.equal(SUBAGENT_NOTIFICATION_CUSTOM_TYPE, "subagent-notification");
  assert.match(message, /^<subagent_notification>\n/);
  assert.match(message, /\n<\/subagent_notification>$/);

  const payload = JSON.parse(message.split("\n")[1] ?? "{}");
  assert.deepEqual(payload, {
    agent_id: "agent-1",
    status: "idle",
    durable_status: "live_idle",
    last_assistant_text: "child done",
  });
});

test("rebuildDurableRegistry still accepts legacy codex entry types", () => {
  const records = rebuildDurableRegistry([
    {
      type: "custom",
      customType: "codex-subagent:create",
      data: {
        record: {
          agentId: "agent-legacy",
          cwd: "/tmp/project",
          status: "live_idle",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      },
    },
  ] as never);

  assert.equal(records.get("agent-legacy")?.agentId, "agent-legacy");
});

test("rebuildDurableRegistry preserves interactive transport on detached children", () => {
  const records = rebuildDurableRegistry([
    {
      type: "custom",
      customType: "subagent:detach",
      data: {
        record: {
          agentId: "agent-interactive",
          transport: "interactive",
          cwd: "/tmp/project",
          status: "detached",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:01:00.000Z",
          sessionFile: "/tmp/project/.pi/interactive.jsonl",
        },
      },
    },
  ] as never);

  assert.deepEqual(records.get("agent-interactive"), {
    agentId: "agent-interactive",
    transport: "interactive",
    cwd: "/tmp/project",
    status: "detached",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:01:00.000Z",
    sessionFile: "/tmp/project/.pi/interactive.jsonl",
  });
});

test("isResumable rejects interactive child records", () => {
  assert.equal(
    isResumable({
      agentId: "agent-interactive",
      transport: "interactive",
      cwd: "/tmp/project",
      status: "detached",
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z",
      sessionFile: "/tmp/project/.pi/interactive.jsonl",
    }),
    false,
  );
});

test("parseSubagentNotificationMessage extracts wrapped notification payloads", () => {
  assert.deepEqual(
    parseSubagentNotificationMessage(
      formatSubagentNotificationMessage({
        agent_id: "agent-1",
        status: "idle",
        durable_status: "live_idle",
        name: "amber-badger",
        last_assistant_text: "child done",
      }),
    ),
    {
      agent_id: "agent-1",
      status: "idle",
      durable_status: "live_idle",
      name: "amber-badger",
      last_assistant_text: "child done",
    },
  );

  assert.equal(parseSubagentNotificationMessage("not a wrapped payload"), undefined);
});

test("getSubagentNotificationDeliveryOptions steers notifications while parent is streaming", () => {
  assert.deepEqual(getSubagentNotificationDeliveryOptions(true), { deliverAs: "steer" });
  assert.deepEqual(getSubagentNotificationDeliveryOptions(false), { triggerTurn: true });
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
