import type { ApplyPatchArgs, PatchHunk, UpdateFileChunk, UpdateFileHunk } from "./types.ts";

import { invalidHunk, invalidPatch } from "./types.ts";

const BEGIN_PATCH_MARKER = "*** Begin Patch";
const END_PATCH_MARKER = "*** End Patch";
const ADD_FILE_MARKER = "*** Add File: ";
const DELETE_FILE_MARKER = "*** Delete File: ";
const UPDATE_FILE_MARKER = "*** Update File: ";
const MOVE_TO_MARKER = "*** Move to: ";
const EOF_MARKER = "*** End of File";
const CHANGE_CONTEXT_MARKER = "@@ ";
const EMPTY_CHANGE_CONTEXT_MARKER = "@@";

function trimBoundaryLine(value: string | undefined): string | undefined {
  return value?.trim();
}

// The tool accepts raw patch text, a bare heredoc body, or an apply_patch heredoc wrapper.
function unwrapPatchInput(input: string): string {
  const trimmed = input.trim();

  const invocationMatch = trimmed.match(
    /^(?:apply_patch|applypatch)\s+<<(?:'([^']+)'|"([^"]+)"|(\S+))\n([\s\S]*?)\n\1\2\3\s*$/,
  );
  if (invocationMatch) {
    return invocationMatch[4];
  }

  const heredocMatch = trimmed.match(/^<<(?:'([^']+)'|"([^"]+)"|(\S+))\n([\s\S]*?)\n\1\2\3\s*$/);
  if (heredocMatch) {
    return heredocMatch[4];
  }

  return trimmed;
}

function assertPatchBoundaries(lines: string[]): void {
  const firstLine = trimBoundaryLine(lines[0]);
  if (firstLine !== BEGIN_PATCH_MARKER) {
    invalidPatch(`The first line of the patch must be '${BEGIN_PATCH_MARKER}'`);
  }

  const lastLine = trimBoundaryLine(lines.at(-1));
  if (lastLine !== END_PATCH_MARKER) {
    invalidPatch(`The last line of the patch must be '${END_PATCH_MARKER}'`);
  }
}

function parseUpdateChunkHeader(
  lines: string[],
  lineNumber: number,
  allowMissingContext: boolean,
): { changeContext?: string; startIndex: number } {
  const firstLine = lines[0];
  if (firstLine === EMPTY_CHANGE_CONTEXT_MARKER) {
    return { startIndex: 1 };
  }

  if (firstLine?.startsWith(CHANGE_CONTEXT_MARKER)) {
    return {
      changeContext: firstLine.slice(CHANGE_CONTEXT_MARKER.length),
      startIndex: 1,
    };
  }

  if (allowMissingContext) {
    return { startIndex: 0 };
  }

  invalidHunk(
    lineNumber,
    `Expected update hunk to start with a @@ context marker, got: '${firstLine}'`,
  );
}

function appendChunkLine(chunk: UpdateFileChunk, line: string): void {
  if (!line.length) {
    chunk.oldLines.push("");
    chunk.newLines.push("");
    return;
  }

  const prefix = line.charAt(0);
  const value = line.slice(1);

  if (prefix === " ") {
    chunk.oldLines.push(value);
    chunk.newLines.push(value);
    return;
  }

  if (prefix === "+") {
    chunk.newLines.push(value);
    return;
  }

  chunk.oldLines.push(value);
}

