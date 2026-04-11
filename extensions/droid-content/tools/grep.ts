import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createGrepToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  execCommand,
  normalizeRipgrepGlob,
  resolveAbsolutePathWithVariants,
  resolvePiToolPath,
  trimToBudget,
} from "../../shared/runtime-paths.ts";
import { renderEmptySlot } from "../../shared/renderers/common.ts";
import { shortenPath } from "../../shared/text.ts";

const DROID_GREP_DESCRIPTION = `High-performance file content search using ripgrep. Wrapper around ripgrep with comprehensive parameter support.

Supports ripgrep parameters:
- Pattern matching with regex support
- File type filtering (--type js, --type py, etc.)
- Glob pattern filtering (--glob "*.js")
- Case-insensitive search (-i)
- Context lines (-A, -B, -C for after/before/around context)
- Line numbers (-n)
- Multiline mode (-U --multiline-dotall)
- Custom search directories

Output modes:
- file_paths: Returns only matching file paths (default, fast)
- content: Returns matching lines with optional context, line numbers, and formatting

PERFORMANCE TIP: When exploring codebases or searching for patterns, make multiple speculative Grep tool calls in a single response to speed up the discovery phase. For example, search for different patterns, file types, or directories simultaneously.

Returns search results based on the selected output mode.`;

const DROID_GREP_PARAMETERS = Type.Object({
  pattern: Type.String({
    description:
      "A search pattern to match in file contents. Can be a literal string or a regular expression. Supports ripgrep regex syntax.",
  }),
  path: Type.Optional(
    Type.String({
      description: "Absolute path to a file or directory to search in. If not specified, searches in the current working directory.",
    }),
  ),
  glob_pattern: Type.Optional(
    Type.String({
      description:
        'Glob pattern to filter files. Example: "*.js" for JavaScript files, "**/*.tsx" for React components. Maps to ripgrep --glob parameter.',
    }),
  ),
  output_mode: Type.Optional(
    Type.Union([Type.Literal("file_paths"), Type.Literal("content")], {
      description:
        'Output format: "file_paths" returns only matching file paths, "content" returns matching lines with context. Content mode supports -A/-B/-C context, -n line numbers, head_limit.',
    }),
  ),
  case_insensitive: Type.Optional(
    Type.Boolean({ description: "Perform case-insensitive matching (ripgrep -i flag)." }),
  ),
  type: Type.Optional(
    Type.String({
      description:
        'Ripgrep file type filter for common file types (ripgrep --type flag). Examples: "js" for JavaScript, "py" for Python, "rust" for Rust, "cpp" for C++.',
    }),
  ),
  context_before: Type.Optional(Type.Number({ description: "Number of lines to show before each match (ripgrep -B flag). Only works with output_mode=\"content\"." })),
  context_after: Type.Optional(Type.Number({ description: "Number of lines to show after each match (ripgrep -A flag). Only works with output_mode=\"content\"." })),
  context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (ripgrep -C flag). Only works with output_mode=\"content\"." })),
  line_numbers: Type.Optional(Type.Boolean({ description: 'Show line numbers in output (ripgrep -n flag). Only works with output_mode="content".' })),
  head_limit: Type.Optional(Type.Number({ description: "Limit output to first N lines/entries. Works with both output modes." })),
  multiline: Type.Optional(Type.Boolean({ description: "Enable multiline mode where . matches newlines and patterns can span lines (ripgrep -U --multiline-dotall)." })),
  fixed_string: Type.Optional(Type.Boolean({ description: "Treat the pattern as a literal string instead of a regular expression (ripgrep -F flag). Useful for searching special characters like ?, *, etc." })),
});

type DroidGrepParams = {
  pattern: string;
  glob_pattern?: string;
  output_mode?: "file_paths" | "content";
  context_before?: number;
  context_after?: number;
  context?: number;
  line_numbers?: boolean;
  case_insensitive?: boolean;
  type?: string;
  head_limit?: number;
  multiline?: boolean;
  fixed_string?: boolean;
};

function buildDroidGrepArgs(params: DroidGrepParams, searchPath: string): string[] {
  const args = [
    "--hidden",
    "--color=never",
    "--no-messages",
    "--glob",
    "!**/.git/**",
    "--glob",
    "!**/.jj/**",
  ];

  if (params.glob_pattern) args.push("--glob", normalizeRipgrepGlob(params.glob_pattern));
  if (params.type) args.push("--type", params.type);
  if (params.case_insensitive) args.push("-i");
  if (params.multiline) args.push("-U", "--multiline-dotall");
  if (params.fixed_string) args.push("-F");

  if ((params.output_mode ?? "file_paths") === "file_paths") {
    args.push("--files-with-matches");
  } else {
    if (params.context_before) args.push("-B", String(params.context_before));
    if (params.context_after) args.push("-A", String(params.context_after));
    if (params.context) args.push("-C", String(params.context));
    if (params.line_numbers !== false) args.push("-n");
  }

  if (typeof params.head_limit === "number") args.push("-m", String(params.head_limit));

  args.push(params.pattern, searchPath);
  return args;
}

function renderGrepCall(theme: Theme, args: { pattern?: string; path?: string }): Text {
  return new Text(
    `${theme.fg("toolTitle", theme.bold("Grep "))}${theme.fg("accent", `${args.pattern || ""} in ${shortenPath(args.path || ".")}`)}`,
    0,
    0,
  );
}

export function registerDroidGrepTool(pi: ExtensionAPI): void {
  const nativeGrepDefinition = createGrepToolDefinition(process.cwd());

  pi.registerTool({
    name: "Grep",
    label: "Grep",
    description: DROID_GREP_DESCRIPTION,
    parameters: DROID_GREP_PARAMETERS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePathWithVariants(ctx.cwd, params.path ?? ".");
      const rgPath = resolvePiToolPath("rg");
      if (!rgPath) {
        throw new Error("ripgrep (rg) is not available in Pi's managed bin directory or on PATH");
      }

      const result = await execCommand(
        rgPath,
        buildDroidGrepArgs(
          {
            pattern: params.pattern,
            glob_pattern: params.glob_pattern,
            output_mode: params.output_mode,
            context_before: params.context_before,
            context_after: params.context_after,
            context: params.context,
            line_numbers: params.line_numbers,
            case_insensitive: params.case_insensitive,
            type: params.type,
            head_limit: params.head_limit,
            multiline: params.multiline,
            fixed_string: params.fixed_string,
          },
          searchPath,
        ),
        searchPath,
        { signal },
      );

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
      }

      const text = result.exitCode === 1 ? "No matches found" : result.stdout;
      const trimmed = trimToBudget(text);
      return {
        content: [{ type: "text" as const, text: trimmed.text }],
        details: {
          path: searchPath,
          pattern: params.pattern,
          outputMode: params.output_mode ?? "file_paths",
        },
      };
    },
    renderCall(args, theme) {
      return renderGrepCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      if (context.isError) {
        return nativeGrepDefinition.renderResult!(
          result as never,
          options,
          theme,
          context as never,
        );
      }

      if (!options.expanded) {
        return renderEmptySlot();
      }

      return nativeGrepDefinition.renderResult!(
        result as never,
        options,
        theme,
        context as never,
      );
    },
  });
}
