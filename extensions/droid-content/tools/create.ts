import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createWriteTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { renderWriteResult } from "../../codex-content/renderers/write.ts";
import { Type } from "@sinclair/typebox";

import { shortenPath } from "../../codex-content/shared/text.ts";

const DROID_CREATE_DESCRIPTION =
  "Creates a new file on the file system with the specified content. Prefer editing existing files, unless you need to create a new file.";

const DROID_CREATE_PARAMETERS = Type.Object({
  file_path: Type.String({ description: "The path to the file for the new file." }),
  content: Type.String({ description: "The content to write to the file" }),
});

function renderCreateCall(theme: Theme, args: { file_path?: string }): Text {
  return new Text(
    `${theme.fg("toolTitle", theme.bold("Create "))}${theme.fg("accent", shortenPath(args.file_path || "."))}`,
    0,
    0,
  );
}

export function registerDroidCreateTool(pi: ExtensionAPI): void {
  const nativeWrite = createWriteTool(process.cwd());

  pi.registerTool({
    name: "Create",
    label: "Create",
    description: DROID_CREATE_DESCRIPTION,
    parameters: DROID_CREATE_PARAMETERS,
    async execute(toolCallId, params, signal, onUpdate) {
      return await nativeWrite.execute(
        toolCallId,
        {
          path: params.file_path,
          content: params.content,
        },
        signal,
        onUpdate,
      );
    },
    renderCall(args, theme) {
      return renderCreateCall(theme, args);
    },
    renderResult(result, _options, theme, context) {
      return renderWriteResult(
        theme,
        {
          path: context.args?.file_path,
          content: context.args?.content,
        },
        result,
      );
    },
  });
}
