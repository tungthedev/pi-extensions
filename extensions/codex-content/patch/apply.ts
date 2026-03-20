import fs from "node:fs/promises";
import path from "node:path";

import type {
  AddFileHunk,
  AffectedPaths,
  ApplyPatchFileChange,
  DeleteFileHunk,
  PatchHunk,
  TouchedPaths,
  UpdateFileChunk,
  UpdateFileHunk,
  VirtualFileState,
} from "./types.ts";

import { seekSequence } from "./matching.ts";
import { parsePatch } from "./parser.ts";
import { applyFailed } from "./types.ts";

const REDACTION_PATTERNS = [
  /\[REDACTED\]/i,
  /\[\.\.\.\s*omitted.*?\]/i,
  /\[rest of .{1,40} unchanged\]/i,
  /\[remaining .{1,40} unchanged\]/i,
  /rest of (the )?(file|code|content|implementation) unchanged/i,
  /remaining (the )?(file|code|content|implementation) unchanged/i,
];

const EMPTY_BUFFER = Buffer.alloc(0);

type DiffRow = {
  kind: "context" | "removed" | "added";
  text: string;
};

type Replacement = {
  startIndex: number;
  oldLength: number;
  newLines: string[];
};

function stripBom(content: string): { bom: string; text: string } {
  if (!content.startsWith("\uFEFF")) {
    return { bom: "", text: content };
  }

  return { bom: "\uFEFF", text: content.slice(1) };
}

