import type { Theme } from "@mariozechner/pi-coding-agent";

import { type Component, Text } from "@mariozechner/pi-tui";

import { renderEmptySlot } from "./common.ts";
import { shortenPath } from "../text.ts";

export type ToolTextContent = {
  type?: string;
  text?: string;
};

export type ToolLikeResult = {
  content?: ToolTextContent[];
  details?: unknown;
};

export type ToolRenderOptions = {
  expanded: boolean;
  isPartial: boolean;
};

export type ToolRenderContext = {
  isError?: boolean;
  args?: Record<string, unknown>;
  lastComponent?: unknown;
};

export type NativeRenderResult = (
  result: unknown,
  options: ToolRenderOptions,
  theme: Theme,
  context: ToolRenderContext,
) => Component;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDetailsRecord(result: ToolLikeResult | undefined): Record<string, unknown> {
  return isRecord(result?.details) ? result.details : {};
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countLines(content: unknown): number | undefined {
  return typeof content === "string" ? content.split("\n").length : undefined;
}

function extractTextContent(result: ToolLikeResult | undefined): string {
  const item = result?.content?.find((candidate) => candidate?.type === "text");
  return item?.type === "text" && typeof item.text === "string" ? item.text : "";
}

function collectGrepStats(text: string): { matchCount: number; fileCount: number } {
  if (!text || text.trim() === "" || text.trim() === "No matches found") {
    return { matchCount: 0, fileCount: 0 };
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const files = new Set<string>();
  let matchCount = 0;

  for (const line of lines) {
    const match = line.match(/^(.*?):\d+(?::|-)/);
    if (!match) continue;
    matchCount += 1;
    files.add(match[1]);
  }

  if (matchCount === 0) {
    for (const line of lines) {
      files.add(line);
    }

    return { matchCount: lines.length, fileCount: files.size };
  }

  return { matchCount, fileCount: files.size };
}

function getCount(result: ToolLikeResult): number {
  return Number(getDetailsRecord(result).count ?? 0);
}

export function renderToolLabel(theme: Theme, title: string, detail: string): Text {
  return new Text(
    `${theme.fg("toolTitle", theme.bold(`${title} `))}${theme.fg("accent", detail)}`,
    0,
    0,
  );
}

export function renderSummaryLine(
  theme: Theme,
  summary: string,
  options: { expandable?: boolean } = {},
): Text {
  const expandable = options.expandable ?? true;
  return new Text(
    expandable ? `${summary}${theme.fg("dim", " (ctrl+o to expand)")}` : summary,
    0,
    0,
  );
}

export function decorateGrepResultWithStats<T extends ToolLikeResult>(
  result: T,
): T & { details: Record<string, unknown> & { matchCount: number; fileCount: number } } {
  const stats = collectGrepStats(extractTextContent(result));

  return {
    ...result,
    details: {
      ...getDetailsRecord(result),
      matchCount: stats.matchCount,
      fileCount: stats.fileCount,
    },
  };
}

export function formatReadCallDetail(args: {
  path?: string;
  offset?: number;
  limit?: number;
}): string {
  const targetPath = shortenPath(args.path || ".");
  if (args.offset === undefined && args.limit === undefined) {
    return targetPath;
  }

  const start = args.offset ?? 1;
  const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
  return `${targetPath}:${start}${end ? `-${end}` : ""}`;
}

export function formatWriteCallDetail(args: {
  path?: string;
  content?: string;
}): string {
  const targetPath = shortenPath(args.path || ".");
  const lines = countLines(args.content);
  return typeof lines === "number" ? `${targetPath} (${lines} lines)` : targetPath;
}

export function formatEditCallDetail(args: {
  path?: string;
  edits?: unknown[];
}): string {
  const targetPath = shortenPath(args.path || ".");
  const edits = Array.isArray(args.edits) ? args.edits.length : undefined;
  return typeof edits === "number" ? `${targetPath} (${edits} updates)` : targetPath;
}

export function formatPatternInPathDetail(args: {
  pattern?: string;
  path?: string;
  fallbackPattern?: string;
}): string {
  return `${args.pattern || args.fallbackPattern || ""} in ${shortenPath(args.path || ".")}`;
}

export function formatListCallDetail(args: { path?: string }): string {
  return shortenPath(args.path || ".");
}

export function summarizeFindCount(result: ToolLikeResult): string {
  return `Found ${pluralize(getCount(result), "file")}`;
}

export function summarizeListCount(result: ToolLikeResult): string {
  const count = getCount(result);
  return `Found ${count} ${count === 1 ? "entry" : "entries"}`;
}

export function summarizeMatchingFileCount(result: ToolLikeResult): string {
  return `Found ${pluralize(getCount(result), "matching file", "matching files")}`;
}

export function summarizeGrepResult(result: ToolLikeResult): string {
  const text = extractTextContent(result);
  if (text.trim() === "No matches found") {
    return "No matches found";
  }

  const details = getDetailsRecord(result);
  if (typeof details?.matchCount === "number" && typeof details?.fileCount === "number") {
    return `Matched ${pluralize(details.matchCount, "line")} in ${pluralize(details.fileCount, "file")}`;
  }

  return "Search completed";
}

export function buildHiddenCollapsedRenderer(options: {
  title: string;
  getDetail(args: Record<string, unknown>): string;
  nativeRenderResult: NativeRenderResult;
  renderExpanded?: NativeRenderResult;
}): {
  renderCall(args: Record<string, unknown>, theme: Theme): Text;
  renderResult(
    result: unknown,
    renderOptions: ToolRenderOptions,
    theme: Theme,
    context: ToolRenderContext,
  ): Component;
} {
  return {
    renderCall(args, theme) {
      return renderToolLabel(theme, options.title, options.getDetail(args));
    },
    renderResult(result, renderOptions, theme, context) {
      if (context.isError) {
        return options.nativeRenderResult(result, renderOptions, theme, context);
      }

      if (!renderOptions.expanded) {
        return renderEmptySlot();
      }

      const renderExpanded = options.renderExpanded ?? options.nativeRenderResult;
      return renderExpanded(result, renderOptions, theme, context);
    },
  };
}

export function buildSummaryRenderer(options: {
  title: string;
  getDetail(args: Record<string, unknown>): string;
  summarize(result: ToolLikeResult): string;
  nativeRenderResult: NativeRenderResult;
  expandable?: boolean;
}): {
  renderCall(args: Record<string, unknown>, theme: Theme): Text;
  renderResult(
    result: unknown,
    renderOptions: ToolRenderOptions,
    theme: Theme,
    context: ToolRenderContext,
  ): Component;
} {
  return {
    renderCall(args, theme) {
      return renderToolLabel(theme, options.title, options.getDetail(args));
    },
    renderResult(result, renderOptions, theme, context) {
      if (context.isError || renderOptions.expanded) {
        return options.nativeRenderResult(result, renderOptions, theme, context);
      }

      return renderSummaryLine(theme, options.summarize(result as ToolLikeResult), {
        expandable: options.expandable,
      });
    },
  };
}
