import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import { applyPatch as runNativeApplyPatch } from "../../shared/patch/apply.ts";
import { renderApplyPatchResult } from "../../shared/patch/render.ts";
import { renderEmptySlot, renderFallbackResult } from "../../shared/renderers/common.ts";
import { trimToBudget } from "../../shared/runtime-paths.ts";

const DROID_APPLY_PATCH_DESCRIPTION = `Use this tool to edit files.
Your patch language is a stripped‑down, file‑oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high‑level envelope:

*** Begin Patch
[ one file section ]
*** End Patch

Within that envelope, you get one file operation.
You MUST include a header to specify the action you are taking.
Each operation starts with one of two headers:

*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).
*** Update File: <path> - patch an existing file in place (optionally with a rename).

Then one or more “hunks”, each introduced by @@ (optionally followed by a hunk header).
Within a hunk each line starts with:

For instructions on [context_before] and [context_after]:
- By default, show 3 lines of code immediately above and 3 lines immediately below each change. If a change is within 3 lines of a previous change, do NOT duplicate the first change's [context_after] lines in the second change's [context_before] lines.
- If 3 lines of context is insufficient to uniquely identify the snippet of code within the file, use the @@ operator to indicate the class or function to which the snippet belongs.
- If a code block is repeated so many times in a class or function such that even a single @@ statement and 3 lines of context cannot uniquely identify the snippet of code, you can use multiple @@ statements to jump to the right context.`;

export function registerDroidApplyPatchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ApplyPatch",
    label: "Apply Patch",
    description: DROID_APPLY_PATCH_DESCRIPTION,
    parameters: Type.Object({
      input: Type.String({ description: "The apply_patch command that you wish to execute." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await runNativeApplyPatch(params.input, ctx.cwd);
        const trimmed = trimToBudget(result.summary.trimEnd() || "Patch applied");
        return {
          content: [{ type: "text" as const, text: trimmed.text }],
          details: { exitCode: 0, affected: result.affected, files: result.files },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const trimmed = trimToBudget(message);
        return {
          content: [{ type: "text" as const, text: trimmed.text }],
          details: { exitCode: 1 },
          isError: true as const,
        };
      }
    },
    renderCall() {
      return renderEmptySlot()
    },
    renderResult(result, options, theme) {
      if (options.isPartial) return renderFallbackResult(result);
      return renderApplyPatchResult(theme, result, options.expanded);
    },
  });
}
