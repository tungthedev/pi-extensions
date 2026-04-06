import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createFindToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

import { shortenPath } from "../shared/text.ts";
import {
  normalizeCommandOutputPaths,
  statSortedFileMatches,
  type TimedFileMatch,
} from "./file-match-utils.ts";
import {
  execCommand,
  normalizeRipgrepGlob,
  resolvePiToolPath,
  resolveAbsolutePath,
  trimToBudget,
} from "./runtime.ts";

export type FindFilesMatch = TimedFileMatch;

export function formatFindFilesOutput(
  matches: FindFilesMatch[],
  options: { offset?: number; limit?: number } = {},
): string {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 100;
  const visible = matches.slice(offset, offset + limit);

  if (matches.length === 0) {
    return "No files found matching pattern";
  }

  const lines = [`${matches.length} matching file${matches.length === 1 ? "" : "s"}`];
  lines.push(...visible.map((match) => match.absolutePath));

  if (offset + visible.length < matches.length) {
    lines.push(
      "",
      `[Showing ${offset + 1}-${offset + visible.length} of ${matches.length} matches. Use offset ${offset + visible.length} to continue.]`,
    );
  }

  return lines.join("\n");
}

type FindSearchScope = {
  searchRoot: string;
  fileFilter?: string;
};

async function resolveFindSearchScope(searchPath: string): Promise<FindSearchScope> {
  const stats = await fs.stat(searchPath);

  if (stats.isDirectory()) {
    return { searchRoot: searchPath };
  }

  return {
    searchRoot: path.dirname(searchPath),
    fileFilter: searchPath,
  };
}

function buildFindFilesArgs(pattern: string, searchRoot: string): string[] {
  const normalizedPattern = normalizeRipgrepGlob(pattern);
  return [
    "--files",
    "--hidden",
    "--color=never",
    "--glob",
    "!.git",
    "--glob",
    "!.jj",
    "--glob",
    normalizedPattern,
    searchRoot,
  ];
}

export async function findMatchingFiles(
  searchPath: string,
  pattern: string,
): Promise<FindFilesMatch[]> {
  const { searchRoot, fileFilter } = await resolveFindSearchScope(searchPath);
  const rgPath = resolvePiToolPath("rg");
  if (!rgPath) {
    throw new Error("ripgrep (rg) is not available in Pi's managed bin directory or on PATH");
  }

  const result = await execCommand(rgPath, buildFindFilesArgs(pattern, searchRoot), searchRoot);

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
  }

  const candidates = normalizeCommandOutputPaths(result.stdout, searchRoot, fileFilter);
  const { matches } = await statSortedFileMatches(candidates);

  return matches;
}

function validateFindFilesOffset(matchCount: number, offset: number): void {
  if (matchCount === 0) {
    return;
  }

  if (offset >= matchCount) {
    throw new Error("offset exceeds match count");
  }
}

function renderFindFilesCall(
  theme: Theme,
  args: { pattern?: string; path?: string; limit?: number },
): Text {
  const pattern = args.pattern || "*";
  const targetPath = shortenPath(args.path || ".");
  const suffix =
    typeof args.limit === "number" ? theme.fg("dim", ` (limit ${args.limit})`) : "";

  return new Text(
    `${theme.fg("toolTitle", theme.bold("Search "))}${theme.fg("accent", `${pattern} in ${targetPath}`)}${suffix}`,
    0,
    0,
  );
}

export function registerFindFilesTool(pi: ExtensionAPI): void {
  const nativeFindDefinition = createFindToolDefinition(process.cwd());

  pi.registerTool({
    name: "find_files",
    label: "find_files",
    description:
      "Find files by glob pattern and return absolute paths sorted by modification time.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Glob pattern used to match file paths." }),
      path: Type.Optional(Type.String({ description: "Optional search root path." })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results to return." })),
      offset: Type.Optional(Type.Number({ description: "Result offset for pagination." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePath(ctx.cwd, params.path ?? ".");
      const offset = Math.max(0, params.offset ?? 0);
      const limit = Math.max(1, params.limit ?? 100);

      const matches = await findMatchingFiles(searchPath, params.pattern);
      validateFindFilesOffset(matches.length, offset);

      const output = formatFindFilesOutput(matches, { offset, limit });
      const trimmed = trimToBudget(output);

      return {
        content: [{ type: "text", text: trimmed.text }],
        details: {
          pattern: params.pattern,
          path: searchPath,
          count: matches.length,
          offset,
          limit,
        },
      };
    },
    renderCall(args, theme, _context) {
      return renderFindFilesCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      if (!options.expanded) {
        return new Container();
      }

      return nativeFindDefinition.renderResult!(
        result as never,
        options,
        theme,
        context as never,
      );
    },
  });
}
