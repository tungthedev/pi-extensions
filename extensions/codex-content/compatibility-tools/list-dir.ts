import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Dirent } from "node:fs";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";

import { MAX_LIST_DIR_SCAN_ENTRIES, resolveAbsolutePathWithVariants } from "./runtime.ts";

export type ListDirectoryEntry = {
  sortKey: string;
  relativePath: string;
  typeLabel: "file" | "dir" | "symlink";
};

export type ListDirectoryScan = {
  entries: ListDirectoryEntry[];
  skippedCount: number;
};

type ScanQueueEntry = {
  absolutePath: string;
  relativePrefix: string;
  remainingDepth: number;
};

type ScannedBatchEntry = {
  dirent: Dirent;
  relativePath: string;
  absolutePath: string;
  entry: ListDirectoryEntry;
};

function listEntryTypeLabel(dirent: Dirent): ListDirectoryEntry["typeLabel"] {
  if (dirent.isDirectory()) {
    return "dir";
  }

  if (dirent.isSymbolicLink()) {
    return "symlink";
  }

  return "file";
}

function listEntrySuffix(dirent: Dirent): string {
  if (dirent.isDirectory()) {
    return "/";
  }

  if (dirent.isSymbolicLink()) {
    return "@";
  }

  return "";
}

function buildScannedBatchEntry(
  current: ScanQueueEntry,
  dirent: ScannedBatchEntry["dirent"],
): ScannedBatchEntry {
  const relativePath = current.relativePrefix
    ? path.posix.join(current.relativePrefix, dirent.name)
    : dirent.name;

  return {
    dirent,
    relativePath,
    absolutePath: path.join(current.absolutePath, dirent.name),
    entry: {
      sortKey: relativePath,
      relativePath: `${relativePath}${listEntrySuffix(dirent)}`,
      typeLabel: listEntryTypeLabel(dirent),
    },
  };
}

function formatSkippedDirectoryNote(skippedCount = 0): string | undefined {
  if (skippedCount === 0) {
    return undefined;
  }

  return `[Skipped ${skippedCount} unreadable director${skippedCount === 1 ? "y" : "ies"}.]`;
}

function buildListDirResult(
  absolutePath: string,
  entries: ListDirectoryEntry[],
  skippedCount: number,
  options: { offset?: number; limit?: number } = {},
) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatListDirectoryOutput(absolutePath, entries, {
          offset: options.offset,
          limit: options.limit,
          skippedCount,
        }),
      },
    ],
    details: {
      dirPath: absolutePath,
      count: entries.length,
      skippedCount,
    },
  };
}

export async function scanDirectoryEntries(
  dirPath: string,
  depth: number,
): Promise<ListDirectoryScan> {
  const queue: ScanQueueEntry[] = [
    { absolutePath: dirPath, relativePrefix: "", remainingDepth: depth },
  ];
  const entries: ListDirectoryEntry[] = [];
  let skippedCount = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    let dirents;
    try {
      dirents = await fs.readdir(current.absolutePath, { withFileTypes: true });
    } catch (error) {
      if (current.relativePrefix.length === 0) {
        throw error;
      }
      skippedCount += 1;
      continue;
    }

    const batch = dirents.map((dirent) => buildScannedBatchEntry(current, dirent));

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
  return { entries, skippedCount };
}

export async function listDirectoryEntries(
  dirPath: string,
  depth: number,
): Promise<ListDirectoryEntry[]> {
  const scan = await scanDirectoryEntries(dirPath, depth);
  return scan.entries;
}

export function formatListDirectoryOutput(
  absolutePath: string,
  entries: ListDirectoryEntry[],
  options: { offset?: number; limit?: number; skippedCount?: number } = {},
): string {
  const offset = options.offset ?? 1;
  const limit = options.limit ?? entries.length;
  const skippedDirectoryNote = formatSkippedDirectoryNote(options.skippedCount);

  if (entries.length === 0) {
    const lines = [`Absolute path: ${absolutePath}`];
    if (skippedDirectoryNote) {
      lines.push(skippedDirectoryNote);
    }

    return lines.join("\n");
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

  if (skippedDirectoryNote) {
    lines.push(skippedDirectoryNote);
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
      const absolutePath = resolveAbsolutePathWithVariants(ctx.cwd, params.dir_path);
      const stats = await fs.stat(absolutePath);
      const offset = params.offset ?? 1;
      const limit = params.limit ?? 25;
      const depth = params.depth ?? 2;

      if (!stats.isDirectory()) throw new Error("list_dir only supports directories");
      if (offset < 1) throw new Error("offset must be a 1-indexed entry number");
      if (limit < 1) throw new Error("limit must be greater than zero");
      if (depth < 1) throw new Error("depth must be greater than zero");

      const scan = await scanDirectoryEntries(absolutePath, depth);
      if (scan.entries.length === 0) {
        return buildListDirResult(absolutePath, scan.entries, scan.skippedCount);
      }

      if (offset > scan.entries.length) throw new Error("offset exceeds directory entry count");

      return buildListDirResult(absolutePath, scan.entries, scan.skippedCount, { offset, limit });
    },
    renderCall() {
      return undefined;
    },
    renderResult() {
      return undefined;
    },
  });
}
