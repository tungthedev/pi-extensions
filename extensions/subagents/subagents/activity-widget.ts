import type { Theme } from "@mariozechner/pi-coding-agent";

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import { getSubagentDisplayName } from "./rendering.ts";

export const SUBAGENT_ACTIVITY_WIDGET_KEY = "subagents:activity-widget";

const MAX_COLUMNS = 3;
const MAX_VISIBLE_ROWS = 3;
const MIN_COLUMN_WIDTH = 64;
const COLUMN_GAP = "  ";
const INPUT_SUMMARY_MAX_CHARS = 52;
const TIMER_TICK_MS = 1_000;

export type SubagentIdentity = {
  agent_id: string;
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
    return existing;
  }

  const next: SubagentActivityState = {
    agent_id: identity.agent_id,
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
  const bulletColor = activity.activeToolCalls > 0 ? "accent" : "text";
  const detailColor = activity.activeToolCalls > 0 ? "accent" : "toolOutput";
  const text = [
    `${theme.fg(bulletColor, "•")} ${theme.fg("accent", activity.displayName)}`,
    theme.fg("muted", formatSubagentActivityElapsed(now - activity.startedAt)),
    theme.fg("muted", formatCallCount(activity.toolCallsTotal)),
    theme.fg(detailColor, detailText(activity)),
  ].join(theme.fg("dim", " · "));
  return truncateToWidth(text, width);
}

export function chooseSubagentActivityColumnCount(count: number, innerWidth: number): number {
  const maxColumns = Math.min(MAX_COLUMNS, Math.max(1, count));
  const gapWidth = visibleWidth(COLUMN_GAP);
  for (let columns = maxColumns; columns >= 1; columns -= 1) {
    const cellWidth = Math.floor((innerWidth - gapWidth * (columns - 1)) / columns);
    if (columns === 1 || cellWidth >= MIN_COLUMN_WIDTH) {
      return columns;
    }
  }

  return 1;
}

function padLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  const padding = Math.max(0, width - visibleWidth(truncated));
  return `${truncated}${" ".repeat(padding)}`;
}

function layoutActivityRows(
  theme: Theme,
  activities: SubagentActivityView[],
  innerWidth: number,
  now: number,
): string[] {
  if (activities.length === 0) {
    return [];
  }

  const columns = chooseSubagentActivityColumnCount(activities.length, innerWidth);
  const gapWidth = visibleWidth(COLUMN_GAP);
  const cellWidth = Math.max(1, Math.floor((innerWidth - gapWidth * (columns - 1)) / columns));
  const rows: string[] = [];

  for (let start = 0; start < activities.length; start += columns) {
    const chunk = activities.slice(start, start + columns);
    const rendered = chunk.map((activity) =>
      padLine(renderSubagentActivityCell(theme, activity, cellWidth, now), cellWidth),
    );
    rows.push(rendered.join(COLUMN_GAP).trimEnd());
  }

  return rows;
}

function borderLabel(theme: Theme, label: string, maxWidth: number): string {
  return truncateToWidth(theme.fg("accent", label), maxWidth);
}

function topBorder(theme: Theme, innerWidth: number, title?: string): string {
  const borderColor = (text: string) => theme.fg("dim", text);
  if (!title) {
    return borderColor(`╭${"─".repeat(innerWidth)}╮`);
  }

  const renderedTitle = borderLabel(theme, title, Math.max(1, innerWidth - 3));
  const titleWidth = visibleWidth(renderedTitle);
  const fill = Math.max(0, innerWidth - titleWidth - 3);
  return borderColor("╭─ ") + renderedTitle + borderColor(` ${"─".repeat(fill)}╮`);
}

function renderBox(
  theme: Theme,
  width: number,
  title: string | undefined,
  lines: string[],
): string[] {
  if (!title && lines.length === 0) {
    return [];
  }

  if (width < 4) {
    const rawLines = title ? [title, ...lines] : lines;
    return rawLines.map((line) => truncateToWidth(line, width));
  }

  const innerWidth = Math.max(1, width - 2);
  const borderColor = (text: string) => theme.fg("dim", text);
  return [
    topBorder(theme, innerWidth, title),
    ...lines.map((line) => `${borderColor("│")}${padLine(line, innerWidth)}${borderColor("│")}`),
    borderColor(`╰${"─".repeat(innerWidth)}╯`),
  ];
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
  const innerWidth = Math.max(1, width - 2);
  const columns = chooseSubagentActivityColumnCount(sorted.length, innerWidth);
  const visibleActivities = sorted.slice(0, columns * MAX_VISIBLE_ROWS);
  const hiddenCount = sorted.length - visibleActivities.length;
  const totalCalls = sorted.reduce((sum, activity) => sum + activity.toolCallsTotal, 0);
  const title = `Agents active: ${sorted.length} · ${formatCallCount(totalCalls)} total`;
  const lines = layoutActivityRows(theme, visibleActivities, innerWidth, now);
  if (hiddenCount > 0) {
    lines.push(theme.fg("muted", `+${hiddenCount} more`));
  }

  return renderBox(theme, width, title, lines);
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
