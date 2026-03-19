import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import { applyPatch as runNativeApplyPatch } from "../apply-patch.ts";
import { renderApplyPatchResult } from "../renderers/apply-patch.ts";
import { trimToBudget } from "./runtime.ts";

export function registerApplyPatchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description:
      "Use the apply_patch tool to edit files. Provide raw patch text, a heredoc body, or a simple apply_patch heredoc invocation in the input field.",
    parameters: Type.Object({
      input: Type.String({ description: "Patch text or a simple apply_patch heredoc invocation." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await runNativeApplyPatch(params.input, ctx.cwd);
        const trimmed = trimToBudget(result.summary.trimEnd() || "Patch applied");

        return {
          content: [{ type: "text", text: trimmed.text }],
          details: { exitCode: 0, affected: result.affected, files: result.files },
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const trimmed = trimToBudget(message);
        return {
          content: [{ type: "text", text: trimmed.text }],
          details: { exitCode: 1 },
          isError: true,
        };
      }
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return undefined;
      return renderApplyPatchResult(theme, result, expanded);
    },
  });
}
