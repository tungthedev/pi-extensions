import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import readline from "node:readline";

import { detectSupportedImageMimeTypeFromFile } from "../image-utils.ts";
import {
  COMMENT_PREFIXES,
  MAX_INDENTATION_FILE_BYTES,
  MAX_SLICE_FILE_BYTES,
  resolveAbsolutePath,
  TAB_WIDTH,
  trimToBudget,
  truncateLine,
} from "./runtime.ts";

export type IndentationOptions = {
  anchor_line?: number;
  max_levels?: number;
  include_siblings?: boolean;
  include_header?: boolean;
  max_lines?: number;
};

type LineRecord = {
  number: number;
  raw: string;
  display: string;
  indent: number;
};

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

function trimEmptyEdges(records: LineRecord[]): LineRecord[] {
  let start = 0;
  let end = records.length;

  while (start < end && records[start].raw.trim().length === 0) start += 1;
  while (end > start && records[end - 1].raw.trim().length === 0) end -= 1;

  return records.slice(start, end);
}

async function readSliceFromFile(
  absolutePath: string,
  offset: number,
  limit: number,
): Promise<string> {
  if (offset < 1) throw new Error("offset must be a 1-indexed line number");
  if (limit < 1) throw new Error("limit must be greater than zero");

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
      if (lineNumber < offset) {
        continue;
      }
      if (visible.length >= limit) {
        break;
      }
      visible.push(`L${lineNumber}: ${truncateLine(line)}`);
      if (visible.length >= limit) {
        break;
      }
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
  const anchorLine = indentation.anchor_line ?? offset;
  const maxLevels = indentation.max_levels ?? 0;
  const includeSiblings = indentation.include_siblings ?? false;
  const includeHeader = indentation.include_header ?? true;
  const maxLines = indentation.max_lines ?? limit;

  if (anchorLine < 1) throw new Error("anchor_line must be a 1-indexed line number");
  if (anchorLine > records.length) throw new Error("anchor_line exceeds file length");
  if (limit < 1 || maxLines < 1) throw new Error("limit must be greater than zero");

  const effectiveIndents: number[] = [];
  let previousIndent = 0;
  for (const record of records) {
    if (record.raw.trim().length === 0) effectiveIndents.push(previousIndent);
    else {
      previousIndent = record.indent;
      effectiveIndents.push(previousIndent);
    }
  }

  const anchorIndex = anchorLine - 1;
  const anchorIndent = effectiveIndents[anchorIndex];
  const minIndent = maxLevels > 0 ? Math.max(0, anchorIndent - maxLevels * TAB_WIDTH) : 0;
  const finalLimit = Math.min(limit, maxLines, records.length);

  const selected = new Set<number>([anchorIndex]);
  let up = anchorIndex - 1;
  let down = anchorIndex + 1;
  let upMinIndentHits = 0;
  let downMinIndentHits = 0;

  while (selected.size < finalLimit) {
    let progressed = false;

    if (up >= 0) {
      if (effectiveIndents[up] >= minIndent) {
        let take = true;
        if (effectiveIndents[up] === minIndent && !includeSiblings) {
          const allowHeaderComment = includeHeader && isComment(records[up].raw);
          take = allowHeaderComment || upMinIndentHits === 0;
          if (take) upMinIndentHits += 1;
          else up = -1;
        }

        if (take) {
          selected.add(up);
          progressed = true;
          up -= 1;
        }
      } else {
        up = -1;
      }
    }

    if (selected.size >= finalLimit) break;

    if (down < records.length) {
      if (effectiveIndents[down] >= minIndent) {
        let take = true;
        if (effectiveIndents[down] === minIndent && !includeSiblings) {
          take = downMinIndentHits === 0;
          if (take) downMinIndentHits += 1;
          else down = records.length;
        }

        if (take) {
          selected.add(down);
          progressed = true;
          down += 1;
        }
      } else {
        down = records.length;
      }
    }

    if (!progressed) break;
  }

  const ordered = [...selected]
    .sort((left: number, right: number) => left - right)
    .map((index: number) => records[index]);

  return trimEmptyEdges(ordered)
    .map((record) => `L${record.number}: ${record.display}`)
    .join("\n");
}

export function registerReadFileTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "read_file",
    label: "read_file",
    description:
      "Reads a local file with 1-indexed line numbers, supporting slice and indentation-aware block modes.",
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
      const absolutePath = resolveAbsolutePath(ctx.cwd, params.file_path);
      const stats = await fs.stat(absolutePath);
      const offset = params.offset ?? 1;
      const limit = params.limit ?? 2000;
      const mode = params.mode === "indentation" ? "indentation" : "slice";

      if (!stats.isFile()) {
        throw new Error("read_file only supports regular files");
      }

      const imageMimeType = await detectSupportedImageMimeTypeFromFile(absolutePath);
      if (imageMimeType) {
        return {
          content: [
            {
              type: "text",
              text: `File is a supported image (${imageMimeType}). Use view_image with the same path instead.`,
            },
          ],
          details: {
            filePath: absolutePath,
            mode: "image_redirect",
            mimeType: imageMimeType,
            truncated: false,
          },
        };
      }

      if (mode === "indentation" && stats.size > MAX_INDENTATION_FILE_BYTES) {
        throw new Error(
          `File too large for indentation mode (${stats.size} bytes). Use slice mode instead.`,
        );
      }
      if (mode === "slice" && stats.size > MAX_SLICE_FILE_BYTES) {
        throw new Error(
          `File too large for safe slice mode (${stats.size} bytes). Narrow the file or inspect it with another tool first.`,
        );
      }

      const output =
        mode === "indentation"
          ? (() => {
              return fs.readFile(absolutePath, "utf-8").then((content) => {
                const records = buildLineRecords(content);
                return readIndentationBlock(records, offset, limit, params.indentation);
              });
            })()
          : readSliceFromFile(absolutePath, offset, limit);
      const trimmed = trimToBudget(await output);

      return {
        content: [{ type: "text", text: trimmed.text }],
        details: { filePath: absolutePath, mode, truncated: trimmed.truncated },
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
