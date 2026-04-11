import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createWriteTool, createWriteToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { renderEmptySlot } from "../../shared/renderers/common.ts";
import { shortenPath } from "../../shared/text.ts";

const DROID_CREATE_DESCRIPTION =
  "Creates a new file on the file system with the specified content. Prefer editing existing files, unless you need to create a new file.";

const DROID_CREATE_PARAMETERS = Type.Object({
  file_path: Type.String({ description: "The path to the file for the new file." }),
  content: Type.String({ description: "The content to write to the file" }),
});

function lineCount(content: unknown): number | undefined {
  return typeof content === "string" ? content.split("\n").length : undefined;
}

function renderCreateCall(theme: Theme, args: { file_path?: string; content?: string }): Text {
  const path = shortenPath(args.file_path || ".");
  const lines = lineCount(args.content);
  const lineSuffix = typeof lines === "number" ? theme.fg("dim", ` (${lines} lines)`) : "";

  return new Text(
    `${theme.fg("toolTitle", theme.bold("Created "))}${theme.fg("accent", path)}${lineSuffix}`,
    0,
    0,
  );
}

export function registerDroidCreateTool(pi: ExtensionAPI): void {
  const nativeWrite = createWriteTool(process.cwd());
  const nativeWriteDefinition = createWriteToolDefinition(process.cwd());

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
    renderResult(result, options, theme, context) {
      if (context.isError) {
        return nativeWriteDefinition.renderResult!(result as never, options, theme, context as never);
      }

      if (!options.expanded) {
        return renderEmptySlot();
      }

      return nativeWriteDefinition.renderCall!(
        {
          path: context.args?.file_path,
          content: context.args?.content,
        },
        theme,
        {
          expanded: options.expanded,
          isPartial: options.isPartial,
          argsComplete: true,
          lastComponent: undefined,
        } as never,
      );
    },
  });
}
