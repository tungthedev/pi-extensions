import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import readline from "node:readline";

import { detectSupportedImageMimeTypeFromFile } from "../image-utils.ts";
import { renderEmptySlot } from "../renderers/common.ts";
import {
  COMMENT_PREFIXES,
  MAX_INDENTATION_FILE_BYTES,
  MAX_SLICE_FILE_BYTES,
  resolveAbsolutePathWithVariants,
  TAB_WIDTH,
  trimToBudget,
  truncateLine,
} from "./runtime.ts";

const SECRET_PATTERNS = [/^\.env$/, /^\.env\..+$/];
const SECRET_EXCEPTION_PATTERNS = [
  /^\.env\.example(?:\..+)?$/,
  /^\.env\.sample(?:\..+)?$/,
  /^\.env\.template(?:\..+)?$/,
];

export type IndentationOptions = {
  anchor_line?: number;
  max_levels?: number;
  include_siblings?: boolean;
  include_header?: boolean;
  max_lines?: number;
};

type ReadMode = "slice" | "indentation";

type ReadFileToolResultMode = ReadMode | "secret_blocked" | "image_redirect";

type LineRecord = {
  number: number;
  raw: string;
  display: string;
  indent: number;
};

type IndentationSelectionOptions = {
  anchorIndex: number;
  minIndent: number;
  includeSiblings: boolean;
  includeHeader: boolean;
  finalLimit: number;
};

type Direction = "up" | "down";

type DirectionState = {
  index: number;
  minIndentHits: number;
};

type DirectionSelection = {
  selectedIndex?: number;
  nextIndex: number;
  minIndentHits: number;
};

type FileStats = Awaited<ReturnType<typeof fs.stat>>;
type ToolResult<TDetails> = AgentToolResult<TDetails> & { isError?: boolean };

function measureIndent(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === " ") indent += 1;
    else if (char === "\t") indent += TAB_WIDTH;
    else break;
  }
  return indent;
}

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function buildLineRecords(content: string): LineRecord[] {
  return content
    .replace(/\r/g, "")
    .split("\n")
    .map((raw, index) => ({
      number: index + 1,
      raw,
      display: truncateLine(raw),
      indent: measureIndent(raw),
    }));
}

export function isSecretFilePath(filePath: string): boolean {
  const baseName = filePath.split(/[\\/]/).at(-1) ?? filePath;
  if (SECRET_EXCEPTION_PATTERNS.some((pattern) => pattern.test(baseName))) return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(baseName));
}

function trimEmptyEdges(records: LineRecord[]): LineRecord[] {
  let start = 0;
  let end = records.length;

  while (start < end && records[start].raw.trim().length === 0) start += 1;
  while (end > start && records[end - 1].raw.trim().length === 0) end -= 1;

  return records.slice(start, end);
}

function normalizeReadMode(mode?: string): ReadMode {
  return mode === "indentation" ? "indentation" : "slice";
}

function buildTextResult(
  text: string,
  details: Record<string, unknown>,
  isError = false,
): ToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true } : {}),
  };
}

function buildReadToolResult(
  absolutePath: string,
  mode: ReadFileToolResultMode,
  options: { text: string; truncated: boolean; mimeType?: string; isError?: boolean },
) {
  return buildTextResult(
    options.text,
    {
      filePath: absolutePath,
      mode,
      truncated: options.truncated,
      ...(options.mimeType ? { mimeType: options.mimeType } : {}),
    },
    options.isError ?? false,
  );
}

function buildSecretBlockedResult(absolutePath: string) {
  return buildReadToolResult(absolutePath, "secret_blocked", {
    text: `Refused to read ${absolutePath}: file may contain secrets. Ask the user to share the relevant values instead.`,
    truncated: false,
    isError: true,
  });
}

function buildImageRedirectResult(absolutePath: string, mimeType: string) {
  return buildReadToolResult(absolutePath, "image_redirect", {
    text: `File is a supported image (${mimeType}). Use view_image with the same path instead.`,
    mimeType,
    truncated: false,
  });
}

function buildReadSuccessResult(absolutePath: string, mode: ReadMode, output: string) {
  const trimmed = trimToBudget(output);
  const text = trimmed.truncated
    ? `${trimmed.text}\n\n[Use offset/limit or indentation mode to narrow the read.]`
    : trimmed.text;

  return buildReadToolResult(absolutePath, mode, {
    text,
    truncated: trimmed.truncated,
  });
}

async function statFileOrThrow(absolutePath: string): Promise<FileStats> {
  try {
    return await fs.stat(absolutePath);
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError?.code === "ENOENT") {
      throw new Error(`file not found: ${absolutePath}`);
    }
    throw error;
  }
}

