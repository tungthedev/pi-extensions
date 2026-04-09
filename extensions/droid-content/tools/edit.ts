import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import { createEditToolDefinition, createWriteTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";

import { shortenPath } from "../../codex-content/shared/text.ts";
import { resolveAbsolutePath } from "../../codex-content/tools/runtime.ts";

const DROID_EDIT_DESCRIPTION = `
Edit the contents of a file by finding and replacing text.

Make sure the Read tool was called first before making edits, as this tool requires the file to be read first.
Preserve the exact indentation (tabs or spaces).
Never write a new file with this tool; prefer using Create tool for that.
'old_str' must be unique in the file, or 'change_all' must be true to replace all occurrences (for example, it's useful for variable renaming).
make sure to provide the larger 'old_str' with more surrounding context to narrow down the exact match.
`.trim();

const DROID_EDIT_PARAMETERS = Type.Object({
  file_path: Type.String({ description: "The path to the file to edit" }),
  old_str: Type.String({ description: "The exact text to find and replace in the file" }),
  new_str: Type.String({ description: "The text to replace the old_str with" }),
  change_all: Type.Optional(
    Type.Boolean({
      description:
        "Whether to replace all occurrences (true) or just the first one (false). Defaults to false.",
    }),
  ),
});

function renderEditCall(theme: Theme, args: { file_path?: string }): Text {
  return new Text(
    `${theme.fg("toolTitle", theme.bold("Edit "))}${theme.fg("accent", shortenPath(args.file_path || "."))}`,
    0,
    0,
  );
}

function buildSuccessResult(filePath: string) {
  return {
    content: [{ type: "text" as const, text: `The file ${filePath} has been updated successfully.` }],
    details: { file_path: filePath },
  };
}

export function registerDroidEditTool(pi: ExtensionAPI): void {
  const nativeEdit = createEditToolDefinition(process.cwd());
  const nativeWrite = createWriteTool(process.cwd());

  pi.registerTool({
    name: "Edit",
    label: "Edit",
    description: DROID_EDIT_DESCRIPTION,
    parameters: DROID_EDIT_PARAMETERS,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!params.change_all) {
        return await nativeEdit.execute(
          toolCallId,
          {
            path: params.file_path,
            edits: [{ oldText: params.old_str, newText: params.new_str }],
          },
          signal,
          onUpdate,
          ctx,
        );
      }

      const absolutePath = resolveAbsolutePath(ctx.cwd, params.file_path);
      const current = await fs.readFile(absolutePath, "utf8");
      if (!current.includes(params.old_str)) {
        throw new Error("old_str not found in file");
      }

      const next = current.split(params.old_str).join(params.new_str);
      await nativeWrite.execute(
        toolCallId,
        {
          path: params.file_path,
          content: next,
        },
        signal,
        onUpdate,
      );

      return buildSuccessResult(params.file_path);
    },
    renderCall(args, theme) {
      return renderEditCall(theme, args);
    },
    renderResult(result, options, theme, context) {
      return nativeEdit.renderResult
        ? nativeEdit.renderResult(result as any, options, theme, context as never)
        : new Text(result.content[0]?.type === "text" ? result.content[0].text : "Edited", 0, 0);
    },
  });
}
