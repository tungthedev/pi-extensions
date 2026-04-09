import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import { executeAskUserRequest } from "../../ask-user/index.ts";
import { renderFallbackResult, renderToolCall } from "../../codex-content/renderers/common.ts";
import { shortenText } from "../../codex-content/shared/text.ts";
import { renderRequestUserInputResult } from "../../codex-content/renderers/request-user-input.ts";
import { buildDroidAskUserQuestions } from "./ask-user-parser.ts";

const DROID_ASK_USER_DESCRIPTION = `Use this tool when you need to ask the user 1–4 quick multiple-choice questions at once during execution to clarify requirements or decisions.

Important:
- Keep the questionnaire short and focused.
- The tool can be used more than once if there are important questions that needs to be asked
- User has an option to provide own custom answers, if they don't like suggested ones.
- If you haven't already explained the context and trade-offs of the options before invoking this tool, you MUST include that context in the [question] text itself so the user understands what they're choosing and why it matters. Keep option labels short, but make the question descriptive enough to stand on its own.
`;

function summarizeQuestionnaire(questionnaire: string | undefined): string {
  if (!questionnaire?.trim()) return "question";

  try {
    const questions = buildDroidAskUserQuestions(questionnaire);
    const firstQuestion = shortenText(questions[0]?.question, 72, "question");
    if (questions.length === 1) {
      return firstQuestion;
    }

    return `${firstQuestion} (+${questions.length - 1} more)`;
  } catch {
    const firstLine = questionnaire
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    return shortenText(firstLine, 72, "question");
  }
}

export function registerDroidAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "AskUser",
    label: "Ask User",
    description: DROID_ASK_USER_DESCRIPTION,
    parameters: Type.Object({
      questionnaire: Type.String({
        description: `A plain-text questionnaire to ask the user. Use this format (no headers or code fences):

1. [question] Which features do you want to enable?
[topic] Features
[option] Auth handling
[option] Login Page

2. [question] Which library should we use for date formatting?
[topic] Library
[option] Library ABC
[option] Library BlaBla

Notes:
- 1–4 questions
- 2–4 options per question
- [topic] is a short label for the UI navigation bar; multi-word topics will be normalized (e.g., "My Topic" → "My-Topic")
- Do NOT include an 'Own answer' option; the UI provides it automatically
- Keep option labels short and mutually exclusive`,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const questions = buildDroidAskUserQuestions(params.questionnaire);
      return await executeAskUserRequest(ctx, { questions });
    },
    renderCall(args, theme) {
      return renderToolCall(
        theme,
        "Ask user",
        theme.fg("accent", summarizeQuestionnaire(args.questionnaire)),
      );
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return renderFallbackResult(result);
      return renderRequestUserInputResult(theme, result, expanded);
    },
  });
}
