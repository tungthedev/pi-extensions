import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import { executeAskUserRequest, RequestQuestionSchema } from "../../ask-user/index.ts";
import { renderFallbackResult, renderToolCall } from "../../shared/renderers/common.ts";
import { renderRequestUserInputResult } from "../../shared/request-user-input-render.ts";

const DROID_ASK_USER_DESCRIPTION = `Use this tool when you need to ask the user 1–4 quick questions at once during execution to clarify requirements or decisions.

Important:
- Keep the questionnaire short and focused.
- The tool can be used more than once if there are important questions that needs to be asked
- Each question always allows the user to provide their own custom answer, if they don't like suggested ones.
- If you haven't already explained the context and trade-offs of the options before invoking this tool, you MUST include that context in the question text itself so the user understands what they're choosing and why it matters. Keep option labels short, but make the question descriptive enough to stand on its own.
- If options are omitted, the question is treated as open-ended freeform input.
`;

export function registerDroidAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "AskUser",
    label: "Ask User",
    description: DROID_ASK_USER_DESCRIPTION,
    parameters: Type.Object({
      questions: Type.Array(RequestQuestionSchema, {
        description: "Questions to show the user. Ask one to four short questions.",
        minItems: 1,
        maxItems: 4,
      }),
      timeout_ms: Type.Optional(
        Type.Number({ description: "Optional timeout for select/input dialogs in milliseconds. Defaults to 60000." }),
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
