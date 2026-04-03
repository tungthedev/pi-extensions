import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";

import { resolveAbsolutePathWithVariants } from "../../codex-content/tools/runtime.ts";

type PatchResultDetails = {
  filePath: string;
  replacements: number;
};

function replaceOnce(source: string, oldString: string, newString: string): { text: string; replacements: number } {
  const firstIndex = source.indexOf(oldString);
  if (firstIndex === -1) {
    throw new Error("old_string not found in file");
  }
  const secondIndex = source.indexOf(oldString, firstIndex + oldString.length);
  if (secondIndex !== -1) {
    throw new Error("old_string is not unique in file; provide more context or set replace_all to true");
  }

  return {
    text: `${source.slice(0, firstIndex)}${newString}${source.slice(firstIndex + oldString.length)}`,
    replacements: 1,
  };
}

function replaceAllOccurrences(source: string, oldString: string, newString: string): { text: string; replacements: number } {
  let replacements = 0;
  const text = source.replaceAll(oldString, () => {
    replacements += 1;
    return newString;
  });
  if (replacements === 0) {
    throw new Error("old_string not found in file");
  }
  return { text, replacements };
}

export function registerForgePatchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "patch",
    label: "patch",
    description:
      "Apply an exact text replacement to a file. Use for targeted edits after reading the surrounding code.",
    promptSnippet: "Apply an exact text replacement to an existing file",
    promptGuidelines: [
      "Prefer patch over broad file rewrites for focused edits.",
      "Read the target file before patching so the replacement context is accurate.",
    ],
    parameters: Type.Object({
      file_path: Type.String({ description: "Path to the file to modify." }),
      old_string: Type.String({ description: "Exact text to replace." }),
      new_string: Type.String({ description: "Replacement text." }),
      replace_all: Type.Optional(Type.Boolean({ description: "Replace all occurrences when true." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const filePath = resolveAbsolutePathWithVariants(ctx.cwd, params.file_path);
      const original = await fs.readFile(filePath, "utf-8");
      const updated = params.replace_all
        ? replaceAllOccurrences(original, params.old_string, params.new_string)
        : replaceOnce(original, params.old_string, params.new_string);

      await withFileMutationQueue(filePath, async () => {
        await fs.writeFile(filePath, updated.text, "utf-8");
      });

      const details: PatchResultDetails = {
        filePath,
        replacements: updated.replacements,
      };

      return {
        content: [
          {
            type: "text",
            text: `Patched ${filePath} (${updated.replacements} replacement${updated.replacements === 1 ? "" : "s"})`,
          },
        ],
        details,
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("patch "))}${theme.fg("accent", args.file_path)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as PatchResultDetails | undefined;
      const text = details
        ? `patched ${details.replacements} replacement${details.replacements === 1 ? "" : "s"}`
        : (result.content[0]?.type === "text" ? result.content[0].text : "patched");
      return new Text(theme.fg("success", text), 0, 0);
    },
  });
}

export { replaceAllOccurrences, replaceOnce };
