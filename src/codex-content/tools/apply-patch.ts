import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import { applyPatch as runNativeApplyPatch } from "../apply-patch.ts";
import { renderEmptySlot, renderFallbackResult } from "../renderers/common.ts";
import { renderApplyPatchResult } from "../renderers/apply-patch.ts";
import { trimToBudget } from "./runtime.ts";

type ToolResult<TDetails> = AgentToolResult<TDetails> & { isError?: boolean };

function buildApplyPatchResult(
  text: string,
  details: Record<string, unknown>,
  isError: boolean,
): ToolResult<Record<string, unknown>> {
  const trimmed = trimToBudget(text);
  return {
    content: [{ type: "text" as const, text: trimmed.text }],
    details,
    isError,
  };
}

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
        return buildApplyPatchResult(
          result.summary.trimEnd() || "Patch applied",
          { exitCode: 0, affected: result.affected, files: result.files },
          false,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildApplyPatchResult(message, { exitCode: 1 }, true);
      }
    },
    renderCall() {
      return renderEmptySlot();
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return renderFallbackResult(result);
      return renderApplyPatchResult(theme, result, expanded);
    },
  });
}
