import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

import { execCommand, resolveAbsolutePath, trimToBudget } from "./runtime.ts";

export type FindFilesMatch = {
  absolutePath: string;
  mtimeMs: number;
};

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

async function statSortedMatches(files: string[]): Promise<FindFilesMatch[]> {
  const entries = await Promise.all(
    [...new Set(files)].map(async (absolutePath) => ({
      absolutePath,
      stat: await fs.stat(absolutePath).catch(() => null),
    })),
  );

  const matches: FindFilesMatch[] = [];
  for (const entry of entries) {
    if (!entry.stat || !entry.stat.isFile()) continue;
    matches.push({
      absolutePath: entry.absolutePath,
      mtimeMs: entry.stat.mtimeMs,
    });
  }

  return matches.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
    return left.absolutePath.localeCompare(right.absolutePath);
  });
}

export async function findMatchingFiles(
  searchPath: string,
  pattern: string,
): Promise<FindFilesMatch[]> {
  const stats = await fs.stat(searchPath);
  const searchRoot = stats.isDirectory() ? searchPath : path.dirname(searchPath);
  const fileFilter = stats.isDirectory() ? undefined : searchPath;

  const result = await execCommand(
    "rg",
    [
      "--files",
      "--hidden",
      "--color=never",
      "--glob",
      "!.git",
      "--glob",
      "!.jj",
      "--glob",
      pattern,
      searchRoot,
    ],
    searchRoot,
  );

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
  }

  const candidates = result.stdout
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (path.isAbsolute(line) ? line : path.resolve(searchRoot, line)))
    .filter((absolutePath) => !fileFilter || absolutePath === fileFilter);

  return await statSortedMatches(candidates);
}

export function registerFindFilesTool(pi: ExtensionAPI): void {
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
      if (matches.length > 0 && offset >= matches.length) {
        throw new Error("offset exceeds match count");
      }
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
    renderCall() {
      return undefined;
    },
    renderResult() {
      return undefined;
    },
  });
}
