import type { ApplyPatchArgs, PatchHunk, UpdateFileChunk } from "./types.ts";

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

function parsePatchTextStrict(lines: string[]): string[] {
  const firstLine = trimBoundaryLine(lines[0]);
  const lastLine = trimBoundaryLine(lines.at(-1));

  if (firstLine !== BEGIN_PATCH_MARKER) {
    invalidPatch(`The first line of the patch must be '${BEGIN_PATCH_MARKER}'`);
  }
  if (lastLine !== END_PATCH_MARKER) {
    invalidPatch(`The last line of the patch must be '${END_PATCH_MARKER}'`);
  }
  return lines;
}

function parseUpdateFileChunk(
  lines: string[],
  lineNumber: number,
  allowMissingContext: boolean,
): { chunk: UpdateFileChunk; parsedLines: number } {
  if (lines.length === 0) {
    invalidHunk(lineNumber, "Update hunk does not contain any lines");
  }

  let changeContext: string | undefined;
  let startIndex = 0;

  if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) {
    startIndex = 1;
  } else if (lines[0]?.startsWith(CHANGE_CONTEXT_MARKER)) {
    changeContext = lines[0].slice(CHANGE_CONTEXT_MARKER.length);
    startIndex = 1;
  } else if (!allowMissingContext) {
    invalidHunk(
      lineNumber,
      `Expected update hunk to start with a @@ context marker, got: '${lines[0]}'`,
    );
  }

  if (startIndex >= lines.length) {
    invalidHunk(lineNumber + 1, "Update hunk does not contain any lines");
  }

  const chunk: UpdateFileChunk = {
    changeContext,
    oldLines: [],
    newLines: [],
    isEndOfFile: false,
  };

  let parsedLines = 0;
  for (const line of lines.slice(startIndex)) {
    if (line === EOF_MARKER) {
      if (parsedLines === 0) {
        invalidHunk(lineNumber + 1, "Update hunk does not contain any lines");
      }
      chunk.isEndOfFile = true;
      parsedLines += 1;
      break;
    }

    const prefix = line.charAt(0);
    if (!line.length) {
      chunk.oldLines.push("");
      chunk.newLines.push("");
      parsedLines += 1;
      continue;
    }

    if (prefix === " ") {
      chunk.oldLines.push(line.slice(1));
      chunk.newLines.push(line.slice(1));
      parsedLines += 1;
      continue;
    }

    if (prefix === "+") {
      chunk.newLines.push(line.slice(1));
      parsedLines += 1;
      continue;
    }

    if (prefix === "-") {
      chunk.oldLines.push(line.slice(1));
      parsedLines += 1;
      continue;
    }

    if (parsedLines === 0) {
      invalidHunk(
        lineNumber + 1,
        `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
      );
    }

    break;
  }

  return {
    chunk,
    parsedLines: parsedLines + startIndex,
  };
}

function parseOneHunk(
  lines: string[],
  lineNumber: number,
): { hunk: PatchHunk; parsedLines: number } {
  const firstLine = lines[0]?.trim() ?? "";

  if (firstLine.startsWith(ADD_FILE_MARKER)) {
    const filePath = firstLine.slice(ADD_FILE_MARKER.length);
    let contents = "";
    let parsedLines = 1;
    for (const addLine of lines.slice(1)) {
      if (!addLine.startsWith("+")) {
        break;
      }
      contents += `${addLine.slice(1)}\n`;
      parsedLines += 1;
    }
    return {
      hunk: { type: "add", path: filePath, contents },
      parsedLines,
    };
  }

  if (firstLine.startsWith(DELETE_FILE_MARKER)) {
    return {
      hunk: { type: "delete", path: firstLine.slice(DELETE_FILE_MARKER.length) },
      parsedLines: 1,
    };
  }

  if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
    const filePath = firstLine.slice(UPDATE_FILE_MARKER.length);
    let remainingLines = lines.slice(1);
    let parsedLines = 1;
    let movePath: string | undefined;

    if (remainingLines[0]?.startsWith(MOVE_TO_MARKER)) {
      movePath = remainingLines[0].slice(MOVE_TO_MARKER.length);
      remainingLines = remainingLines.slice(1);
      parsedLines += 1;
    }

    const chunks: UpdateFileChunk[] = [];
    while (remainingLines.length > 0) {
      if (!remainingLines[0].trim()) {
        remainingLines = remainingLines.slice(1);
        parsedLines += 1;
        continue;
      }
      if (remainingLines[0].startsWith("***")) {
        break;
      }

      const { chunk, parsedLines: chunkLines } = parseUpdateFileChunk(
        remainingLines,
        lineNumber + parsedLines,
        chunks.length === 0,
      );
      chunks.push(chunk);
      remainingLines = remainingLines.slice(chunkLines);
      parsedLines += chunkLines;
    }

    if (chunks.length === 0) {
      invalidHunk(lineNumber, `Update file hunk for path '${filePath}' is empty`);
    }

    return {
      hunk: {
        type: "update",
        path: filePath,
        ...(movePath ? { movePath } : {}),
        chunks,
      },
      parsedLines,
    };
  }

  invalidHunk(
    lineNumber,
    `'${firstLine}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
  );
}

export function parsePatch(patch: string): ApplyPatchArgs {
  const normalizedInput = unwrapPatchInput(patch);
  const rawLines = normalizedInput.trim().split(/\r?\n/);
  const lines = parsePatchTextStrict(rawLines);

  const hunks: PatchHunk[] = [];
  let remainingLines = lines.slice(1, Math.max(1, lines.length - 1));
  let lineNumber = 2;

  while (remainingLines.length > 0) {
    const { hunk, parsedLines } = parseOneHunk(remainingLines, lineNumber);
    hunks.push(hunk);
    remainingLines = remainingLines.slice(parsedLines);
    lineNumber += parsedLines;
  }

  return {
    patch: lines.join("\n"),
    hunks,
  };
}