function validateRegularFile(stats: FileStats, absolutePath: string): void {
  if (stats.isFile()) {
    return;
  }

  throw new Error(`read_file only supports regular files: ${absolutePath}`);
}

function validateReadModeSize(mode: ReadMode, fileSize: number): void {
  if (mode === "indentation" && fileSize > MAX_INDENTATION_FILE_BYTES) {
    throw new Error(
      `File too large for indentation mode (${fileSize} bytes). Use slice mode instead.`,
    );
  }

  if (mode === "slice" && fileSize > MAX_SLICE_FILE_BYTES) {
    throw new Error(
      `File too large for safe slice mode (${fileSize} bytes). Narrow the file or inspect it with another tool first.`,
    );
  }
}

function validateSliceRange(offset: number, limit: number): void {
  if (offset < 1) throw new Error("offset must be a 1-indexed line number");
  if (limit < 1) throw new Error("limit must be greater than zero");
}

function buildEffectiveIndents(records: LineRecord[]): number[] {
  const effectiveIndents: number[] = [];
  let previousIndent = 0;

  for (const record of records) {
    if (record.raw.trim().length === 0) {
      effectiveIndents.push(previousIndent);
      continue;
    }

    previousIndent = record.indent;
    effectiveIndents.push(previousIndent);
  }

  return effectiveIndents;
}

function resolveIndentationSelectionOptions(
  records: LineRecord[],
  offset: number,
  limit: number,
  indentation: IndentationOptions,
  effectiveIndents: number[],
): IndentationSelectionOptions {
  const anchorLine = indentation.anchor_line ?? offset;
  const maxLevels = indentation.max_levels ?? 0;
  const includeSiblings = indentation.include_siblings ?? false;
  const includeHeader = indentation.include_header ?? true;
  const maxLines = indentation.max_lines ?? limit;

  if (anchorLine < 1) throw new Error("anchor_line must be a 1-indexed line number");
  if (anchorLine > records.length) throw new Error("anchor_line exceeds file length");
  if (limit < 1 || maxLines < 1) throw new Error("limit must be greater than zero");

  const anchorIndex = anchorLine - 1;
  const anchorIndent = effectiveIndents[anchorIndex];
  const minIndent = maxLevels > 0 ? Math.max(0, anchorIndent - maxLevels * TAB_WIDTH) : 0;

  return {
    anchorIndex,
    minIndent,
    includeSiblings,
    includeHeader,
    finalLimit: Math.min(limit, maxLines, records.length),
  };
}

function directionStep(direction: Direction): number {
  return direction === "up" ? -1 : 1;
}

function directionStopIndex(direction: Direction, recordCount: number): number {
  return direction === "up" ? -1 : recordCount;
}

function selectDirectionalIndex(
  records: LineRecord[],
  effectiveIndents: number[],
  state: DirectionState,
  options: Pick<IndentationSelectionOptions, "minIndent" | "includeSiblings" | "includeHeader">,
  direction: Direction,
): DirectionSelection {
  const { index, minIndentHits } = state;
  const stopIndex = directionStopIndex(direction, records.length);

  if (index < 0 || index >= records.length) {
    return { nextIndex: stopIndex, minIndentHits };
  }

  const indent = effectiveIndents[index];
  if (indent < options.minIndent) {
    return { nextIndex: stopIndex, minIndentHits };
  }

  const nextIndex = index + directionStep(direction);
  if (indent !== options.minIndent || options.includeSiblings) {
    return {
      selectedIndex: index,
      nextIndex,
      minIndentHits,
    };
  }

  const allowHeaderComment =
    direction === "up" && options.includeHeader && isComment(records[index].raw);
  if (allowHeaderComment || minIndentHits === 0) {
    return {
      selectedIndex: index,
      nextIndex,
      minIndentHits: minIndentHits + 1,
    };
  }

  return {
    nextIndex: stopIndex,
    minIndentHits,
  };
}

function selectIndentationIndexes(
  records: LineRecord[],
  effectiveIndents: number[],
  options: IndentationSelectionOptions,
): number[] {
  const selected = new Set<number>([options.anchorIndex]);
  let upState: DirectionState = { index: options.anchorIndex - 1, minIndentHits: 0 };
  let downState: DirectionState = { index: options.anchorIndex + 1, minIndentHits: 0 };

  while (selected.size < options.finalLimit) {
    let progressed = false;

    if (upState.index >= 0) {
      const next = selectDirectionalIndex(records, effectiveIndents, upState, options, "up");
      upState = { index: next.nextIndex, minIndentHits: next.minIndentHits };

      if (next.selectedIndex !== undefined) {
        selected.add(next.selectedIndex);
        progressed = true;
      }
    }

    if (selected.size >= options.finalLimit) {
      break;
    }

    if (downState.index < records.length) {
      const next = selectDirectionalIndex(records, effectiveIndents, downState, options, "down");
      downState = { index: next.nextIndex, minIndentHits: next.minIndentHits };

      if (next.selectedIndex !== undefined) {
        selected.add(next.selectedIndex);
        progressed = true;
      }
    }

    if (!progressed) {
      break;
    }
  }

  return [...selected].sort((left, right) => left - right);
}

