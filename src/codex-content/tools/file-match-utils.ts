import fs from "node:fs/promises";
import path from "node:path";

export type TimedFileMatch = {
  absolutePath: string;
  mtimeMs: number;
};

export type StatSortedMatches = {
  matches: TimedFileMatch[];
  skippedCount: number;
};

function normalizeComparablePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameFilePath(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

export function normalizeCommandOutputPaths(
  stdout: string,
  searchRoot: string,
  fileFilter?: string,
): string[] {
  return stdout
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (path.isAbsolute(line) ? line : path.resolve(searchRoot, line)))
    .filter((absolutePath) => !fileFilter || sameFilePath(absolutePath, fileFilter));
}

function sortTimedMatches(matches: TimedFileMatch[]): TimedFileMatch[] {
  return matches.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }

    return left.absolutePath.localeCompare(right.absolutePath);
  });
}

export async function statSortedFileMatches(files: string[]): Promise<StatSortedMatches> {
  const uniqueFiles = [...new Set(files)];
  const entries = await Promise.all(
    uniqueFiles.map(async (absolutePath) => ({
      absolutePath,
      stat: await fs.stat(absolutePath).catch(() => null),
    })),
  );

  const matches: TimedFileMatch[] = [];
  let skippedCount = 0;

  for (const entry of entries) {
    if (!entry.stat) {
      skippedCount += 1;
      continue;
    }

    if (!entry.stat.isFile()) {
      continue;
    }

    matches.push({
      absolutePath: entry.absolutePath,
      mtimeMs: entry.stat.mtimeMs,
    });
  }

  return {
    matches: sortTimedMatches(matches),
    skippedCount,
  };
}
