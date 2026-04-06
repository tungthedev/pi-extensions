import type { Theme, ToolResultEvent } from "@mariozechner/pi-coding-agent";

import type {
  ExplorationGroup,
  ExplorationItem,
  ExplorationSummaryItem,
  ExplorationToolName,
} from "./types.ts";

import { titleLine } from "../renderers/common.ts";
import { isErrorText, previewLines, shortenPath } from "../shared/text.ts";
import { EXPLORATION_TOOL_NAMES } from "./types.ts";

const MAX_VISIBLE_EXPLORATION_ITEMS = 5;
const MAX_VISIBLE_COMPLETED_GROUPS = 3;

type ExplorationSummaryCounts = {
  read: number;
  search: number;
  list: number;
};

type ExplorationContentItem = {
  type?: string;
  text?: string;
};

function explorationTreeLine(theme: Theme, text: string, branch: "tee" | "end"): string {
  const prefix = branch === "end" ? "  └ " : "  ├ ";
  return `${theme.fg("dim", prefix)}${theme.fg("text", text)}`;
}

function explorationContinuationLine(theme: Theme, text: string): string {
  return `${theme.fg("dim", "  │ ")}${theme.fg("text", text)}`;
}

function emptyExplorationCounts(): ExplorationSummaryCounts {
  return { read: 0, search: 0, list: 0 };
}

function isReadToolName(toolName: ExplorationToolName): boolean {
  return toolName === "read" || toolName === "read_file";
}

function explorationSummaryCategory(toolName: ExplorationToolName): keyof ExplorationSummaryCounts {
  if (isReadToolName(toolName)) {
    return "read";
  }

  if (toolName === "ls" || toolName === "list_dir") {
    return "list";
  }

  return "search";
}

export function summarizeExplorationCounts(items: ExplorationItem[]): ExplorationSummaryCounts {
  const counts = emptyExplorationCounts();

  for (const item of items) {
    counts[explorationSummaryCategory(item.toolName)] += 1;
  }

  return counts;
}

function summarizeExplorationDetailCounts(details: string[]): ExplorationSummaryCounts {
  const counts = emptyExplorationCounts();

  for (const detail of details) {
    if (detail.startsWith("Read ")) {
      counts.read += 1;
      continue;
    }

    if (detail.startsWith("List ")) {
      counts.list += 1;
      continue;
    }

    counts.search += 1;
  }

  return counts;
}

export function formatExplorationCountSummary(
  prefix: string,
  counts: ExplorationSummaryCounts,
): string {
  const parts: string[] = [];

  if (counts.read > 0) {
    parts.push(`Read x${counts.read}`);
  }
  if (counts.search > 0) {
    parts.push(`Search x${counts.search}`);
  }
  if (counts.list > 0) {
    parts.push(`List x${counts.list}`);
  }

  if (parts.length === 0) {
    return prefix;
  }

  return `${prefix}: ${parts.join(", ")}`;
}

export function explorationSummaryLine(
  theme: Theme,
  prefix: string,
  items: ExplorationItem[],
): string {
  return theme.fg(
    "accent",
    formatExplorationCountSummary(prefix, summarizeExplorationCounts(items)),
  );
}

function formatReadTarget(args: {
  path?: string;
  file_path?: string;
  offset?: number;
  limit?: number;
}): string {
  const targetPath = shortenPath(args.path ?? args.file_path);
  if (args.offset === undefined && args.limit === undefined) {
    return `Read ${targetPath}`;
  }

  const start = args.offset ?? 1;
  const end = args.limit ? start + args.limit - 1 : undefined;
  return `Read ${targetPath}:${start}${end ? `-${end}` : ""}`;
}

function formatSearchTarget(args: { pattern?: string; path?: string; glob?: string }): string {
  const pattern = args.pattern ? `/${args.pattern}/` : "pattern";
  const targetPath = shortenPath(args.path || ".");
  const glob = args.glob ? ` (${args.glob})` : "";
  return `Search ${pattern} in ${targetPath}${glob}`;
}

