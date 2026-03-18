import fs from "node:fs/promises";
import path from "node:path";

import type {
  AffectedPaths,
  ApplyPatchFileChange,
  TouchedPaths,
  UpdateFileChunk,
  UpdateFileHunk,
  VirtualFileState,
} from "./types.ts";
import { applyFailed } from "./types.ts";
import { parsePatch } from "./parser.ts";
import { seekSequence } from "./matching.ts";

type DiffRow = {
  kind: "context" | "removed" | "added";
  text: string;
};

function splitContentLines(contents: string | undefined): string[] {
  if (!contents) return [];
  const lines = contents.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function diffLineSequences(oldLines: string[], newLines: string[]): DiffRow[] {
  const heights = oldLines.length + 1;
  const widths = newLines.length + 1;
  const lcs = Array.from({ length: heights }, () => Array<number>(widths).fill(0));

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      lcs[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? lcs[oldIndex + 1][newIndex + 1] + 1
          : Math.max(lcs[oldIndex + 1][newIndex], lcs[oldIndex][newIndex + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({ kind: "context", text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (lcs[oldIndex + 1][newIndex] >= lcs[oldIndex][newIndex + 1]) {
      rows.push({ kind: "removed", text: oldLines[oldIndex] });
      oldIndex += 1;
      continue;
    }

    rows.push({ kind: "added", text: newLines[newIndex] });
    newIndex += 1;
  }

  while (oldIndex < oldLines.length) {
    rows.push({ kind: "removed", text: oldLines[oldIndex] });
    oldIndex += 1;
  }

  while (newIndex < newLines.length) {
    rows.push({ kind: "added", text: newLines[newIndex] });
    newIndex += 1;
  }

  return rows;
}

function formatDiffRows(rows: DiffRow[]): string {
  return rows
    .map((row) => `${row.kind === "context" ? " " : row.kind === "removed" ? "-" : "+"} ${row.text}`)
    .join("\n");
}

function buildAddDiffText(contents: string): string | undefined {
  const lines = splitContentLines(contents);
  return lines.length > 0 ? lines.map((line) => `+ ${line}`).join("\n") : undefined;
}

function buildDeleteDiffText(contents: string | undefined): string | undefined {
  const lines = splitContentLines(contents);
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : undefined;
}

function buildUpdateDiffText(hunk: UpdateFileHunk): string | undefined {
  const rows: string[] = [];

  for (const [index, chunk] of hunk.chunks.entries()) {
    if (index > 0) {
      rows.push("  ...");
    }
    if (chunk.changeContext) {
      rows.push(`  ${chunk.changeContext}`);
    }
    rows.push(formatDiffRows(diffLineSequences(chunk.oldLines, chunk.newLines)));
  }

  const text = rows.filter(Boolean).join("\n");
  return text.length > 0 ? text : undefined;
}

function applyReplacements(
  lines: string[],
  replacements: Array<[number, number, string[]]>,
): string[] {
  const nextLines = [...lines];
  for (const [startIndex, oldLength, newSegment] of [...replacements].reverse()) {
    nextLines.splice(startIndex, oldLength, ...newSegment);
  }
  return nextLines;
}

function deriveNewContentsFromText(
  contents: string,
  displayPath: string,
  chunks: UpdateFileChunk[],
): string {
  const originalLines = contents.split("\n");
  if (originalLines.at(-1) === "") {
    originalLines.pop();
  }

  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (contextIndex === undefined) {
        applyFailed(`Failed to find context '${chunk.changeContext}' in ${displayPath}`);
      }
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      const insertionIndex =
        originalLines.at(-1) === "" ? Math.max(0, originalLines.length - 1) : originalLines.length;
      replacements.push([insertionIndex, 0, [...chunk.newLines]]);
      continue;
    }

    let pattern = [...chunk.oldLines];
    let newSlice = [...chunk.newLines];
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);

    if (found === undefined && pattern.at(-1) === "") {
      pattern = pattern.slice(0, -1);
      if (newSlice.at(-1) === "") {
        newSlice = newSlice.slice(0, -1);
      }
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }

    if (found === undefined) {
      applyFailed(`Failed to find expected lines in ${displayPath}:\n${chunk.oldLines.join("\n")}`);
    }

    replacements.push([found, pattern.length, newSlice]);
    lineIndex = found + pattern.length;
  }

  replacements.sort((left, right) => left[0] - right[0]);
  const nextLines = applyReplacements(originalLines, replacements);
  if (nextLines.at(-1) !== "") {
    nextLines.push("");
  }
  return nextLines.join("\n");
}

function printSummary(affected: AffectedPaths): string {
  const lines = ["Success. Updated the following files:"];
  for (const filePath of affected.added) lines.push(`A ${filePath}`);
  for (const filePath of affected.modified) lines.push(`M ${filePath}`);
  for (const filePath of affected.deleted) lines.push(`D ${filePath}`);
  return `${lines.join("\n")}\n`;
}

function resolvePatchPath(cwd: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath);
}

async function loadVirtualFile(
  files: Map<string, VirtualFileState>,
  absolutePath: string,
): Promise<VirtualFileState> {
  const existing = files.get(absolutePath);
  if (existing) {
    return existing;
  }

  try {
    const content = await fs.readFile(absolutePath, "utf8");
    const state: VirtualFileState = {
      path: absolutePath,
      initialExists: true,
      initialContent: content,
      finalExists: true,
      finalContent: content,
    };
    files.set(absolutePath, state);
    return state;
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError?.code === "ENOENT") {
      const state: VirtualFileState = {
        path: absolutePath,
        initialExists: false,
        finalExists: false,
      };
      files.set(absolutePath, state);
      return state;
    }
    throw error;
  }
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

async function commitVirtualFiles(files: Map<string, VirtualFileState>): Promise<void> {
  const touched = [...files.values()].filter(
    (entry) =>
      entry.initialExists !== entry.finalExists || entry.initialContent !== entry.finalContent,
  );
  const rollbackActions: Array<() => Promise<void>> = [];

  try {
    for (const entry of touched) {
      if (entry.finalExists) {
        const parentDir = path.dirname(entry.path);
        if (parentDir && parentDir !== ".") {
          await fs.mkdir(parentDir, { recursive: true });
        }
        await fs.writeFile(entry.path, entry.finalContent ?? "", "utf8");
        rollbackActions.push(async () => {
          if (entry.initialExists) {
            await fs.mkdir(path.dirname(entry.path), { recursive: true });
            await fs.writeFile(entry.path, entry.initialContent ?? "", "utf8");
          } else {
            await fs.rm(entry.path, { force: true });
          }
        });
        continue;
      }

      await fs.rm(entry.path);
      rollbackActions.push(async () => {
        if (entry.initialExists) {
          await fs.mkdir(path.dirname(entry.path), { recursive: true });
          await fs.writeFile(entry.path, entry.initialContent ?? "", "utf8");
        }
      });
    }
  } catch (error) {
    for (const rollback of [...rollbackActions].reverse()) {
      try {
        await rollback();
      } catch {
        // Best-effort rollback only.
      }
    }
    throw error;
  }
}

export async function applyPatch(
  patch: string,
  cwd: string,
): Promise<{ summary: string; affected: AffectedPaths; files: ApplyPatchFileChange[] }> {
  const { hunks } = parsePatch(patch);
  if (hunks.length === 0) {
    applyFailed("No files were modified.");
  }

  const virtualFiles = new Map<string, VirtualFileState>();
  const files: ApplyPatchFileChange[] = [];
  const touchedPaths: TouchedPaths = {
    added: [],
    modified: [],
    deleted: [],
  };

  for (const hunk of hunks) {
    if (hunk.type === "add") {
      const absolutePath = resolvePatchPath(cwd, hunk.path);
      const fileState = await loadVirtualFile(virtualFiles, absolutePath);
      if (fileState.finalExists) {
        applyFailed(`Failed to write file ${absolutePath}: destination already exists`);
      }
      fileState.finalExists = true;
      fileState.finalContent = hunk.contents;
      pushUnique(touchedPaths.added, hunk.path);
      files.push({
        action: "added",
        path: hunk.path,
        diff: buildAddDiffText(hunk.contents),
      });
      continue;
    }

    if (hunk.type === "delete") {
      const absolutePath = resolvePatchPath(cwd, hunk.path);
      const fileState = await loadVirtualFile(virtualFiles, absolutePath);
      if (!fileState.finalExists) {
        applyFailed(`Failed to delete file ${absolutePath}: file does not exist`);
      }
      fileState.finalExists = false;
      fileState.finalContent = undefined;
      pushUnique(touchedPaths.deleted, hunk.path);
      files.push({
        action: "deleted",
        path: hunk.path,
        diff: buildDeleteDiffText(fileState.initialContent),
      });
      continue;
    }

    const absolutePath = resolvePatchPath(cwd, hunk.path);
    const sourceState = await loadVirtualFile(virtualFiles, absolutePath);
    if (!sourceState.finalExists) {
      applyFailed(`Failed to read file to update ${absolutePath}: file does not exist`);
    }

    const newContents = deriveNewContentsFromText(
      sourceState.finalContent ?? "",
      absolutePath,
      hunk.chunks,
    );

    if (hunk.movePath) {
      const destinationPath = resolvePatchPath(cwd, hunk.movePath);
      const destinationState = await loadVirtualFile(virtualFiles, destinationPath);
      if (destinationPath !== absolutePath && destinationState.finalExists) {
        applyFailed(`Failed to write file ${destinationPath}: destination already exists`);
      }
      destinationState.finalExists = true;
      destinationState.finalContent = newContents;
      sourceState.finalExists = false;
      sourceState.finalContent = undefined;
      pushUnique(touchedPaths.modified, hunk.movePath);
      files.push({
        action: "moved",
        path: hunk.movePath,
        sourcePath: hunk.path,
        diff: buildUpdateDiffText(hunk),
      });
      continue;
    }

    sourceState.finalExists = true;
    sourceState.finalContent = newContents;
    pushUnique(touchedPaths.modified, hunk.path);
    files.push({
      action: "modified",
      path: hunk.path,
      diff: buildUpdateDiffText(hunk),
    });
  }

  await commitVirtualFiles(virtualFiles);

  return {
    summary: printSummary(touchedPaths),
    affected: touchedPaths,
    files,
  };
}
