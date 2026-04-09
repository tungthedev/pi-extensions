import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";

import { createReadTool, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { shortenPath } from "../codex-content/shared/text.ts";
import { applyResolvedToolset } from "../shared/toolset-resolver.ts";

const ENHANCED_READ_TOOL_NAME = "read_file";

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

async function syncReadToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerReadExtension(pi: ExtensionAPI): void {
  const nativeReadDefinition = createReadToolDefinition(process.cwd());

  pi.on("session_start", async (_event, ctx) => {
    await syncReadToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await syncReadToolSet(pi, ctx);
  });

  pi.registerTool({
    name: ENHANCED_READ_TOOL_NAME,
    label: ENHANCED_READ_TOOL_NAME,
    description: READ_FILE_DESCRIPTION,
    parameters: readFileSchema,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const nativeRead = createReadTool(ctx.cwd);
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
      return nativeReadDefinition.renderResult!(
        result as never,
        options,
        theme,
        context as never,
      );
    },
  });
}