function formatFindTarget(args: { pattern?: string; path?: string }): string {
  const pattern = args.pattern || "*";
  const targetPath = shortenPath(args.path || ".");
  return `Search ${pattern} in ${targetPath}`;
}

function formatListTarget(args: { path?: string; dir_path?: string }): string {
  return `List ${shortenPath(args.dir_path || args.path || ".")}`;
}

function explorationDetailFromArgs(
  toolName: ExplorationToolName,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "read":
    case "read_file":
      return formatReadTarget(
        args as { path?: string; file_path?: string; offset?: number; limit?: number },
      );
    case "grep":
      return formatSearchTarget(args as { pattern?: string; path?: string; glob?: string });
    case "grep_files":
      return formatSearchTarget({
        pattern: args.pattern as string | undefined,
        path: args.path as string | undefined,
        glob: args.include as string | undefined,
      });
    case "find":
    case "find_files":
      return formatFindTarget(args as { pattern?: string; path?: string });
    case "ls":
    case "list_dir":
      return formatListTarget(args as { path?: string; dir_path?: string });
  }
}

export function isExplorationToolName(toolName: string): toolName is ExplorationToolName {
  return EXPLORATION_TOOL_NAMES.has(toolName);
}

function explorationHeader(hasFailures: boolean, presentTense: boolean): string {
  if (hasFailures && presentTense) {
    return "Exploring failed";
  }
  if (hasFailures) {
    return "Explore failed";
  }
  if (presentTense) {
    return "Exploring";
  }
  return "Explored";
}

function previewLimit(expanded: boolean): number {
  return expanded ? 4 : 2;
}

function shouldMergeReadSummary(
  previous: ExplorationSummaryItem | undefined,
  current: ExplorationItem,
): boolean {
  if (!previous || previous.failed || current.failed) {
    return false;
  }

  if (!previous.detail.startsWith("Read ")) {
    return false;
  }

  return isReadToolName(current.toolName);
}

function mergeReadDetails(details: string[]): string {
  const names = new Set<string>();

  for (const detail of details) {
    const name = detail.replace(/^Read\s+/, "").trim();
    if (!name) {
      continue;
    }

    names.add(name);
  }

  if (names.size === 0) {
    return "Read";
  }

  return `Read ${[...names].join(", ")}`;
}

export function summarizeExplorationItems(items: ExplorationItem[]): ExplorationSummaryItem[] {
  const summarized: ExplorationSummaryItem[] = [];

  for (const item of items) {
    const previous = summarized[summarized.length - 1];
    if (shouldMergeReadSummary(previous, item)) {
      previous.detail = mergeReadDetails([previous.detail, item.detail]);
      continue;
    }

    summarized.push({
      detail: item.detail,
      failed: item.failed,
      errorPreview: item.errorPreview,
    });
  }

  return summarized;
}

function visibleExplorationItems(
  items: ExplorationSummaryItem[],
  expanded: boolean,
): { visibleItems: ExplorationSummaryItem[]; hiddenCount: number } {
  if (expanded) {
    return { visibleItems: items, hiddenCount: 0 };
  }

  const visibleItems = items.slice(-MAX_VISIBLE_EXPLORATION_ITEMS);
  return {
    visibleItems,
    hiddenCount: items.length - visibleItems.length,
  };
}

export function explorationGroupLines(
  theme: Theme,
  group: ExplorationGroup,
  expanded: boolean,
  presentTense = false,
): string[] {
  const hasFailures = group.items.some((item) => item.failed);
  const lines = [
    titleLine(theme, hasFailures ? "error" : "text", explorationHeader(hasFailures, presentTense)),
  ];
  const summarizedItems = summarizeExplorationItems(group.items);
  const { visibleItems, hiddenCount } = visibleExplorationItems(summarizedItems, expanded);

  if (!expanded && hiddenCount > 0) {
    const branch = visibleItems.length === 0 ? "end" : "tee";
    lines.push(explorationTreeLine(theme, `... ${hiddenCount} more`, branch));
  }

  for (const [index, item] of visibleItems.entries()) {
    const branch = index === visibleItems.length - 1 ? "end" : "tee";
    lines.push(explorationTreeLine(theme, item.detail, branch));

    if (!item.failed || !item.errorPreview?.length) {
      continue;
    }

    for (const preview of item.errorPreview.slice(0, previewLimit(expanded))) {
      lines.push(explorationContinuationLine(theme, preview));
    }
  }

  return lines;
}

