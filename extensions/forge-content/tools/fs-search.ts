import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  execCommand,
  normalizeRipgrepGlob,
  resolveAbsolutePathWithVariants,
  resolvePiToolPath,
  trimToBudget,
} from "../../codex-content/compatibility-tools/runtime.ts";

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
};

function buildFsSearchArgs(params: ForgeSearchParams, searchPath: string): string[] {
  const args = ["--hidden", "--color=never", "--no-messages", "--glob", "!**/.git/**", "--glob", "!**/.jj/**"];

  const outputMode = params.output_mode ?? "files_with_matches";
  if (outputMode === "files_with_matches") {
    args.push("--files-with-matches");
  } else if (outputMode === "count") {
    args.push("--count");
  }

  if (params.glob) args.push("--glob", normalizeRipgrepGlob(params.glob));
  if (params.file_type) args.push("--type", params.file_type);
  if (params.case_insensitive) args.push("-i");
  if (params.multiline) args.push("-U", "--multiline-dotall");
  if (outputMode === "content") {
    if (params.before_context) args.push("-B", String(params.before_context));
    if (params.after_context) args.push("-A", String(params.after_context));
    if (params.context) args.push("-C", String(params.context));
    if (params.show_line_numbers !== false) args.push("-n");
  }

  args.push(params.pattern, searchPath);
  return args;
}

function applyOffsetAndLimit(output: string, offset = 0, limit?: number): { text: string; lineCount: number } {
  const lines = output.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
  const visible = lines.slice(offset, limit !== undefined ? offset + limit : undefined);
  return {
    text: visible.join("\n"),
    lineCount: visible.length,
  };
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

      const sliced = applyOffsetAndLimit(result.stdout, Math.max(0, params.offset ?? 0), params.head_limit);
      const text = sliced.text || (result.exitCode === 1 ? "No matches found" : "No visible matches");
      const trimmed = trimToBudget(text);
      const details: ForgeSearchResultDetails = {
        path: searchPath,
        outputMode: params.output_mode ?? "files_with_matches",
        lineCount: sliced.lineCount,
        truncated: trimmed.truncated,
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
      const details = result.details as ForgeSearchResultDetails | undefined;
      if (!expanded) {
        const summary = details ? `${details.outputMode} ${details.lineCount} line(s)` : "search complete";
        return new Text(theme.fg("muted", summary), 0, 0);
      }
      return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
    },
  });
}

export { applyOffsetAndLimit, buildFsSearchArgs };