function parseUpdateChunk(
  lines: string[],
  lineNumber: number,
  allowMissingContext: boolean,
): { chunk: UpdateFileChunk; parsedLines: number } {
  if (lines.length === 0) {
    invalidHunk(lineNumber, "Update hunk does not contain any lines");
  }

  const header = parseUpdateChunkHeader(lines, lineNumber, allowMissingContext);
  if (header.startIndex >= lines.length) {
    invalidHunk(lineNumber + 1, "Update hunk does not contain any lines");
  }

  const chunk: UpdateFileChunk = {
    changeContext: header.changeContext,
    oldLines: [],
    newLines: [],
    isEndOfFile: false,
  };

  let parsedBodyLines = 0;

  for (const line of lines.slice(header.startIndex)) {
    if (line === EOF_MARKER) {
      if (parsedBodyLines === 0) {
        invalidHunk(lineNumber + 1, "Update hunk does not contain any lines");
      }
      chunk.isEndOfFile = true;
      parsedBodyLines += 1;
      break;
    }

    const isPatchLine = line.startsWith("***");
    if (isPatchLine) {
      break;
    }

    const isUnexpectedFirstBodyLine =
      parsedBodyLines === 0 &&
      line.length > 0 &&
      !line.startsWith(" ") &&
      !line.startsWith("+") &&
      !line.startsWith("-");

    if (isUnexpectedFirstBodyLine) {
      invalidHunk(
        lineNumber + 1,
        `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
      );
    }

    if (parsedBodyLines > 0 && line.length > 0) {
      const prefix = line.charAt(0);
      if (prefix !== " " && prefix !== "+" && prefix !== "-") {
        break;
      }
    }

    appendChunkLine(chunk, line);
    parsedBodyLines += 1;
  }

  return {
    chunk,
    parsedLines: header.startIndex + parsedBodyLines,
  };
}

function parseAddHunk(lines: string[]): { hunk: PatchHunk; parsedLines: number } {
  const filePath = lines[0].trim().slice(ADD_FILE_MARKER.length);
  let contents = "";
  let parsedLines = 1;

  for (const line of lines.slice(1)) {
    if (!line.startsWith("+")) {
      break;
    }
    contents += `${line.slice(1)}\n`;
    parsedLines += 1;
  }

  return {
    hunk: { type: "add", path: filePath, contents },
    parsedLines,
  };
}

function parseDeleteHunk(lines: string[]): { hunk: PatchHunk; parsedLines: number } {
  return {
    hunk: { type: "delete", path: lines[0].trim().slice(DELETE_FILE_MARKER.length) },
    parsedLines: 1,
  };
}

function parseMovePath(lines: string[]): {
  movePath?: string;
  remainingLines: string[];
  parsedLines: number;
} {
  const firstLine = lines[0];
  if (!firstLine?.startsWith(MOVE_TO_MARKER)) {
    return {
      remainingLines: lines,
      parsedLines: 0,
    };
  }

  return {
    movePath: firstLine.slice(MOVE_TO_MARKER.length),
    remainingLines: lines.slice(1),
    parsedLines: 1,
  };
}

function parseUpdateChunks(
  lines: string[],
  lineNumber: number,
): { chunks: UpdateFileChunk[]; parsedLines: number } {
  const chunks: UpdateFileChunk[] = [];
  let remainingLines = lines;
  let parsedLines = 0;

  while (remainingLines.length > 0) {
    if (!remainingLines[0].trim()) {
      remainingLines = remainingLines.slice(1);
      parsedLines += 1;
      continue;
    }

    if (remainingLines[0].startsWith("***")) {
      break;
    }

    const chunkResult = parseUpdateChunk(
      remainingLines,
      lineNumber + parsedLines,
      chunks.length === 0,
    );
    chunks.push(chunkResult.chunk);
    remainingLines = remainingLines.slice(chunkResult.parsedLines);
    parsedLines += chunkResult.parsedLines;
  }

  return { chunks, parsedLines };
}

function parseUpdateHunk(
  lines: string[],
  lineNumber: number,
): { hunk: UpdateFileHunk; parsedLines: number } {
  const filePath = lines[0].trim().slice(UPDATE_FILE_MARKER.length);
  const move = parseMovePath(lines.slice(1));
  const chunkResult = parseUpdateChunks(
    lines.slice(1 + move.parsedLines),
    lineNumber + 1 + move.parsedLines,
  );

  if (chunkResult.chunks.length === 0) {
    invalidHunk(lineNumber, `Update file hunk for path '${filePath}' is empty`);
  }

  return {
    hunk: {
      type: "update",
      path: filePath,
      ...(move.movePath ? { movePath: move.movePath } : {}),
      chunks: chunkResult.chunks,
    },
    parsedLines: 1 + move.parsedLines + chunkResult.parsedLines,
  };
}

function parseHunk(lines: string[], lineNumber: number): { hunk: PatchHunk; parsedLines: number } {
  const header = lines[0]?.trim() ?? "";

  if (header.startsWith(ADD_FILE_MARKER)) {
    return parseAddHunk(lines);
  }

  if (header.startsWith(DELETE_FILE_MARKER)) {
    return parseDeleteHunk(lines);
  }

  if (header.startsWith(UPDATE_FILE_MARKER)) {
    return parseUpdateHunk(lines, lineNumber);
  }

  invalidHunk(
    lineNumber,
    `'${header}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
  );
}

export function parsePatch(patch: string): ApplyPatchArgs {
  const patchText = unwrapPatchInput(patch);
  const lines = patchText.trim().split(/\r?\n/);
  assertPatchBoundaries(lines);

  const hunks: PatchHunk[] = [];
  let lineNumber = 2;
  let remainingLines = lines.slice(1, Math.max(1, lines.length - 1));

  while (remainingLines.length > 0) {
    const parsed = parseHunk(remainingLines, lineNumber);
    hunks.push(parsed.hunk);
    remainingLines = remainingLines.slice(parsed.parsedLines);
    lineNumber += parsed.parsedLines;
  }

  return {
    patch: lines.join("\n"),
    hunks,
  };
}
