import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

import {
  normalizeCommandOutputPaths,
  statSortedFileMatches,
  type StatSortedMatches,
  type TimedFileMatch,
} from "./file-match-utils.ts";
import { execCommand, resolveAbsolutePathWithVariants, trimToBudget } from "./runtime.ts";

export type GrepFilesMatch = TimedFileMatch;

type GrepFilesResult = StatSortedMatches;

export function formatGrepFilesOutput(
  result: GrepFilesResult,
  options: { limit?: number } = {},
): string {
  const limit = Math.max(1, options.limit ?? 100);
  const visible = result.matches.slice(0, limit);
  const lines = [`${result.matches.length} matching file${result.matches.length === 1 ? "" : "s"}`];

  if (visible.length > 0) {
    lines.push(...visible.map((match) => match.absolutePath));
  }

  if (result.matches.length > visible.length) {
    lines.push(
      "",
      `[Showing ${visible.length} of ${result.matches.length} matches. Use limit to see more.]`,
    );
  }
  if (result.skippedCount > 0) {
    lines.push(
      "",
      `[Skipped ${result.skippedCount} unreadable file${result.skippedCount === 1 ? "" : "s"}.]`,
    );
  }

  return lines.join("\n");
}

type SearchScope = {
  searchRoot: string;
  fileFilter?: string;
};

async function resolveSearchScope(searchPath: string): Promise<SearchScope> {
  let stats;

  try {
    stats = await fs.stat(searchPath);
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError?.code === "ENOENT") {
      throw new Error(`path not found: ${searchPath}`);
    }

    throw error;
  }

  if (stats.isDirectory()) {
    return { searchRoot: searchPath };
  }

  return {
    searchRoot: path.dirname(searchPath),
    fileFilter: searchPath,
  };
}

function normalizeRgError(stderr: string, exitCode: number): Error {
  const message = stderr.trim();
  if (/regex parse error|error parsing regex|unclosed group|repetition operator/i.test(message)) {
    return new Error(`invalid regex: ${message}`);
  }
  return new Error(message || `rg exited with code ${exitCode}`);
}

function buildGrepFilesArgs(pattern: string, searchPath: string, include?: string): string[] {
  const args = [
    "--files-with-matches",
    "--hidden",
    "--color=never",
    "--no-messages",
    "--glob",
    "!**/.git/**",
    "--glob",
    "!**/.jj/**",
  ];

  if (include) {
    args.push("--glob", include);
  }

  args.push(pattern, searchPath);
  return args;
}

function isAbortedSearch(stderr: string, exitCode: number): boolean {
  return exitCode === 130 || /command aborted/i.test(stderr);
}

function buildSearchAbortedResult(pattern: string, searchPath?: string) {
  return {
    content: [{ type: "text" as const, text: "Search aborted" }],
    details: {
      pattern,
      ...(searchPath ? { path: searchPath } : {}),
      count: 0,
    },
    isError: true,
  };
}

export async function findContentMatches(
  searchPath: string,
  pattern: string,
  include?: string,
  signal?: AbortSignal,
): Promise<GrepFilesResult> {
  const { searchRoot, fileFilter } = await resolveSearchScope(searchPath);
  const args = buildGrepFilesArgs(pattern, searchPath, include);

  const result = await execCommand("rg", args, searchRoot, { signal });

  if (isAbortedSearch(result.stderr, result.exitCode)) {
    throw new Error("search aborted");
  }

  if (result.exitCode === 1) {
    return { matches: [], skippedCount: 0 };
  }

  if (result.exitCode !== 0) {
    throw normalizeRgError(result.stderr, result.exitCode);
  }

  const candidates = normalizeCommandOutputPaths(result.stdout, searchRoot, fileFilter);

  return await statSortedFileMatches(candidates);
}

export function registerGrepFilesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "grep_files",
    label: "grep_files",
    description:
      "Finds files whose contents match the pattern and lists them by modification time.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Regular expression pattern to search for." }),
      include: Type.Optional(
        Type.String({ description: "Optional glob that limits which files are searched." }),
      ),
      path: Type.Optional(Type.String({ description: "Directory or file path to search." })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of file paths to return." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePathWithVariants(ctx.cwd, params.path ?? ".");
      const limit = Math.max(1, params.limit ?? 100);

      if (signal?.aborted) {
        return buildSearchAbortedResult(params.pattern);
      }

      let matches;
      try {
        matches = await findContentMatches(searchPath, params.pattern, params.include, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/search aborted/i.test(message)) {
          return buildSearchAbortedResult(params.pattern, searchPath);
        }

        throw error;
      }

      const output = formatGrepFilesOutput(matches, { limit });
      const trimmed = trimToBudget(output);

      return {
        content: [{ type: "text", text: trimmed.text || "0 matching files" }],
        details: {
          pattern: params.pattern,
          path: searchPath,
          count: matches.matches.length,
          skippedCount: matches.skippedCount,
        },
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult() {
      return undefined;
    },
  });
}