export function combinedExplorationSummaryLines(
  theme: Theme,
  groups: ExplorationGroup[],
): string[] {
  const visibleGroups = groups.slice(-MAX_VISIBLE_COMPLETED_GROUPS);
  const items = visibleGroups.flatMap((group) => group.items);
  if (items.length === 0) {
    return [];
  }

  const hiddenGroups = groups.length - visibleGroups.length;
  const summary = formatExplorationCountSummary("Explored", summarizeExplorationCounts(items));
  const suffix =
    hiddenGroups > 0 ? ` (+${hiddenGroups} earlier group${hiddenGroups === 1 ? "" : "s"})` : "";
  return [theme.fg("accent", `${summary}${suffix}`)];
}

export function liveExplorationSummary(group: ExplorationGroup): string {
  const prefix = group.items.some((item) => item.failed) ? "Explore failed" : "Exploring";
  return formatExplorationCountSummary(prefix, summarizeExplorationCounts(group.items));
}

function explorationResultText(content: ExplorationContentItem[]): string {
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .replace(/\r/g, "")
    .trim();
}

function buildExplorationItem(
  toolName: ExplorationToolName,
  detail: string,
  content: ExplorationContentItem[],
  isError = false,
): ExplorationItem {
  const text = explorationResultText(content);
  const failed = isError || isErrorText(text);

  return {
    toolName,
    detail,
    failed,
    errorPreview: failed ? previewLines(text, 3) : undefined,
  };
}

function resultContent(result: unknown): ExplorationContentItem[] {
  if (!Array.isArray((result as { content?: unknown })?.content)) {
    return [];
  }

  return (result as { content: ExplorationContentItem[] }).content ?? [];
}

export function explorationItemFromEvent(event: ToolResultEvent): ExplorationItem | undefined {
  if (!isExplorationToolName(event.toolName)) {
    return undefined;
  }

  return buildExplorationItem(
    event.toolName,
    explorationDetailFromArgs(event.toolName, event.input),
    event.content,
    event.isError,
  );
}

function explorationItemFromExecutionEnd(
  toolName: string,
  detail: string | undefined,
  result: unknown,
  isError: boolean,
): ExplorationItem | undefined {
  if (!isExplorationToolName(toolName)) {
    return undefined;
  }

  return buildExplorationItem(toolName, detail ?? toolName, resultContent(result), isError);
}

export class ExplorationTracker {
  private explorationGroups: ExplorationGroup[] = [];
  private explorationToolGroupIndexByCallId = new Map<string, number>();
  private activeExplorationToolCallIds = new Set<string>();
  private activeExplorationDetailByCallId = new Map<string, string>();
  private recordedExplorationResultCallIds = new Set<string>();
  private lastStartedToolKind: "exploration" | "other" | null = null;

  reset(): void {
    this.explorationGroups = [];
    this.explorationToolGroupIndexByCallId.clear();
    this.clearActiveTracking();
    this.recordedExplorationResultCallIds.clear();
    this.lastStartedToolKind = null;
  }

  onToolExecutionStart(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): boolean {
    if (!isExplorationToolName(toolName)) {
      this.lastStartedToolKind = "other";
      return false;
    }

    const groupIndex = this.ensureActiveGroup();
    this.explorationToolGroupIndexByCallId.set(toolCallId, groupIndex);
    this.activeExplorationToolCallIds.add(toolCallId);
    this.activeExplorationDetailByCallId.set(toolCallId, explorationDetailFromArgs(toolName, args));
    this.lastStartedToolKind = "exploration";
    return true;
  }

  onToolResult(event: ToolResultEvent): boolean {
    const item = explorationItemFromEvent(event);
    if (!item) {
      return false;
    }

    const group = this.groupForToolCallId(event.toolCallId);
    if (!group) {
      return false;
    }

    group.items.push(item);
    this.recordedExplorationResultCallIds.add(event.toolCallId);
    return true;
  }

