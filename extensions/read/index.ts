import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";

import { createReadTool, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { shortenPath } from "../shared/text.ts";
import { applyResolvedToolset } from "../shared/toolset-resolver.ts";

const CANONICAL_READ_TOOL_NAME = "read";

const READ_DESCRIPTION =
  "Read the contents of a file. Accepts absolute paths, cwd-relative paths, @-prefixed paths, and ~ home-directory paths. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset/limit until complete.";

function formatReadCall(args: { path?: string; offset?: number; limit?: number }): string {
  const targetPath = shortenPath(args.path || ".");
  if (args.offset === undefined && args.limit === undefined) {
    return `Read ${targetPath}`;
  }

  const start = args.offset ?? 1;
  const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
  return `Read ${targetPath}:${start}${end ? `-${end}` : ""}`;
}

function renderReadCall(theme: Theme, args: { path?: string; offset?: number; limit?: number }): Text {
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
    ...nativeReadDefinition,
    name: CANONICAL_READ_TOOL_NAME,
    label: CANONICAL_READ_TOOL_NAME,
    description: READ_DESCRIPTION,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const nativeRead = createReadTool(ctx.cwd);
      return await nativeRead.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, _context) {
      return renderReadCall(theme, args as { path?: string; offset?: number; limit?: number });
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
