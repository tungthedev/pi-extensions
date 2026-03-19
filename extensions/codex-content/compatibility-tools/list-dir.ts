import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

import { MAX_LIST_DIR_SCAN_ENTRIES, resolveAbsolutePath } from "./runtime.ts";

export type ListDirectoryEntry = {
  sortKey: string;
  relativePath: string;
  typeLabel: "file" | "dir" | "symlink";
};

export async function listDirectoryEntries(
  dirPath: string,
  depth: number,
): Promise<ListDirectoryEntry[]> {
  const queue: Array<{ absolutePath: string; relativePrefix: string; remainingDepth: number }> = [
    { absolutePath: dirPath, relativePrefix: "", remainingDepth: depth },
  ];
  const entries: ListDirectoryEntry[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const dirents = await fs.readdir(current.absolutePath, { withFileTypes: true });
    const batch = dirents.map((dirent) => {
      const relativePath = current.relativePrefix
        ? path.posix.join(current.relativePrefix, dirent.name)
        : dirent.name;
      const absolutePath = path.join(current.absolutePath, dirent.name);
      const suffix = dirent.isDirectory() ? "/" : dirent.isSymbolicLink() ? "@" : "";
      const typeLabel: ListDirectoryEntry["typeLabel"] = dirent.isDirectory()
        ? "dir"
        : dirent.isSymbolicLink()
          ? "symlink"
          : "file";
      return {
        dirent,
        relativePath,
        absolutePath,
        entry: {
          sortKey: relativePath,
          relativePath: `${relativePath}${suffix}`,
          typeLabel,
        },
      };
    });

    batch.sort((left, right) => left.entry.sortKey.localeCompare(right.entry.sortKey));

    for (const item of batch) {
      if (entries.length >= MAX_LIST_DIR_SCAN_ENTRIES) {
        throw new Error(
          `Directory listing exceeded safe scan limit of ${MAX_LIST_DIR_SCAN_ENTRIES} entries. Narrow the path, depth, or offset.`,
        );
      }

      entries.push(item.entry);
      if (item.dirent.isDirectory() && current.remainingDepth > 1) {
        queue.push({
          absolutePath: item.absolutePath,
          relativePrefix: item.relativePath,
          remainingDepth: current.remainingDepth - 1,
        });
      }
    }
  }

  entries.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  return entries;
}

export function formatListDirectoryOutput(
  absolutePath: string,
  entries: ListDirectoryEntry[],
  options: { offset?: number; limit?: number } = {},
): string {
  const offset = options.offset ?? 1;
  const limit = options.limit ?? entries.length;

  if (entries.length === 0) {
    return `Absolute path: ${absolutePath}`;
  }

  const start = offset - 1;
  const visible = entries.slice(start, start + limit);
  const lines = [
    `Absolute path: ${absolutePath}`,
    ...visible.map(
      (entry, index) => `${start + index + 1}. [${entry.typeLabel}] ${entry.relativePath}`,
    ),
  ];

  if (start + visible.length < entries.length) {
    lines.push(
      `More than ${visible.length} entries found (${entries.length} total). Use offset ${start + visible.length + 1} to continue.`,
    );
  }

  return lines.join("\n");
}

export function registerListDirTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "list_dir",
    label: "list_dir",
    description:
      "Lists entries in a local directory with 1-indexed entry numbers and simple type labels.",
    parameters: Type.Object({
      dir_path: Type.String({ description: "Absolute path to the directory to list." }),
      offset: Type.Optional(Type.Number({ description: "1-indexed entry number to start from." })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of entries to return." })),
      depth: Type.Optional(Type.Number({ description: "Maximum directory depth to traverse." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const absolutePath = resolveAbsolutePath(ctx.cwd, params.dir_path);
      const stats = await fs.stat(absolutePath);
      const offset = params.offset ?? 1;
      const limit = params.limit ?? 25;
      const depth = params.depth ?? 2;
      if (!stats.isDirectory()) throw new Error("list_dir only supports directories");
      if (offset < 1) throw new Error("offset must be a 1-indexed entry number");
      if (limit < 1) throw new Error("limit must be greater than zero");
      if (depth < 1) throw new Error("depth must be greater than zero");

      const allEntries = await listDirectoryEntries(absolutePath, depth);
      if (allEntries.length === 0) {
        return {
          content: [{ type: "text", text: `Absolute path: ${absolutePath}` }],
          details: { dirPath: absolutePath, count: 0 },
        };
      }
      if (offset > allEntries.length) throw new Error("offset exceeds directory entry count");

      return {
        content: [
          {
            type: "text",
            text: formatListDirectoryOutput(absolutePath, allEntries, { offset, limit }),
          },
        ],
        details: { dirPath: absolutePath, count: allEntries.length },
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