function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeToLf(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(content: string, lineEnding: "\r\n" | "\n"): string {
  return lineEnding === "\r\n" ? content.replace(/\n/g, "\r\n") : content;
}

function isLikelyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function splitContentLines(contents: string | undefined): string[] {
  if (!contents) {
    return [];
  }

  const lines = contents.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
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

  return lcs;
}

function diffLineSequences(oldLines: string[], newLines: string[]): DiffRow[] {
  const lcs = buildLcsTable(oldLines, newLines);
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

function diffPrefix(kind: DiffRow["kind"]): string {
  if (kind === "context") {
    return " ";
  }

  if (kind === "removed") {
    return "-";
  }

  return "+";
}

function formatDiffRows(rows: DiffRow[]): string {
  return rows.map((row) => `${diffPrefix(row.kind)} ${row.text}`).join("\n");
}

function buildPrefixedDiffText(prefix: string, contents: string | undefined): string | undefined {
  const lines = splitContentLines(contents);
  if (lines.length === 0) {
    return undefined;
  }

  return lines.map((line) => `${prefix} ${line}`).join("\n");
}

function buildAddDiffText(contents: string): string | undefined {
  return buildPrefixedDiffText("+", contents);
}

function buildDeleteDiffText(contents: string | undefined): string | undefined {
  return buildPrefixedDiffText("-", contents);
}

function buildUpdateChunkDiffText(chunk: UpdateFileChunk, includeGapMarker: boolean): string[] {
  const rows: string[] = [];

  if (includeGapMarker) {
    rows.push("  ...");
  }

  if (chunk.changeContext) {
    rows.push(`  ${chunk.changeContext}`);
  }

  rows.push(formatDiffRows(diffLineSequences(chunk.oldLines, chunk.newLines)));
  return rows;
}

function buildUpdateDiffText(hunk: UpdateFileHunk): string | undefined {
  const rows = hunk.chunks.flatMap((chunk, index) => buildUpdateChunkDiffText(chunk, index > 0));
  const text = rows.filter(Boolean).join("\n");
  return text.length > 0 ? text : undefined;
}

function findRedactionMarker(oldText: string, newText: string): string | null {
  for (const pattern of REDACTION_PATTERNS) {
    if (pattern.test(newText) && !pattern.test(oldText)) {
      return newText.match(pattern)?.[0] ?? "redaction marker";
    }
  }

  return null;
}

function validateAddedContent(contents: string): void {
  const marker = findRedactionMarker("", contents);
  if (!marker) {
    return;
  }

  applyFailed(`Rejected patch: added content contains placeholder text (${marker}).`);
}

function validateUpdatedContent(hunk: UpdateFileHunk): void {
  for (const chunk of hunk.chunks) {
    const marker = findRedactionMarker(chunk.oldLines.join("\n"), chunk.newLines.join("\n"));
    if (!marker) {
      continue;
    }

    applyFailed(
      `Rejected patch for ${hunk.path}: added content contains placeholder text (${marker}).`,
    );
  }
}

function validatePatchContentForRedaction(hunks: PatchHunk[]): void {
  for (const hunk of hunks) {
    if (hunk.type === "add") {
      validateAddedContent(hunk.contents);
      continue;
    }

    if (hunk.type === "update") {
      validateUpdatedContent(hunk);
    }
  }
}

function applyReplacements(lines: string[], replacements: Replacement[]): string[] {
  const nextLines = [...lines];

  for (const replacement of [...replacements].reverse()) {
    nextLines.splice(replacement.startIndex, replacement.oldLength, ...replacement.newLines);
  }

  return nextLines;
}

function findChunkContextIndex(
  originalLines: string[],
  chunk: UpdateFileChunk,
  lineIndex: number,
  displayPath: string,
): number {
  if (!chunk.changeContext) {
    return lineIndex;
  }

  const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
  if (contextIndex === undefined) {
    applyFailed(`Failed to find context '${chunk.changeContext}' in ${displayPath}`);
  }

  return contextIndex + 1;
}

function findChunkReplacement(
  originalLines: string[],
  chunk: UpdateFileChunk,
  lineIndex: number,
  displayPath: string,
): { replacement: Replacement; nextLineIndex: number } {
  const searchStart = findChunkContextIndex(originalLines, chunk, lineIndex, displayPath);

  if (chunk.oldLines.length === 0) {
    return {
      replacement: {
        startIndex: originalLines.length,
        oldLength: 0,
        newLines: [...chunk.newLines],
      },
      nextLineIndex: searchStart,
    };
  }

  let pattern = [...chunk.oldLines];
  let newLines = [...chunk.newLines];
  let found = seekSequence(originalLines, pattern, searchStart, chunk.isEndOfFile);

  if (found === undefined && pattern.at(-1) === "") {
    pattern = pattern.slice(0, -1);
    if (newLines.at(-1) === "") {
      newLines = newLines.slice(0, -1);
    }
    found = seekSequence(originalLines, pattern, searchStart, chunk.isEndOfFile);
  }

  if (found === undefined) {
    applyFailed(`Failed to find expected lines in ${displayPath}:\n${chunk.oldLines.join("\n")}`);
  }

  return {
    replacement: {
      startIndex: found,
      oldLength: pattern.length,
      newLines,
    },
    nextLineIndex: found + pattern.length,
  };
}

function deriveNewContentsFromText(
  contents: string,
  displayPath: string,
  chunks: UpdateFileChunk[],
): string {
  const originalLines = splitContentLines(contents);
  const replacements: Replacement[] = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    const next = findChunkReplacement(originalLines, chunk, lineIndex, displayPath);
    replacements.push(next.replacement);
    lineIndex = next.nextLineIndex;
  }

  replacements.sort((left, right) => left.startIndex - right.startIndex);
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

function buildMissingVirtualFileState(absolutePath: string): VirtualFileState {
  return {
    path: absolutePath,
    initialExists: false,
    finalExists: false,
    bom: "",
    lineEnding: "\n",
  };
}

function buildBinaryVirtualFileState(absolutePath: string, buffer: Buffer): VirtualFileState {
  return {
    path: absolutePath,
    initialExists: true,
    finalExists: true,
    isBinary: true,
    initialBinaryContent: buffer,
    finalBinaryContent: buffer,
    bom: "",
    lineEnding: "\n",
  };
}

function buildTextVirtualFileState(absolutePath: string, rawContent: string): VirtualFileState {
  const { bom, text } = stripBom(rawContent);
  const lineEnding = detectLineEnding(text);
  const normalizedContent = normalizeToLf(text);

  return {
    path: absolutePath,
    initialExists: true,
    initialContent: normalizedContent,
    finalExists: true,
    finalContent: normalizedContent,
    bom,
    lineEnding,
  };
}

async function readVirtualFileFromDisk(
  absolutePath: string,
  options: { allowBinary?: boolean },
): Promise<VirtualFileState> {
  try {
    const buffer = await fs.readFile(absolutePath);
    if (isLikelyBinary(buffer)) {
      if (!options.allowBinary) {
        applyFailed(`Failed to read file ${absolutePath}: file appears to be binary`);
      }

      return buildBinaryVirtualFileState(absolutePath, buffer);
    }

    return buildTextVirtualFileState(absolutePath, buffer.toString("utf8"));
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError?.code === "ENOENT") {
      return buildMissingVirtualFileState(absolutePath);
    }

    throw error;
  }
}

async function loadVirtualFile(
  files: Map<string, VirtualFileState>,
  absolutePath: string,
  options: { allowBinary?: boolean } = {},
): Promise<VirtualFileState> {
  const cachedState = files.get(absolutePath);
  if (cachedState) {
    return cachedState;
  }

  const state = await readVirtualFileFromDisk(absolutePath, options);
  files.set(absolutePath, state);
  return state;
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function hasBinaryChange(entry: VirtualFileState): boolean {
  return (
    Buffer.compare(
      entry.initialBinaryContent ?? EMPTY_BUFFER,
      entry.finalBinaryContent ?? EMPTY_BUFFER,
    ) !== 0
  );
}

function hasVirtualFileChange(entry: VirtualFileState): boolean {
  if (entry.initialExists !== entry.finalExists) {
    return true;
  }

  if (entry.initialContent !== entry.finalContent) {
    return true;
  }

  return hasBinaryChange(entry);
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  const parentDir = path.dirname(filePath);
  if (!parentDir || parentDir === ".") {
    return;
  }

  await fs.mkdir(parentDir, { recursive: true });
}

function restoredTextContent(content: string, entry: VirtualFileState): string {
  const bom = entry.bom ?? "";
  const lineEnding = entry.lineEnding ?? "\n";
  return `${bom}${restoreLineEndings(content, lineEnding)}`;
}

async function writeCurrentVirtualFile(entry: VirtualFileState): Promise<void> {
  await ensureParentDirectory(entry.path);

  if (entry.isBinary) {
    await fs.writeFile(entry.path, entry.finalBinaryContent ?? EMPTY_BUFFER);
    return;
  }

  await fs.writeFile(entry.path, restoredTextContent(entry.finalContent ?? "", entry), "utf8");
}

async function restoreVirtualFile(entry: VirtualFileState): Promise<void> {
  if (!entry.initialExists) {
    await fs.rm(entry.path, { force: true });
    return;
  }

  await ensureParentDirectory(entry.path);

  if (entry.isBinary) {
    await fs.writeFile(entry.path, entry.initialBinaryContent ?? EMPTY_BUFFER);
    return;
  }

  await fs.writeFile(entry.path, restoredTextContent(entry.initialContent ?? "", entry), "utf8");
}

async function commitVirtualFile(entry: VirtualFileState): Promise<void> {
  if (entry.finalExists) {
    await writeCurrentVirtualFile(entry);
    return;
  }

  await fs.rm(entry.path);
}

async function commitVirtualFiles(files: Map<string, VirtualFileState>): Promise<void> {
  const touchedFiles = [...files.values()].filter(hasVirtualFileChange);
  const rollbackActions: Array<() => Promise<void>> = [];

  try {
    for (const entry of touchedFiles) {
      await commitVirtualFile(entry);
      rollbackActions.push(async () => {
        await restoreVirtualFile(entry);
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

async function applyAddFileHunk(
  hunk: AddFileHunk,
  cwd: string,
  virtualFiles: Map<string, VirtualFileState>,
  touchedPaths: TouchedPaths,
  files: ApplyPatchFileChange[],
): Promise<void> {
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
}

async function applyDeleteFileHunk(
  hunk: DeleteFileHunk,
  cwd: string,
  virtualFiles: Map<string, VirtualFileState>,
  touchedPaths: TouchedPaths,
  files: ApplyPatchFileChange[],
): Promise<void> {
  const absolutePath = resolvePatchPath(cwd, hunk.path);
  const fileState = await loadVirtualFile(virtualFiles, absolutePath, { allowBinary: true });

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
}

async function applyMovedUpdateHunk(
  hunk: UpdateFileHunk,
  cwd: string,
  virtualFiles: Map<string, VirtualFileState>,
  sourceState: VirtualFileState,
  newContents: string,
  touchedPaths: TouchedPaths,
  files: ApplyPatchFileChange[],
): Promise<void> {
  const sourcePath = resolvePatchPath(cwd, hunk.path);
  const destinationPath = resolvePatchPath(cwd, hunk.movePath!);
  const destinationState = await loadVirtualFile(virtualFiles, destinationPath);

  if (destinationPath !== sourcePath && destinationState.finalExists) {
    applyFailed(`Failed to write file ${destinationPath}: destination already exists`);
  }

  destinationState.finalExists = true;
  destinationState.finalContent = newContents;
  destinationState.bom = sourceState.bom;
  destinationState.lineEnding = sourceState.lineEnding;
  sourceState.finalExists = false;
  sourceState.finalContent = undefined;

  pushUnique(touchedPaths.modified, hunk.movePath!);
  files.push({
    action: "moved",
    path: hunk.movePath!,
    sourcePath: hunk.path,
    diff: buildUpdateDiffText(hunk),
  });
}

async function applyUpdateFileHunk(
  hunk: UpdateFileHunk,
  cwd: string,
  virtualFiles: Map<string, VirtualFileState>,
  touchedPaths: TouchedPaths,
  files: ApplyPatchFileChange[],
): Promise<void> {
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
    await applyMovedUpdateHunk(
      hunk,
      cwd,
      virtualFiles,
      sourceState,
      newContents,
      touchedPaths,
      files,
    );
    return;
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

async function applyHunk(
  hunk: PatchHunk,
  cwd: string,
  virtualFiles: Map<string, VirtualFileState>,
  touchedPaths: TouchedPaths,
  files: ApplyPatchFileChange[],
): Promise<void> {
  if (hunk.type === "add") {
    await applyAddFileHunk(hunk, cwd, virtualFiles, touchedPaths, files);
    return;
  }

  if (hunk.type === "delete") {
    await applyDeleteFileHunk(hunk, cwd, virtualFiles, touchedPaths, files);
    return;
  }

  await applyUpdateFileHunk(hunk, cwd, virtualFiles, touchedPaths, files);
}

export async function applyPatch(
  patch: string,
  cwd: string,
): Promise<{ summary: string; affected: AffectedPaths; files: ApplyPatchFileChange[] }> {
  const { hunks } = parsePatch(patch);
  if (hunks.length === 0) {
    applyFailed("No files were modified.");
  }

  validatePatchContentForRedaction(hunks);

  const virtualFiles = new Map<string, VirtualFileState>();
  const files: ApplyPatchFileChange[] = [];
  const touchedPaths: TouchedPaths = {
    added: [],
    modified: [],
    deleted: [],
  };

  for (const hunk of hunks) {
    await applyHunk(hunk, cwd, virtualFiles, touchedPaths, files);
  }

  await commitVirtualFiles(virtualFiles);

  return {
    summary: printSummary(touchedPaths),
    affected: touchedPaths,
    files,
  };
}
