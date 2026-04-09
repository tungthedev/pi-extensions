import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createReadTool, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { shortenPath } from "../../codex-content/shared/text.ts";

const DROID_READ_DESCRIPTION = `Read the contents of a file. By default, reads the entire file, but for large text files,
results are truncated to the first 2400 lines to preserve token usage. Use offset and limit parameters
to read specific portions of huge files when needed. Requires absolute file paths.
For image files (JPEG, PNG) up to 5MB, returns the actual image content that you can view and analyze directly.
Use image_quality="high" for higher fidelity image reading (~1MB, 2048px) when details matter.
For PDF files up to 3MB, returns the document content that you can view and analyze directly.`;

const DROID_READ_PARAMETERS = Type.Object({
  file_path: Type.String({
    description: "The absolute path to the file to read (must be absolute, not relative)",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "The line number to start reading from (0-based, defaults to 0)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "The maximum number of lines to read (defaults to 2400)",
    }),
  ),
  image_quality: Type.Optional(
    Type.Union([Type.Literal("default"), Type.Literal("high")], {
      description:
        'Image compression quality. "default" uses standard compression (~200KB), "high" uses higher fidelity (~1MB). Only applicable when reading image files.',
    }),
  ),
});

function renderReadCall(
  theme: Theme,
  args: { file_path?: string; offset?: number; limit?: number },
): Text {
  const targetPath = shortenPath(args.file_path || ".");
  const start = args.offset;
  const limit = args.limit;
  const suffix =
    start === undefined && limit === undefined
      ? ""
      : `:${start ?? 0}${typeof limit === "number" ? `-${(start ?? 0) + limit - 1}` : ""}`;

  return new Text(
    `${theme.fg("toolTitle", theme.bold("Read "))}${theme.fg("accent", `${targetPath}${suffix}`)}`,
    0,
    0,
  );
}

export function registerDroidReadTool(pi: ExtensionAPI): void {
  const nativeRead = createReadTool(process.cwd());
  const nativeReadDefinition = createReadToolDefinition(process.cwd());

  pi.registerTool({
    name: "Read",
    label: "Read",
    description: DROID_READ_DESCRIPTION,
    parameters: DROID_READ_PARAMETERS,
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
    renderCall(args, theme) {
      return renderReadCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      return nativeReadDefinition.renderResult!(result as never, options, theme, context as never);
    },
  });
}
