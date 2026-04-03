import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import type { AskUserParams, RequestUserInputDetails } from "../../ask-user/index.ts";
import { executeAskUserRequest } from "../../ask-user/index.ts";

type FollowupParams = {
  question: string;
  multiple?: boolean;
  option1?: string;
  option2?: string;
  option3?: string;
  option4?: string;
  option5?: string;
};

type FollowupDetails = {
  question: string;
  answer?: string;
  interrupted?: boolean;
};

function collectOptions(params: FollowupParams): string[] {
  return [params.option1, params.option2, params.option3, params.option4, params.option5].filter(
    (value): value is string => Boolean(value?.trim()),
  );
}

export function buildAskUserParamsFromFollowup(params: FollowupParams): AskUserParams {
  const options = collectOptions(params);
  if (options.length === 0) {
    return { question: params.question };
  }

  if (params.multiple) {
    return {
      question: `${params.question}\nOptions: ${options.map((value, index) => `${index + 1}. ${value}`).join("  ")}`,
    };
  }

  return {
    question: params.question,
    options,
    allow_text_input: false,
  };
}

export function buildFollowupDetails(
  question: string,
  details: RequestUserInputDetails,
): FollowupDetails {
  const firstAnswer = Object.values(details.answers)[0];
  const answer = firstAnswer?.label?.trim() || firstAnswer?.answers[0]?.trim();

  return {
    question,
    answer: answer || undefined,
    interrupted: details.interrupted,
  };
}

export function registerForgeFollowupTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "followup",
    label: "followup",
    description:
      "Ask the user a focused follow-up question when a decision or clarification is required before continuing.",
    promptSnippet: "Ask the user a focused follow-up question",
    promptGuidelines: ["Use followup when you need clarification or the user must choose between concrete options."],
    parameters: Type.Object({
      question: Type.String({ description: "Question to ask the user." }),
      multiple: Type.Optional(Type.Boolean({ description: "Whether multiple answers may be selected." })),
      option1: Type.Optional(Type.String()),
      option2: Type.Optional(Type.String()),
      option3: Type.Optional(Type.String()),
      option4: Type.Optional(Type.String()),
      option5: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Follow-up is unavailable without an interactive UI." }],
          details: { question: params.question, interrupted: true } satisfies FollowupDetails,
          isError: true,
        };
      }

      const askUserResult = await executeAskUserRequest(ctx, buildAskUserParamsFromFollowup(params));
      const details = buildFollowupDetails(params.question, askUserResult.details);

      return {
        content: [
          {
            type: "text",
            text: details.interrupted ? "Follow-up cancelled" : `Follow-up answer: ${details.answer}`,
          },
        ],
        details,
        isError: details.interrupted,
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("followup "))}${theme.fg("accent", args.question)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as FollowupDetails | undefined;
      if (!details) {
        return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
      }
      const color = details.interrupted ? "warning" : "success";
      const text = details.interrupted ? "follow-up cancelled" : `answer: ${details.answer}`;
      return new Text(theme.fg(color, text), 0, 0);
    },
  });
}
