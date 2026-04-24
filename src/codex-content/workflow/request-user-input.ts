import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import { executeAskUserRequest, RequestQuestionSchema } from "../../ask-user/index.ts";
import { renderFallbackResult, renderToolCall } from "../renderers/common.ts";
import { renderRequestUserInputResult } from "../renderers/request-user-input.ts";

export function registerRequestUserInputTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "request_user_input",
    label: "request_user_input",
    description: "Request user input for one to four short questions and wait for the response.",
    parameters: Type.Object({
      questions: Type.Array(RequestQuestionSchema, {
        description: "Questions to show the user. Ask one to four short questions.",
        minItems: 1,
        maxItems: 4,
      }),
      timeout_ms: Type.Optional(
        Type.Number({
          description: "Optional timeout for select/input dialogs in milliseconds. Defaults to 60000.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeAskUserRequest(ctx, params);
    },
    renderCall(_args, theme) {
      return renderToolCall(theme, "Ask user");
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return renderFallbackResult(result);
      return renderRequestUserInputResult(theme, result, expanded);
    },
  });
}
