import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

type FollowupDetails = {
  question: string;
  answer?: string;
  interrupted?: boolean;
};

function collectOptions(params: {
  option1?: string;
  option2?: string;
  option3?: string;
  option4?: string;
  option5?: string;
}): string[] {
  return [params.option1, params.option2, params.option3, params.option4, params.option5].filter(
    (value): value is string => Boolean(value?.trim()),
  );
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

      const options = collectOptions(params);
      let answer: string | undefined;
      let interrupted = false;

      if (options.length > 0 && !params.multiple) {
        answer = await ctx.ui.select("Follow-up", options);
        interrupted = answer === undefined;
      } else if (options.length > 0 && params.multiple) {
        const prompt = `${params.question}\nOptions: ${options.map((value, index) => `${index + 1}. ${value}`).join("  ")}`;
        answer = await ctx.ui.input("Follow-up", prompt);
        interrupted = answer === undefined;
      } else {
        answer = await ctx.ui.input("Follow-up", params.question);
        interrupted = answer === undefined;
      }

      return {
        content: [
          { type: "text", text: interrupted ? "Follow-up cancelled" : `Follow-up answer: ${answer}` },
        ],
        details: {
          question: params.question,
          answer,
          interrupted,
        } satisfies FollowupDetails,
        isError: interrupted,
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
