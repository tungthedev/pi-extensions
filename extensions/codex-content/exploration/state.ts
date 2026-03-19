import type { Theme, ToolResultEvent } from "@mariozechner/pi-coding-agent";

import type { ExplorationGroup, ExplorationItem } from "./types.ts";

import { titleLine } from "../renderers/common.ts";
import { firstLine, isErrorText, previewLines, shortenPath } from "../shared/text.ts";
import { EXPLORATION_TOOL_NAMES } from "./types.ts";

const MAX_VISIBLE_EXPLORATION_ITEMS = 5;
const MAX_VISIBLE_COMPLETED_GROUPS = 3;

type ExplorationSummaryCounts = {
  read: number;
  search: number;
  list: number;
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

function explorationSummaryCategory(
  toolName: ExplorationItem["toolName"],
): keyof ExplorationSummaryCounts {
  if (toolName === "read" || toolName === "read_file") return "read";
  if (toolName === "ls" || toolName === "list_dir") return "list";
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
    if (detail.startsWith("Read ")) counts.read += 1;
    else if (detail.startsWith("List ")) counts.list += 1;
    else counts.search += 1;
  }
  return counts;
}

export function formatExplorationCountSummary(
  prefix: string,
  counts: ExplorationSummaryCounts,
): string {
  const parts = [
    counts.read > 0 ? `Read x${counts.read}` : undefined,
    counts.search > 0 ? `Search x${counts.search}` : undefined,
    counts.list > 0 ? `List x${counts.list}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? `${prefix}: ${parts.join(", ")}` : prefix;
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
  const path = shortenPath(args.path ?? args.file_path);
  if (args.offset === undefined && args.limit === undefined) {
    return `Read ${path}`;
  }

  const start = args.offset ?? 1;
  const end = args.limit ? start + args.limit - 1 : undefined;
  return `Read ${path}:${start}${end ? `-${end}` : ""}`;
}

function formatSearchTarget(args: { pattern?: string; path?: string; glob?: string }): string {
  const pattern = args.pattern ? `/${args.pattern}/` : "pattern";
  const path = shortenPath(args.path || ".");
  const glob = args.glob ? ` (${args.glob})` : "";
  return `Search ${pattern} in ${path}${glob}`;
}

function formatGrepFilesTarget(args: {
  pattern?: string;
  path?: string;
  include?: string;
}): string {
  return formatSearchTarget({ pattern: args.pattern, path: args.path, glob: args.include });
}

function formatFindTarget(args: { pattern?: string; path?: string }): string {
  const pattern = args.pattern || "*";
  const path = shortenPath(args.path || ".");
  return `Find ${pattern} in ${path}`;
}

function formatListTarget(args: { path?: string; dir_path?: string }): string {
  return `List ${shortenPath(args.dir_path || args.path || ".")}`;
}

export function isExplorationToolName(toolName: string): toolName is ExplorationItem["toolName"] {
  return EXPLORATION_TOOL_NAMES.has(toolName);
}

export function explorationGroupLines(
  theme: Theme,
  group: ExplorationGroup,
  expanded: boolean,
  presentTense = false,
): string[] {
  const hasFailures = group.items.some((item) => item.failed);
  const header = hasFailures
    ? presentTense
      ? "Exploring failed"
      : "Explore failed"
    : presentTense
      ? "Exploring"
      : "Explored";
  const lines = [titleLine(theme, hasFailures ? "error" : "text", header)];

  const summarizedItems = summarizeExplorationItems(group.items);
  const visibleItems = expanded
    ? summarizedItems
    : summarizedItems.slice(-MAX_VISIBLE_EXPLORATION_ITEMS);
  const hiddenCount = summarizedItems.length - visibleItems.length;

  if (!expanded && hiddenCount > 0) {
    const isOnlyRow = visibleItems.length === 0;
    lines.push(explorationTreeLine(theme, `... ${hiddenCount} more`, isOnlyRow ? "end" : "tee"));
  }

  for (const [index, item] of visibleItems.entries()) {
    const isLastItem = index === visibleItems.length - 1;
    lines.push(explorationTreeLine(theme, item.detail, isLastItem ? "end" : "tee"));
    if (item.failed && item.errorPreview?.length) {
      for (const preview of item.errorPreview.slice(0, expanded ? 4 : 2)) {
        lines.push(explorationContinuationLine(theme, preview));
      }
    }
  }

  return lines;
}

type ExplorationSummaryItem = Pick<ExplorationItem, "detail" | "failed" | "errorPreview">;

function canMergeReadItems(left: ExplorationItem, right: ExplorationItem): boolean {
  if (left.failed || right.failed) return false;
  const leftIsRead = left.toolName === "read" || left.toolName === "read_file";
  const rightIsRead = right.toolName === "read" || right.toolName === "read_file";
  return leftIsRead && rightIsRead;
}

function mergeReadDetails(details: string[]): string {
  const names = [
    ...new Set(details.map((detail) => detail.replace(/^Read\s+/, "").trim()).filter(Boolean)),
  ];
  return names.length > 0 ? `Read ${names.join(", ")}` : "Read";
}

export function summarizeExplorationItems(items: ExplorationItem[]): ExplorationSummaryItem[] {
  const summarized: ExplorationSummaryItem[] = [];

  for (const item of items) {
    const previous = summarized[summarized.length - 1];
    if (
      previous &&
      canMergeReadItems(
        {
          toolName: "read_file",
          detail: previous.detail,
          failed: previous.failed,
          errorPreview: previous.errorPreview,
        },
        item,
      ) &&
      previous.detail.startsWith("Read ")
    ) {
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

export function combinedExplorationSummaryLines(
  theme: Theme,
  groups: ExplorationGroup[],
): string[] {
  const visibleGroups = groups.slice(-MAX_VISIBLE_COMPLETED_GROUPS);
  const items = visibleGroups.flatMap((group) => group.items);
  if (items.length === 0) return [];

  const hiddenGroups = groups.length - visibleGroups.length;
  const summary = formatExplorationCountSummary("Explored", summarizeExplorationCounts(items));
  return [
    hiddenGroups > 0
      ? theme.fg(
          "accent",
          `${summary} (+${hiddenGroups} earlier group${hiddenGroups === 1 ? "" : "s"})`,
        )
      : theme.fg("accent", summary),
  ];
}

export function liveExplorationSummary(group: ExplorationGroup): string {
  const prefix = group.items.some((item) => item.failed) ? "Explore failed" : "Exploring";
  return formatExplorationCountSummary(prefix, summarizeExplorationCounts(group.items));
}

function explorationDetailFromArgs(
  toolName: ExplorationItem["toolName"],
  args: Record<string, unknown>,
): string {
  return toolName === "read" || toolName === "read_file"
    ? formatReadTarget(
        args as { path?: string; file_path?: string; offset?: number; limit?: number },
      )
    : toolName === "grep"
      ? formatSearchTarget(args as { pattern?: string; path?: string; glob?: string })
      : toolName === "grep_files"
        ? formatGrepFilesTarget(args as { pattern?: string; path?: string; include?: string })
        : toolName === "find" || toolName === "find_files"
          ? formatFindTarget(args as { pattern?: string; path?: string })
          : formatListTarget(args as { path?: string; dir_path?: string });
}

export function explorationItemFromEvent(event: ToolResultEvent): ExplorationItem | undefined {
  if (
    event.toolName !== "read" &&
    event.toolName !== "read_file" &&
    event.toolName !== "grep" &&
    event.toolName !== "grep_files" &&
    event.toolName !== "find" &&
    event.toolName !== "find_files" &&
    event.toolName !== "ls" &&
    event.toolName !== "list_dir"
  ) {
    return undefined;
  }

  const detail = explorationDetailFromArgs(event.toolName, event.input);
  return explorationItemFromResult(event.toolName, detail, event.content, event.isError);
}

function explorationResultText(content: Array<{ type?: string; text?: string }>): string {
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .replace(/\r/g, "")
    .trim();
}

function explorationItemFromResult(
  toolName: ExplorationItem["toolName"],
  detail: string,
  content: Array<{ type?: string; text?: string }>,
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

function explorationItemFromExecutionEnd(
  toolName: string,
  detail: string | undefined,
  result: unknown,
  isError: boolean,
): ExplorationItem | undefined {
  if (!isExplorationToolName(toolName)) {
    return undefined;
  }

  const content = Array.isArray((result as { content?: unknown })?.content)
    ? ((result as { content: Array<{ type?: string; text?: string }> }).content ?? [])
    : [];

  return explorationItemFromResult(toolName, detail ?? toolName, content, isError);
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
    this.activeExplorationToolCallIds.clear();
    this.activeExplorationDetailByCallId.clear();
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

    if (this.lastStartedToolKind !== "exploration") {
      this.explorationGroups.push({ items: [] });
    }
    const groupIndex = this.explorationGroups.length - 1;
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

    const groupIndex = this.explorationToolGroupIndexByCallId.get(event.toolCallId);
    if (groupIndex === undefined) {
      return false;
    }

    const group = this.explorationGroups[groupIndex];
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
      const groupIndex = this.explorationToolGroupIndexByCallId.get(toolCallId);
      const group = groupIndex === undefined ? undefined : this.explorationGroups[groupIndex];
      const detail = this.activeExplorationDetailByCallId.get(toolCallId);
      const item = explorationItemFromExecutionEnd(toolName, detail, result, isError);

      if (group && item) {
        group.items.push(item);
        this.recordedExplorationResultCallIds.add(toolCallId);
      }
    }

    this.activeExplorationToolCallIds.delete(toolCallId);
    this.activeExplorationDetailByCallId.delete(toolCallId);
    this.recordedExplorationResultCallIds.delete(toolCallId);
    return true;
  }

  finalize(): void {
    this.activeExplorationToolCallIds.clear();
    this.activeExplorationDetailByCallId.clear();
  }

  hasActiveExploration(): boolean {
    return this.activeExplorationToolCallIds.size > 0;
  }

  latestActiveExplorationGroup(): ExplorationGroup | null {
    const indexes = this.activeExplorationGroupIndexes();
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const group = this.explorationGroups[indexes[i]];
      if (group && group.items.length > 0) {
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
    const latestGroup = this.latestActiveExplorationGroup();
    const prefix = latestGroup?.items.some((item) => item.failed) ? "Explore failed" : "Exploring";

    const details = [...this.activeExplorationToolCallIds]
      .map((toolCallId) => this.activeExplorationDetailByCallId.get(toolCallId))
      .filter((detail): detail is string => Boolean(detail));

    if (details.length === 0) {
      return latestGroup ? liveExplorationSummary(latestGroup) : undefined;
    }

    return formatExplorationCountSummary(prefix, summarizeExplorationDetailCounts(details));
  }

  private activeExplorationGroupIndexes(): number[] {
    const indexes = new Set<number>();
    for (const toolCallId of this.activeExplorationToolCallIds) {
      const groupIndex = this.explorationToolGroupIndexByCallId.get(toolCallId);
      if (groupIndex !== undefined) {
        indexes.add(groupIndex);
      }
    }
    return [...indexes].sort((a: number, b: number) => a - b);
  }
}

void firstLine;
