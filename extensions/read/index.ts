import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createReadTool } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const READ_FILE_DESCRIPTION =
  "Read the contents of a file. Accepts absolute paths, cwd-relative paths, @-prefixed paths, and ~ home-directory paths. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.";

const readFileSchema = Type.Object({
  file_path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

function formatReadFileCall(args: { file_path?: string; offset?: number; limit?: number }): string {
  const filePath = args.file_path ?? "...";
  if (args.offset === undefined && args.limit === undefined) {
    return `read ${filePath}`;
  }

  const startLine = args.offset ?? 1;
  const endLine = args.limit !== undefined ? startLine + args.limit - 1 : undefined;
  return `read ${filePath}:${startLine}${endLine ? `-${endLine}` : ""}`;
}

export default function registerReadExtension(pi: ExtensionAPI): void {
  const nativeRead = createReadTool(process.cwd());

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
    renderCall(args) {
      return new Text(formatReadFileCall(args), 0, 0);
    },
    renderResult() {
      return new Container();
    },
  });
}
