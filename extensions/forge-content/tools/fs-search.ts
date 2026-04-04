import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  execCommand,
  normalizeRipgrepGlob,
  resolveAbsolutePathWithVariants,
  resolvePiToolPath,
  trimToBudget,
} from "../../codex-content/tools/runtime.ts";
import { expandHintLine, renderLines } from "../../codex-content/renderers/common.ts";

export type ForgeSearchOutputMode = "content" | "files_with_matches" | "count";

type ForgeSearchParams = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: ForgeSearchOutputMode;
  before_context?: number;
  after_context?: number;
  context?: number;
  show_line_numbers?: boolean;
  case_insensitive?: boolean;
  file_type?: string;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
};

type ForgeSearchResultDetails = {
  path: string;
  outputMode: ForgeSearchOutputMode;
  lineCount: number;
  truncated: boolean;
  fileCount: number;
  matchCount: number;
};

type LooseForgeSearchResultDetails = ForgeSearchResultDetails & {
  output_mode?: ForgeSearchOutputMode;
  line_count?: number;
  file_count?: number;
  match_count?: number;
};

function baseFsSearchArgs(params: ForgeSearchParams): string[] {
  const args = ["--hidden", "--color=never", "--no-messages", "--glob", "!**/.git/**", "--glob", "!**/.jj/**"];

  if (params.glob) args.push("--glob", normalizeRipgrepGlob(params.glob));
  if (params.file_type) args.push("--type", params.file_type);
  if (params.case_insensitive) args.push("-i");
  if (params.multiline) args.push("-U", "--multiline-dotall");

  return args;
}

function buildFsSearchArgs(params: ForgeSearchParams, searchPath: string): string[] {
  const args = baseFsSearchArgs(params);
  const outputMode = params.output_mode ?? "files_with_matches";
  if (outputMode === "files_with_matches") {
    args.push("--files-with-matches");
  } else if (outputMode === "count") {
    args.push("--count");
  }

  if (outputMode === "content") {
    if (params.before_context) args.push("-B", String(params.before_context));
    if (params.after_context) args.push("-A", String(params.after_context));
    if (params.context) args.push("-C", String(params.context));
    if (params.show_line_numbers !== false) args.push("-n");
  }

  args.push(params.pattern, searchPath);
  return args;
}

function buildFsSearchCountArgs(params: ForgeSearchParams, searchPath: string): string[] {
  return [...baseFsSearchArgs(params), "--count-matches", "-H", params.pattern, searchPath];
}

function applyOffsetAndLimit(output: string, offset = 0, limit?: number): { text: string; lineCount: number } {
  const lines = output.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
  const visible = lines.slice(offset, limit !== undefined ? offset + limit : undefined);
  return {
    text: visible.join("\n"),
    lineCount: visible.length,
  };
}

function countVisibleResultLines(result: { content?: Array<{ type?: string; text?: string }> }): number | undefined {
  const text = result.content?.[0]?.type === "text" ? result.content[0].text : undefined;
  if (typeof text !== "string") return undefined;

  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
  return lines.length;
}

function pluralize(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "match") return "matches";
  return `${label}s`;
}

function parseCountMatchesOutput(output: string): { fileCount: number; matchCount: number } {
  const lines = output.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
  let fileCount = 0;
  let matchCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const withPathMatch = /^(.*):(\d+)$/.exec(trimmed);
    if (withPathMatch) {
      fileCount += 1;
      matchCount += Number.parseInt(withPathMatch[2] ?? "0", 10);
      continue;
    }

    if (/^\d+$/.test(trimmed)) {
      fileCount += 1;
      matchCount += Number.parseInt(trimmed, 10);
    }
  }

  return { fileCount, matchCount };
}

async function collectFsSearchCounts(
  rgPath: string,
  params: ForgeSearchParams,
  searchPath: string,
  signal?: AbortSignal,
): Promise<{ fileCount: number; matchCount: number }> {
  const result = await execCommand(rgPath, buildFsSearchCountArgs(params, searchPath), searchPath, { signal });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
  }

  return parseCountMatchesOutput(result.stdout);
}

function hasVisibleFsSearchRows(result: {
  content?: Array<{ type?: string; text?: string }>;
}): boolean {
  const text = result.content?.[0]?.type === "text" ? result.content[0].text?.trim() ?? "" : "";
  return text.length > 0 && text !== "No matches found" && text !== "No visible matches";
}

