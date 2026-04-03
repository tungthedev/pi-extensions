import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import {
  executeAskUserRequest,
  RequestOptionSchema,
  RequestQuestionSchema,
} from "../../ask-user/index.ts";
import { renderEmptySlot, renderFallbackResult } from "../renderers/common.ts";
import { renderRequestUserInputResult } from "../renderers/request-user-input.ts";

export function registerRequestUserInputTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "request_user_input",
    label: "request_user_input",
    description: "Request user input for one to three short questions and wait for the response.",
    parameters: Type.Object({
      questions: Type.Optional(
        Type.Array(RequestQuestionSchema, {
          description: "Questions to show the user. Prefer 1 and do not exceed 3.",
        }),
      ),
      question: Type.Optional(Type.String({ description: "The question to ask the user." })),
      prompt: Type.Optional(Type.String({ description: "Alias for question." })),
      options: Type.Optional(
        Type.Array(RequestOptionSchema, { description: "Optional predefined answers." }),
      ),
      allow_text_input: Type.Optional(
        Type.Boolean({
          description: "Whether to offer a custom typed answer in addition to options.",
        }),
      ),
      placeholder: Type.Optional(Type.String({ description: "Placeholder for typed responses." })),
      multi_line: Type.Optional(
        Type.Boolean({ description: "Use a multi-line editor for typed answers." }),
      ),
      default_value: Type.Optional(
        Type.String({
          description:
            "Prefilled value for multi-line answers, or placeholder fallback for single-line input.",
        }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({ description: "Optional timeout for select/input dialogs in milliseconds." }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeAskUserRequest(ctx, params);
    },
    renderCall() {
      return renderEmptySlot();
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return renderFallbackResult(result);
      return renderRequestUserInputResult(theme, result, expanded);
    },
  });
}
