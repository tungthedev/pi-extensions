import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createReadTool, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { shortenPath } from "../codex-content/shared/text.ts";

const READ_FILE_DESCRIPTION =
  "Read the contents of a file. Accepts absolute paths, cwd-relative paths, @-prefixed paths, and ~ home-directory paths. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.";

const readFileSchema = Type.Object({
  file_path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

function formatReadCall(args: { file_path?: string; offset?: number; limit?: number }): string {
  const targetPath = shortenPath(args.file_path || ".");
  if (args.offset === undefined && args.limit === undefined) {
    return `Read ${targetPath}`;
  }

  const start = args.offset ?? 1;
  const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
  return `Read ${targetPath}:${start}${end ? `-${end}` : ""}`;
}

function renderReadCall(theme: Theme, args: { file_path?: string; offset?: number; limit?: number }): Text {
  const detail = formatReadCall(args).replace(/^Read\s+/, "");
  return new Text(
    `${theme.fg("toolTitle", theme.bold("Read "))}${theme.fg("accent", detail)}`,
    0,
    0,
  );
}

export default function registerReadExtension(pi: ExtensionAPI): void {
  const nativeRead = createReadTool(process.cwd());
  const nativeReadDefinition = createReadToolDefinition(process.cwd());

  pi.registerTool({
    name: "read_file",
    label: "read_file",
    description: READ_FILE_DESCRIPTION,
    parameters: readFileSchema,
    async execute(toolCallId, params, signal, onUpdate) {
      return await nativeRead.execute(
        toolCallId,
        {
          path: params.file_path,
          offset: params.offset,
          limit: params.limit,
        },
        signal,
        onUpdate,
      );
    },
    renderCall(args, theme, _context) {
      return renderReadCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      if (!options.expanded) {
        return new Container();
      }

      return nativeReadDefinition.renderResult!(
        result as never,
        options,
        theme,
        context as never,
      );
    },
  });
}
