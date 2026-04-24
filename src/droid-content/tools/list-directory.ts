import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createLsToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import {
  formatListDirectoryOutput,
  scanDirectoryEntries,
  type ListDirectoryEntry,
} from "../../shared/file-tools/list-dir.ts";
import {
  buildSummaryRenderer,
  formatListCallDetail,
  summarizeListCount,
} from "../../shared/renderers/tool-renderers.ts";
import { resolveAbsolutePathWithVariants } from "../../shared/runtime-paths.ts";

const DROID_LIST_DIRECTORY_DESCRIPTION = `List the contents of a directory with optional pattern-based filtering.
Prefer usage of 'Grep' and 'Glob' tools, for more targeted searches.
Supports ignore patterns to exclude unwanted files and directories.
Requires absolute directory paths when specified.`;

const DROID_LIST_DIRECTORY_PARAMETERS = Type.Object({
  directory_path: Type.Optional(
    Type.String({
      description:
        "The absolute path to the directory to list (must be absolute, not relative). Defaults to current working directory if not provided.",
    }),
  ),
  ignorePatterns: Type.Optional(
    Type.Array(
      Type.String({ description: "Ignore glob pattern" }),
      {
        description:
          'Array of glob patterns to ignore when listing files and directories. Example: ["node_modules/**", "*.log", ".git/**"]',
      },
    ),
  ),
});

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function normalizeEntryPath(entry: ListDirectoryEntry): string {
  return entry.relativePath.replace(/[/@]$/, "");
}

function filterIgnoredEntries(
  entries: ListDirectoryEntry[],
  ignorePatterns: string[] | undefined,
): ListDirectoryEntry[] {
  if (!ignorePatterns?.length) return entries;

  const regexes = ignorePatterns.map(globToRegExp);
  return entries.filter((entry) => {
    const candidate = normalizeEntryPath(entry);
    return !regexes.some((regex) => regex.test(candidate));
  });
}

export function registerDroidListDirectoryTool(pi: ExtensionAPI): void {
  const nativeLsDefinition = createLsToolDefinition(process.cwd());
  const renderer = buildSummaryRenderer({
    title: "List",
    getDetail: (args) =>
      formatListCallDetail({ path: args.directory_path as string | undefined }),
    summarize: summarizeListCount,
    nativeRenderResult: (result, options, theme, context) =>
      nativeLsDefinition.renderResult!(result as never, options, theme, context as never),
  });

  pi.registerTool({
    name: "LS",
    label: "List",
    description: DROID_LIST_DIRECTORY_DESCRIPTION,
    parameters: DROID_LIST_DIRECTORY_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const absolutePath = resolveAbsolutePathWithVariants(ctx.cwd, params.directory_path ?? ".");
      const scan = await scanDirectoryEntries(absolutePath, 2);
      const visibleEntries = filterIgnoredEntries(scan.entries, params.ignorePatterns);

      return {
        content: [
          {
            type: "text" as const,
            text: formatListDirectoryOutput(absolutePath, visibleEntries, {
              skippedCount: scan.skippedCount,
            }),
          },
        ],
        details: {
          dirPath: absolutePath,
          count: visibleEntries.length,
          skippedCount: scan.skippedCount,
        },
      };
    },
    renderCall(args, theme) {
      return renderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return renderer.renderResult(result, options, theme, context);
    },
  });
}