function formatSelectedRecords(records: LineRecord[], selectedIndexes: number[]): string {
  return trimEmptyEdges(selectedIndexes.map((index) => records[index]))
    .map((record) => `L${record.number}: ${record.display}`)
    .join("\n");
}

async function readIndentationMode(
  absolutePath: string,
  offset: number,
  limit: number,
  indentation: IndentationOptions = {},
): Promise<string> {
  const content = await fs.readFile(absolutePath, "utf-8");
  const records = buildLineRecords(content);
  return readIndentationBlock(records, offset, limit, indentation);
}

async function readFileMode(
  absolutePath: string,
  mode: ReadMode,
  offset: number,
  limit: number,
  indentation: IndentationOptions | undefined,
): Promise<string> {
  if (mode === "slice") {
    return await readSliceFromFile(absolutePath, offset, limit);
  }

  return await readIndentationMode(absolutePath, offset, limit, indentation);
}

async function readSliceFromFile(
  absolutePath: string,
  offset: number,
  limit: number,
): Promise<string> {
  validateSliceRange(offset, limit);

  const input = createReadStream(absolutePath, { encoding: "utf-8" });
  const reader = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  const visible: string[] = [];
  let lineNumber = 0;

  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (lineNumber < offset) continue;

      visible.push(`L${lineNumber}: ${truncateLine(line)}`);
      if (visible.length >= limit) break;
    }
  } finally {
    reader.close();
    input.destroy();
  }

  if (visible.length === 0) {
    throw new Error("offset exceeds file length");
  }

  return visible.join("\n");
}

export function readIndentationBlock(
  records: LineRecord[],
  offset: number,
  limit: number,
  indentation: IndentationOptions = {},
): string {
  const effectiveIndents = buildEffectiveIndents(records);
  const selectionOptions = resolveIndentationSelectionOptions(
    records,
    offset,
    limit,
    indentation,
    effectiveIndents,
  );
  const selectedIndexes = selectIndentationIndexes(records, effectiveIndents, selectionOptions);
  return formatSelectedRecords(records, selectedIndexes);
}

export function registerReadFileTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "read_file",
    label: "read_file",
    description:
      "Reads a local file with 1-indexed line numbers, supporting slice and indentation-aware block modes. Accepts absolute paths, cwd-relative paths, `@`-prefixed paths, and `~` home-directory paths.",
    parameters: Type.Object({
      file_path: Type.String({ description: "Absolute path to the file" }),
      offset: Type.Optional(Type.Number({ description: "1-indexed line number to start from" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines to return" })),
      mode: Type.Optional(
        Type.String({ description: 'Optional mode selector: "slice" or "indentation".' }),
      ),
      indentation: Type.Optional(
        Type.Object({
          anchor_line: Type.Optional(Type.Number()),
          max_levels: Type.Optional(Type.Number()),
          include_siblings: Type.Optional(Type.Boolean()),
          include_header: Type.Optional(Type.Boolean()),
          max_lines: Type.Optional(Type.Number()),
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const absolutePath = resolveAbsolutePathWithVariants(ctx.cwd, params.file_path);
      const offset = params.offset ?? 1;
      const limit = params.limit ?? 2000;
      const mode = normalizeReadMode(params.mode);
      const stats = await statFileOrThrow(absolutePath);

      if (isSecretFilePath(absolutePath)) {
        return buildSecretBlockedResult(absolutePath);
      }

      validateRegularFile(stats, absolutePath);

      const imageMimeType = await detectSupportedImageMimeTypeFromFile(absolutePath);
      if (imageMimeType) {
        return buildImageRedirectResult(absolutePath, imageMimeType);
      }

      validateReadModeSize(mode, Number(stats.size));

      const output = await readFileMode(absolutePath, mode, offset, limit, params.indentation);
      return buildReadSuccessResult(absolutePath, mode, output);
    },
    renderCall() {
      return renderEmptySlot();
    },
    renderResult() {
      return renderEmptySlot();
    },
  });
}
