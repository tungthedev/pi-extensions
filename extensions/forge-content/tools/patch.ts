import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

function formatPatchCallPath(args: { path?: string; file_path?: string } | undefined): string | null {
  if (typeof args?.path === "string") {
    return args.path;
  }

  if (typeof args?.file_path === "string") {
    return args.file_path;
  }

  return null;
}

export function registerForgePatchTool(pi: ExtensionAPI): void {
  const baseDefinition = createEditToolDefinition(process.cwd());
  const usesMultiEditSchema = Object.prototype.hasOwnProperty.call(
    (baseDefinition.parameters as { properties?: Record<string, unknown> }).properties ?? {},
    "edits",
  );

  pi.registerTool({
    ...baseDefinition,
    name: "patch",
    label: "patch",
    description: usesMultiEditSchema
      ? "Patch a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file."
      : "Patch a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.",
    promptSnippet: usesMultiEditSchema
      ? "Make precise file edits with exact text replacement"
      : "Make surgical edits to files (find exact text and replace)",
    promptGuidelines: usesMultiEditSchema
      ? [
          "Use patch for precise changes (edits[].oldText must match exactly)",
          "When changing multiple separate locations in one file, use one patch call with multiple entries in edits[] instead of multiple patch calls",
          "Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.",
          "Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.",
        ]
      : ["Use patch for precise changes (old text must match exactly)."],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const runtimeDefinition = createEditToolDefinition(ctx.cwd);
      return await runtimeDefinition.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      const path = formatPatchCallPath(args as { path?: string; file_path?: string } | undefined);
      text.setText(
        `${theme.fg("toolTitle", theme.bold("patch"))} ${path ? theme.fg("accent", path) : theme.fg("toolOutput", "...")}`,
      );
      return text;
    },
  });
}
