import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createFindToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import path from "node:path";

import {
  findMatchingFiles,
  formatFindFilesOutput,
} from "../../codex-content/tools/find-files.ts";
import { shortenPath } from "../../codex-content/shared/text.ts";
import { resolveAbsolutePath } from "../../codex-content/tools/runtime.ts";

const DROID_GLOB_DESCRIPTION = `Advanced file path search using glob patterns with multiple pattern support and exclusions.
Uses ripgrep for high-performance file pattern matching.
Supports:
- Multiple inclusion patterns (OR logic)
- Exclusion patterns to filter out unwanted files
Common patterns:
- "*.ext" - all files with extension
- "**/*.ext" - all files with extension in any subdirectory
- "dir/**/*" - all files under directory
- "{*.js,*.ts}" - multiple extensions
- "!node_modules/**" - exclude pattern

PERFORMANCE TIP: When exploring codebases or discovering files for a task, make multiple speculative Glob tool calls in a single response to speed up the discovery phase. For example, search for different file types or directories that might be relevant to your task simultaneously.

Returns a list of matched file paths.

Never use 'glob' cli command directly via Execute tool, use this Glob tool instead. It's optimized for performance and handles multiple patterns and exclusions.`;

const DROID_GLOB_PARAMETERS = Type.Object({
  patterns: Type.Union([
    Type.String({
      description:
        'A glob pattern string or array of glob patterns to match file paths. Examples: "*.js", ["*.js", "*.ts"] for JavaScript and TypeScript files, ["src/**/*.tsx"] for React components in src, ["**/*.test.*"] for all test files.',
    }),
    Type.Array(Type.String()),
  ]),
  excludePatterns: Type.Optional(
    Type.Union([
      Type.String({
        description:
          'A glob pattern string or array of glob patterns to exclude from results. Example: "node_modules/**", ["node_modules/**", "dist/**", "*.min.js"]',
      }),
      Type.Array(Type.String()),
    ]),
  ),
  folder: Type.Optional(
    Type.String({
      description: "Absolute path to the directory to search in. If not specified, searches in the current working directory.",
    }),
  ),
});

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function renderGlobCall(theme: Theme, args: { folder?: string }): Text {
  return new Text(
    `${theme.fg("toolTitle", theme.bold("Glob "))}${theme.fg("accent", shortenPath(args.folder || "."))}`,
    0,
    0,
  );
}

export function registerDroidGlobTool(pi: ExtensionAPI): void {
  const nativeFindDefinition = createFindToolDefinition(process.cwd());

  pi.registerTool({
    name: "Glob",
    label: "Glob",
    description: DROID_GLOB_DESCRIPTION,
    parameters: DROID_GLOB_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePath(ctx.cwd, params.folder ?? ".");
      const includePatterns = asArray(params.patterns);
      const excludeRegexes = asArray(params.excludePatterns).map(globToRegExp);
      const matchMap = new Map<string, (Awaited<ReturnType<typeof findMatchingFiles>>)[number]>();

      for (const pattern of includePatterns) {
        const matches = await findMatchingFiles(searchPath, pattern);
        for (const match of matches) {
          const relativePath = path.relative(searchPath, match.absolutePath).replace(/\\/g, "/");
          if (excludeRegexes.some((regex) => regex.test(relativePath))) continue;
          matchMap.set(match.absolutePath, match);
        }
      }

      const matches = Array.from(matchMap.values()).sort((left, right) =>
        left.absolutePath.localeCompare(right.absolutePath),
      );

      return {
        content: [{ type: "text" as const, text: formatFindFilesOutput(matches) }],
        details: {
          patternCount: includePatterns.length,
          count: matches.length,
          path: searchPath,
        },
      };
    },
    renderCall(args, theme) {
      return renderGlobCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      return nativeFindDefinition.renderResult!(
        result as never,
        options,
        theme,
        context as never,
      );
    },
  });
}
