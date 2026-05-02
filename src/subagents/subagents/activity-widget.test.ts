import type { Theme } from "@mariozechner/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubagentActivityWidgetLines,
  sortSubagentActivityViews,
  type SubagentActivityView,
} from "./activity-widget.ts";

const theme = {
  fg: (color: string, text: string) => (color === "dim" && text === " " ? "<dim> </dim>" : text),
  bold: (text: string) => text,
} as unknown as Theme;

function activity(
  overrides: Partial<SubagentActivityView> & Pick<SubagentActivityView, "agent_id">,
): SubagentActivityView {
  return {
    agent_id: overrides.agent_id,
    transport: overrides.transport,
    displayName: overrides.displayName ?? overrides.agent_id,
    startedAt: overrides.startedAt ?? 1_000,
    toolCallsTotal: overrides.toolCallsTotal ?? 0,
    activeToolCalls: overrides.activeToolCalls ?? 0,
    activeToolName: overrides.activeToolName,
    lastToolActivityAt: overrides.lastToolActivityAt ?? 1_000,
    lastToolName: overrides.lastToolName,
    lastInputSummary: overrides.lastInputSummary,
    agent_type: overrides.agent_type,
    name: overrides.name,
  };
}

test("sortSubagentActivityViews prioritizes active tools and latest tool activity", () => {
  const sorted = sortSubagentActivityViews([
    activity({ agent_id: "slow", displayName: "slow", lastToolActivityAt: 100, startedAt: 50 }),
    activity({
      agent_id: "recent-idle",
      displayName: "recent-idle",
      lastToolActivityAt: 300,
      startedAt: 60,
    }),
    activity({
      agent_id: "active",
      displayName: "active",
      activeToolCalls: 1,
      activeToolName: "read_file",
      lastToolActivityAt: 200,
      startedAt: 70,
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.agent_id),
    ["active", "recent-idle", "slow"],
  );
});

test("buildSubagentActivityWidgetLines renders an unboxed activity tree", () => {
  const activities = [
    activity({
      agent_id: "a",
      displayName: "badger [explorer]",
      toolCallsTotal: 6,
      lastToolName: "read_file",
    }),
    activity({
      agent_id: "b",
      displayName: "otter [worker]",
      toolCallsTotal: 4,
      lastToolName: "bash",
    }),
    activity({
      agent_id: "c",
      displayName: "ember [reviewer]",
      toolCallsTotal: 3,
      lastToolName: "grep_files",
    }),
  ];

  const wide = buildSubagentActivityWidgetLines(theme, activities, 170, 61_000);
  const narrow = buildSubagentActivityWidgetLines(theme, activities, 46, 61_000);

  assert.equal(wide.length, 5);
  assert.equal(narrow.length, 5);
  assert.equal(wide[0], "Agents");
  assert.equal(wide.at(-1), "<dim> </dim>");
  assert.doesNotMatch(wide.join("\n"), /Agents active|calls total|[╭╮╰╯│]/);
});

test("buildSubagentActivityWidgetLines renders a single hidden agent instead of plus one more", () => {
  const lines = buildSubagentActivityWidgetLines(
    theme,
    [
      activity({
        agent_id: "a",
        displayName: "badger [explorer]",
        activeToolCalls: 1,
        activeToolName: "read_file",
        lastToolActivityAt: 400,
      }),
      activity({
        agent_id: "b",
        displayName: "otter [worker]",
        lastToolActivityAt: 300,
        toolCallsTotal: 4,
        lastToolName: "bash",
      }),
      activity({
        agent_id: "c",
        displayName: "ember [reviewer]",
        lastToolActivityAt: 200,
        toolCallsTotal: 3,
        lastToolName: "grep_files",
      }),
      activity({
        agent_id: "d",
        displayName: "reed [worker]",
        lastToolActivityAt: 100,
        toolCallsTotal: 1,
        lastInputSummary: "inspect auth flow",
      }),
      activity({
        agent_id: "e",
        displayName: "spruce [explorer]",
        lastToolActivityAt: 90,
        toolCallsTotal: 2,
        lastToolName: "find_files",
      }),
      activity({
        agent_id: "f",
        displayName: "moss [worker]",
        lastToolActivityAt: 80,
        toolCallsTotal: 2,
        lastToolName: "bash",
      }),
      activity({
        agent_id: "g",
        displayName: "pine [reviewer]",
        lastToolActivityAt: 70,
        toolCallsTotal: 1,
        lastToolName: "read_file",
      }),
    ],
    170,
    61_000,
  );

  const rendered = lines.join("\n");
  assert.match(rendered, /badger \[explorer\]/);
  assert.match(rendered, /otter \[worker\]/);
  assert.match(rendered, /ember \[reviewer\]/);
  assert.match(rendered, /reed \[worker\]/);
  assert.match(rendered, /spruce \[explorer\]/);
  assert.match(rendered, /moss \[worker\]/);
  assert.match(rendered, /pine \[reviewer\]/);
  assert.doesNotMatch(rendered, /\+1 more/);
});

test("buildSubagentActivityWidgetLines renders the tenth agent instead of plus one more", () => {
  const activities = Array.from({ length: 10 }, (_, index) =>
    activity({
      agent_id: `agent-${index + 1}`,
      displayName: `agent-${index + 1}`,
      lastToolActivityAt: 1_000 - index,
      toolCallsTotal: index + 1,
      lastToolName: "bash",
    }),
  );

  const lines = buildSubagentActivityWidgetLines(theme, activities, 260, 61_000);
  const rendered = lines.join("\n");

  assert.match(rendered, /agent-1/);
  assert.match(rendered, /agent-9/);
  assert.match(rendered, /agent-10/);
  assert.doesNotMatch(rendered, /\+1 more/);
});

test("buildSubagentActivityWidgetLines renders interactive agents without tool telemetry", () => {
  const lines = buildSubagentActivityWidgetLines(
    theme,
    [
      activity({
        agent_id: "interactive-1",
        transport: "interactive",
        displayName: "planner [default]",
        toolCallsTotal: 0,
      }),
    ],
    120,
    61_000,
  );

  const rendered = lines.join("\n");
  assert.match(rendered, /^Agents$/m);
  assert.doesNotMatch(rendered, /calls total/);
  assert.match(rendered, /interactive session/);
  assert.doesNotMatch(rendered, /thinking/);
});
