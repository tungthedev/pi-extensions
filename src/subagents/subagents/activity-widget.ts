import type { Theme } from "@mariozechner/pi-coding-agent";

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import type { ChildTransport } from "./types.ts";

import { getSubagentDisplayName } from "./rendering.ts";

export const SUBAGENT_ACTIVITY_WIDGET_KEY = "subagents:activity-widget";

const MAX_COLUMNS = 3;
const MAX_VISIBLE_ROWS = 3;
const INPUT_SUMMARY_MAX_CHARS = 52;
const TIMER_TICK_MS = 1_000;
const BOX_HORIZONTAL_PADDING = 1;

export type SubagentIdentity = {
  agent_id: string;
  transport?: ChildTransport;
  agent_type?: string;
  name?: string;
};

type ActiveToolState = {
  toolName: string;
  startedAt: number;
};

export type SubagentActivityState = SubagentIdentity & {
  startedAt: number;
  toolCallsTotal: number;
  lastInputSummary?: string;
  lastToolActivityAt: number;
  lastToolName?: string;
  activeTools: Map<string, ActiveToolState>;
};

export type SubagentActivityView = SubagentIdentity & {
  displayName: string;
  startedAt: number;
  toolCallsTotal: number;
  activeToolCalls: number;
  activeToolName?: string;
  lastToolActivityAt: number;
  lastToolName?: string;
  lastInputSummary?: string;
};

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function summarizeSubagentActivityInput(
  input: string | undefined,
  maxChars = INPUT_SUMMARY_MAX_CHARS,
): string | undefined {
  const normalized = input
    ?.replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function ensureSubagentActivityState(
  activities: Map<string, SubagentActivityState>,
  identity: SubagentIdentity,
  now: number,
): SubagentActivityState {
  const existing = activities.get(identity.agent_id);
  if (existing) {
    existing.name = trimText(identity.name);
    existing.agent_type = trimText(identity.agent_type);
    existing.transport = identity.transport;
    return existing;
  }

  const next: SubagentActivityState = {
    agent_id: identity.agent_id,
    transport: identity.transport,
    name: trimText(identity.name),
    agent_type: trimText(identity.agent_type),
    startedAt: now,
    toolCallsTotal: 0,
    lastToolActivityAt: now,
    activeTools: new Map<string, ActiveToolState>(),
  };
  activities.set(identity.agent_id, next);
  return next;
}

export function markSubagentActivitySubmitted(
  activities: Map<string, SubagentActivityState>,
  identity: SubagentIdentity,
  input: string | undefined,
  now = Date.now(),
): void {
  const summary = summarizeSubagentActivityInput(input);
  activities.set(identity.agent_id, {
    agent_id: identity.agent_id,
    transport: identity.transport,
    name: trimText(identity.name),
    agent_type: trimText(identity.agent_type),
    startedAt: now,
    toolCallsTotal: 0,
    lastInputSummary: summary,
    lastToolActivityAt: now,
    activeTools: new Map<string, ActiveToolState>(),
  });
}

export function markSubagentActivityRunning(
  activities: Map<string, SubagentActivityState>,
  identity: SubagentIdentity,
  now = Date.now(),
): void {
  ensureSubagentActivityState(activities, identity, now);
}

export function markSubagentToolExecutionStart(
  activities: Map<string, SubagentActivityState>,
  identity: SubagentIdentity,
  toolCallId: string,
  toolName: string,
  now = Date.now(),
): void {
  const state = ensureSubagentActivityState(activities, identity, now);
  state.toolCallsTotal += 1;
  state.lastToolName = toolName;
  state.lastToolActivityAt = now;
  state.activeTools.set(toolCallId, { toolName, startedAt: now });
}

export function markSubagentToolExecutionEnd(
  activities: Map<string, SubagentActivityState>,
  agentId: string,
  toolCallId: string,
  toolName?: string,
  now = Date.now(),
): void {
  const state = activities.get(agentId);
  if (!state) {
    return;
  }

  if (toolName) {
    state.lastToolName = toolName;
  }
  state.lastToolActivityAt = now;
  state.activeTools.delete(toolCallId);
}

export function removeSubagentActivity(
  activities: Map<string, SubagentActivityState>,
  agentId: string,
): boolean {
  return activities.delete(agentId);
}

function latestActiveToolName(state: SubagentActivityState): string | undefined {
  let latest: ActiveToolState | undefined;
  for (const activeTool of state.activeTools.values()) {
    if (!latest || activeTool.startedAt >= latest.startedAt) {
      latest = activeTool;
    }
  }

  return latest?.toolName;
}

export function snapshotSubagentActivities(
  activities: Map<string, SubagentActivityState>,
): SubagentActivityView[] {
  return [...activities.values()].map((state) => ({
    agent_id: state.agent_id,
    transport: state.transport,
    agent_type: state.agent_type,
    name: state.name,
    displayName: getSubagentDisplayName(state),
    startedAt: state.startedAt,
    toolCallsTotal: state.toolCallsTotal,
    activeToolCalls: state.activeTools.size,
    activeToolName: latestActiveToolName(state),
    lastToolActivityAt: state.lastToolActivityAt,
    lastToolName: state.lastToolName,
    lastInputSummary: state.lastInputSummary,
  }));
}

export function sortSubagentActivityViews(
  activities: SubagentActivityView[],
): SubagentActivityView[] {
  return [...activities].sort((left, right) => {
    const leftActive = left.activeToolCalls > 0 ? 1 : 0;
    const rightActive = right.activeToolCalls > 0 ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    if (left.lastToolActivityAt !== right.lastToolActivityAt) {
      return right.lastToolActivityAt - left.lastToolActivityAt;
    }

    if (left.startedAt !== right.startedAt) {
      return right.startedAt - left.startedAt;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

export function formatSubagentActivityElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCallCount(count: number): string {
  return `${count} call${count === 1 ? "" : "s"}`;
}

function detailText(activity: SubagentActivityView): string {
  if (activity.transport === "interactive") {
    return "interactive session";
  }

  if (activity.activeToolName) {
    return activity.activeToolCalls > 1
      ? `${activity.activeToolName} +${activity.activeToolCalls - 1}`
      : activity.activeToolName;
  }

  if (activity.lastToolName) {
    return activity.lastToolName;
  }

  if (activity.lastInputSummary) {
    return activity.lastInputSummary;
  }

  return "thinking";
}

export function renderSubagentActivityCell(
  theme: Theme,
  activity: SubagentActivityView,
  width: number,
  now = Date.now(),
): string {
  if (activity.transport === "interactive") {
    const text = [
      theme.fg("accent", activity.displayName),
      theme.fg("muted", formatSubagentActivityElapsed(now - activity.startedAt)),
      theme.fg("toolOutput", "interactive session"),
    ].join(theme.fg("dim", " · "));
    return truncateToWidth(text, width);
  }

  const detailColor = activity.activeToolCalls > 0 ? "accent" : "toolOutput";
  const text = [
    theme.fg("accent", activity.displayName),
    theme.fg("muted", formatSubagentActivityElapsed(now - activity.startedAt)),
    theme.fg("muted", formatCallCount(activity.toolCallsTotal)),
    theme.fg(detailColor, detailText(activity)),
  ].join(theme.fg("dim", " · "));
  return truncateToWidth(text, width);
}

function padToWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

function renderBoxedLine(theme: Theme, line: string, width: number): string {
  if (width <= 2) {
    return truncateToWidth(line, width);
  }

  const contentWidth = Math.max(0, width - 2 - BOX_HORIZONTAL_PADDING * 2);
  const content = padToWidth(line, contentWidth);
  return `${theme.fg("muted", "│")}${" ".repeat(BOX_HORIZONTAL_PADDING)}${content}${" ".repeat(BOX_HORIZONTAL_PADDING)}${theme.fg("muted", "│")}`;
}

function renderBoxedSubagentActivityLines(theme: Theme, lines: string[], width: number): string[] {
  if (width <= 2) {
    return lines.map((line) => truncateToWidth(line, width));
  }

  const innerWidth = Math.max(0, width - 2);
  return [
    `${theme.fg("muted", "╭")}${theme.fg("muted", "─".repeat(innerWidth))}${theme.fg("muted", "╮")}`,
    ...lines.map((line) => renderBoxedLine(theme, line, width)),
    `${theme.fg("muted", "╰")}${theme.fg("muted", "─".repeat(innerWidth))}${theme.fg("muted", "╯")}`,
  ];
}

function layoutActivityTreeRows(
  theme: Theme,
  activities: SubagentActivityView[],
  width: number,
  now: number,
  hiddenCount: number,
): string[] {
  if (activities.length === 0) {
    return [];
  }

  return activities.map((activity, index) => {
    const hasMoreLine = hiddenCount > 0;
    const isLast = index === activities.length - 1 && !hasMoreLine;
    const prefix = theme.fg("dim", isLast ? "╰ " : "├ ");
    return truncateToWidth(
      `${prefix}${renderSubagentActivityCell(theme, activity, Math.max(1, width - 2), now)}`,
      width,
    );
  });
}

export function buildSubagentActivityWidgetLines(
  theme: Theme,
  activities: SubagentActivityView[],
  width: number,
  now = Date.now(),
): string[] {
  if (activities.length === 0) {
    return [];
  }

  const sorted = sortSubagentActivityViews(activities);
  const visibleLimit = MAX_COLUMNS * MAX_VISIBLE_ROWS;
  const hiddenAfterLimit = sorted.length - visibleLimit;
  const visibleCount = hiddenAfterLimit === 1 ? visibleLimit + 1 : visibleLimit;
  const visibleActivities = sorted.slice(0, visibleCount);
  const hiddenCount = sorted.length - visibleActivities.length;
  const contentWidth = Math.max(1, width - 2 - BOX_HORIZONTAL_PADDING * 2);
  const lines = layoutActivityTreeRows(theme, visibleActivities, contentWidth, now, hiddenCount);
  if (hiddenCount > 0) {
    lines.push(theme.fg("muted", `╰ +${hiddenCount} more`));
  }

  return [
    ...renderBoxedSubagentActivityLines(
      theme,
      [truncateToWidth(theme.fg("accent", "Agents"), contentWidth), ...lines],
      width,
    ),
    theme.fg("dim", " "),
  ];
}

export class SubagentActivityWidget {
  private cachedWidth?: number;
  private cachedVersion?: number;
  private cachedTick?: number;
  private cachedLines?: string[];
  private readonly interval: ReturnType<typeof setInterval>;

  constructor(
    private readonly tui: { requestRender(): void },
    private readonly theme: Theme,
    private readonly getActivities: () => SubagentActivityView[],
    private readonly getVersion: () => number,
  ) {
    this.interval = setInterval(() => {
      if (this.getActivities().length > 0) {
        this.tui.requestRender();
      }
    }, TIMER_TICK_MS);
    this.interval.unref?.();
  }

  requestRender(): void {
    this.invalidate();
    this.tui.requestRender();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedVersion = undefined;
    this.cachedTick = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {
    clearInterval(this.interval);
  }

  render(width: number): string[] {
    const activities = this.getActivities();
    const version = this.getVersion();
    const tick = activities.length > 0 ? Math.floor(Date.now() / 1_000) : -1;
    if (
      this.cachedLines &&
      this.cachedWidth === width &&
      this.cachedVersion === version &&
      this.cachedTick === tick
    ) {
      return this.cachedLines;
    }

    const lines = buildSubagentActivityWidgetLines(this.theme, activities, width);
    this.cachedWidth = width;
    this.cachedVersion = version;
    this.cachedTick = tick;
    this.cachedLines = lines;
    return lines;
  }
}