export function formatFsSearchSummary(result: {
  details?: unknown;
  content?: Array<{ type?: string; text?: string }>;
}): string {
  const details =
    result.details && typeof result.details === "object"
      ? (result.details as LooseForgeSearchResultDetails | Record<string, unknown>)
      : undefined;
  const firstContent = result.content?.[0];
  const text = firstContent?.type === "text" ? firstContent.text?.trim() ?? "" : "";
  if (text === "No matches found") return text;

  const outputMode =
    typeof details?.outputMode === "string"
      ? details.outputMode
      : (typeof details?.output_mode === "string" ? details.output_mode : undefined);
  const lineCount =
    typeof details?.lineCount === "number"
      ? details.lineCount
      : (typeof details?.line_count === "number" ? details.line_count : countVisibleResultLines(result));
  const fileCount =
    typeof details?.fileCount === "number"
      ? details.fileCount
      : (typeof details?.file_count === "number" ? details.file_count : undefined);
  const matchCount =
    typeof details?.matchCount === "number"
      ? details.matchCount
      : (typeof details?.match_count === "number" ? details.match_count : undefined);

  if (outputMode === "content") {
    if (matchCount !== undefined) {
      return `Found ${matchCount} ${pluralize("match", matchCount)}`;
    }
    if (lineCount !== undefined) {
      return `Showing ${lineCount} result ${pluralize("line", lineCount)}`;
    }
  }

  if (outputMode === "files_with_matches") {
    const totalFiles = fileCount ?? lineCount;
    if (totalFiles !== undefined) {
      return `Found matches in ${totalFiles} ${pluralize("file", totalFiles)}`;
    }
  }

  if (outputMode === "count") {
    if (matchCount !== undefined && fileCount !== undefined) {
      return `Found ${matchCount} ${pluralize("match", matchCount)} in ${fileCount} ${pluralize("file", fileCount)}`;
    }
    if (lineCount !== undefined) {
      return `Found counts for ${lineCount} ${pluralize("file", lineCount)}`;
    }
  }

  if (lineCount !== undefined) {
    return `Showing ${lineCount} result ${pluralize("line", lineCount)}`;
  }

  return "search complete";
}

export function registerForgeFsSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fs_search",
    label: "fs_search",
    description:
      "Regex search over the local workspace using ripgrep. Supports matching content, listing matching files, and counting matches.",
    promptSnippet: "Search files and content with ripgrep-style regex",
    promptGuidelines: [
      "Prefer fs_search over shell grep/find for codebase search tasks.",
      "Use files_with_matches for discovery and content mode for targeted inspection.",
    ],
    parameters: Type.Object({
      pattern: Type.String({ description: "Regular expression to search for." }),
      path: Type.Optional(Type.String({ description: "Optional file or directory path to search." })),
      glob: Type.Optional(Type.String({ description: "Optional glob filter for candidate files." })),
      output_mode: Type.Optional(
        Type.Union([
          Type.Literal("content"),
          Type.Literal("files_with_matches"),
          Type.Literal("count"),
        ]),
      ),
      before_context: Type.Optional(Type.Number()),
      after_context: Type.Optional(Type.Number()),
      context: Type.Optional(Type.Number()),
      show_line_numbers: Type.Optional(Type.Boolean()),
      case_insensitive: Type.Optional(Type.Boolean()),
      file_type: Type.Optional(Type.String()),
      head_limit: Type.Optional(Type.Number()),
      offset: Type.Optional(Type.Number()),
      multiline: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePathWithVariants(ctx.cwd, params.path ?? ".");
      const rgPath = resolvePiToolPath("rg");
      if (!rgPath) {
        throw new Error("ripgrep (rg) is not available in Pi's managed bin directory or on PATH");
      }

      const result = await execCommand(rgPath, buildFsSearchArgs(params, searchPath), searchPath, { signal });
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
      }

      const counts =
        result.exitCode === 1
          ? { fileCount: 0, matchCount: 0 }
          : await collectFsSearchCounts(rgPath, params, searchPath, signal);
      const sliced = applyOffsetAndLimit(result.stdout, Math.max(0, params.offset ?? 0), params.head_limit);
      const text = sliced.text || (result.exitCode === 1 ? "No matches found" : "No visible matches");
      const trimmed = trimToBudget(text);
      const details: ForgeSearchResultDetails = {
        path: searchPath,
        outputMode: params.output_mode ?? "files_with_matches",
        lineCount: sliced.lineCount,
        truncated: trimmed.truncated,
        fileCount: counts.fileCount,
        matchCount: counts.matchCount,
      };

      return {
        content: [{ type: "text", text: trimmed.text }],
        details,
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("fs_search "))}${theme.fg("accent", args.pattern)}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme) {
      if (!expanded) {
        const summary = theme.fg("muted", formatFsSearchSummary(result));
        if (hasVisibleFsSearchRows(result)) {
          return renderLines([summary, expandHintLine(theme)]);
        }
        return new Text(summary, 0, 0);
      }
      return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
    },
  });
}

export { applyOffsetAndLimit, buildFsSearchArgs };
