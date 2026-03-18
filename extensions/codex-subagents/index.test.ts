import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionManager } from "@mariozechner/pi-coding-agent";

import {
  applySpawnAgentProfile,
  buildSendInputContent,
  buildSpawnAgentContent,
  buildWaitAgentContent,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  deriveDurableStatusFromState,
  extractLastAssistantText,
  flattenCollabItems,
  formatSubagentNotificationMessage,
  generateUniqueSubagentName,
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  normalizeReasoningEffortToThinkingLevel,
  normalizeThinkingLevelToReasoningEffort,
  parseSubagentNotificationMessage,
  parseJsonLines,
  resolveAgentProfiles,
  rebuildDurableRegistry,
  resolveAgentIdAlias,
  resolveAgentIdsAlias,
  resolveForkContextSessionFile,
  resolveParentSpawnDefaults,
  resolveSubagentName,
  resolveSpawnPrompt,
  summarizeSubagentReply,
  truncateSubagentReply,
} from "./index.ts";

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

test("parseJsonLines returns completed lines and preserves the trailing partial line", () => {
  const parsed = parseJsonLines('{"a":1}\r\n{"b":2}\npartial');
  assert.deepEqual(parsed, {
    lines: ['{"a":1}', '{"b":2}'],
    rest: "partial",
  });
});

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
  assert.equal(deriveDurableStatusFromState({ isStreaming: false, pendingMessageCount: 0 }), "live_idle");
});

test("rebuildDurableRegistry reconstructs the latest durable record and normalizes live states", () => {
  const records = rebuildDurableRegistry([
    {
      type: "custom",
      customType: "codex-subagent:create",
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
      customType: "codex-subagent:update",
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
    cwd: "/tmp/project",
    status: "detached",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:01:00.000Z",
    sessionFile: "/tmp/project/.pi/session.jsonl",
  });
});

test("resolveAgentIdAlias and resolveAgentIdsAlias accept Codex and legacy field names", () => {
  assert.equal(resolveAgentIdAlias({ id: "agent-a" }), "agent-a");
  assert.equal(resolveAgentIdAlias({ agent_id: "agent-b" }), "agent-b");
  assert.deepEqual(
    resolveAgentIdsAlias({ id: "agent-a", ids: ["agent-b"], agent_ids: ["agent-b", "agent-c"] }),
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

  assert.deepEqual(resolved, { model: "gpt-5-mini", reasoningEffort: "medium" });

  fixture.cleanup();
});

test("generateUniqueSubagentName skips used aliases and falls back deterministically", () => {
  const name = generateUniqueSubagentName(["amber-badger", "amber-comet"], () => 0);
  assert.equal(name, "amber-crane");
});

test("resolveSubagentName uses explicit names and otherwise generates a unique alias", () => {
  assert.equal(
    resolveSubagentName(
      [
        {
          agentId: "agent-1",
          cwd: "/tmp/project",
          name: "amber-badger",
          status: "live_idle",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      ],
      "named-child",
    ),
    "named-child",
  );

  assert.notEqual(
    resolveSubagentName([
      {
        agentId: "agent-1",
        cwd: "/tmp/project",
        name: "amber-badger",
        status: "live_idle",
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
      },
    ]),
    "amber-badger",
  );
});

test("truncateSubagentReply limits previews to 50 lines and reports hidden rows", () => {
  const source = new Array(MAX_SUBAGENT_REPLY_PREVIEW_LINES + 3)
    .fill(0)
    .map((_, index) => `line ${index + 1}`)
    .join("\n");

  assert.deepEqual(truncateSubagentReply(source), {
    text: new Array(MAX_SUBAGENT_REPLY_PREVIEW_LINES)
      .fill(0)
      .map((_, index) => `line ${index + 1}`)
      .join("\n"),
    hiddenLineCount: 3,
  });
});

test("getSubagentDisplayName prefers alias over agent id", () => {
  assert.equal(getSubagentDisplayName({ agent_id: "agent-1", name: "amber-badger" }), "amber-badger");
  assert.equal(getSubagentDisplayName({ agent_id: "agent-2" }), "agent-2");
});

test("getSubagentDisplayName includes role when available", () => {
  assert.equal(
    getSubagentDisplayName({ agent_id: "agent-1", name: "amber-badger", agent_type: "explorer" }),
    "amber-badger [explorer]",
  );
  assert.equal(getSubagentDisplayName({ agent_id: "agent-2", agent_type: "worker" }), "[worker]");
});

test("applySpawnAgentProfile produces child bootstrap data for built-in roles", () => {
  const applied = applySpawnAgentProfile({
    requestedAgentType: "explorer",
    profiles: resolveAgentProfiles({ includeHidden: true }).profiles,
  });

  assert.equal(applied.agentType, "explorer");
  assert.equal(applied.bootstrap.name, "explorer");
  assert.equal(applied.bootstrap.developerInstructions, undefined);
});

test("summarizeSubagentReply flattens markdown into a compact one-line preview", () => {
  assert.equal(
    summarizeSubagentReply("# Title\n\n- first item\n- second item"),
    "# Title - first item - second item",
  );

  const long = `start ${"x".repeat(MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS + 20)}`;
  assert.match(summarizeSubagentReply(long) ?? "", /\.\.\.$/);
});

test("getSubagentCompletionLabel maps agent states to codex-like summaries", () => {
  assert.equal(getSubagentCompletionLabel("idle"), "Completed");
  assert.equal(getSubagentCompletionLabel("failed"), "Error");
  assert.equal(getSubagentCompletionLabel("timeout"), "Timed out");
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

  assert.equal(CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE, "codex-subagent-notification");
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