  onToolExecutionEnd(
    toolCallId: string,
    toolName: string,
    result?: unknown,
    isError = false,
  ): boolean {
    if (!isExplorationToolName(toolName)) {
      return false;
    }

    if (!this.recordedExplorationResultCallIds.has(toolCallId)) {
      this.recordExecutionEndItem(toolCallId, toolName, result, isError);
    }

    this.clearToolCallTracking(toolCallId);
    return true;
  }

  finalize(): void {
    this.clearActiveTracking();
  }

  hasActiveExploration(): boolean {
    return this.activeExplorationToolCallIds.size > 0;
  }

  latestActiveExplorationGroup(): ExplorationGroup | null {
    const activeIndexes = this.activeExplorationGroupIndexes();

    for (let index = activeIndexes.length - 1; index >= 0; index -= 1) {
      const group = this.explorationGroups[activeIndexes[index]];
      if (group?.items.length) {
        return group;
      }
    }

    return null;
  }

  completedExplorationGroups(): ExplorationGroup[] {
    const activeIndexes = new Set(this.activeExplorationGroupIndexes());
    return this.explorationGroups.filter(
      (group, index) => group.items.length > 0 && !activeIndexes.has(index),
    );
  }

  liveExplorationStatusText(): string | undefined {
    const details = this.activeExplorationDetails();
    const latestGroup = this.latestActiveExplorationGroup();

    if (details.length === 0) {
      return latestGroup ? liveExplorationSummary(latestGroup) : undefined;
    }

    const prefix = latestGroup?.items.some((item) => item.failed) ? "Explore failed" : "Exploring";
    return formatExplorationCountSummary(prefix, summarizeExplorationDetailCounts(details));
  }

  private ensureActiveGroup(): number {
    if (this.lastStartedToolKind !== "exploration") {
      this.explorationGroups.push({ items: [] });
    }

    return this.explorationGroups.length - 1;
  }

  private groupForToolCallId(toolCallId: string): ExplorationGroup | undefined {
    const groupIndex = this.explorationToolGroupIndexByCallId.get(toolCallId);
    if (groupIndex === undefined) {
      return undefined;
    }

    return this.explorationGroups[groupIndex];
  }

  private recordExecutionEndItem(
    toolCallId: string,
    toolName: ExplorationToolName,
    result: unknown,
    isError: boolean,
  ): void {
    const group = this.groupForToolCallId(toolCallId);
    if (!group) {
      return;
    }

    const detail = this.activeExplorationDetailByCallId.get(toolCallId);
    const item = explorationItemFromExecutionEnd(toolName, detail, result, isError);
    if (!item) {
      return;
    }

    group.items.push(item);
    this.recordedExplorationResultCallIds.add(toolCallId);
  }

  private clearToolCallTracking(toolCallId: string): void {
    this.explorationToolGroupIndexByCallId.delete(toolCallId);
    this.activeExplorationToolCallIds.delete(toolCallId);
    this.activeExplorationDetailByCallId.delete(toolCallId);
    this.recordedExplorationResultCallIds.delete(toolCallId);
  }

  private clearActiveTracking(): void {
    this.activeExplorationToolCallIds.clear();
    this.activeExplorationDetailByCallId.clear();
  }

  private activeExplorationDetails(): string[] {
    const details: string[] = [];

    for (const toolCallId of this.activeExplorationToolCallIds) {
      const detail = this.activeExplorationDetailByCallId.get(toolCallId);
      if (!detail) {
        continue;
      }

      details.push(detail);
    }

    return details;
  }

  private activeExplorationGroupIndexes(): number[] {
    const indexes = new Set<number>();

    for (const toolCallId of this.activeExplorationToolCallIds) {
      const groupIndex = this.explorationToolGroupIndexByCallId.get(toolCallId);
      if (groupIndex === undefined) {
        continue;
      }

      indexes.add(groupIndex);
    }

    return [...indexes].sort((left, right) => left - right);
  }
}
