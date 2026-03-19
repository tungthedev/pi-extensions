import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import { renderRequestUserInputResult } from "../renderers/request-user-input.ts";
import {
  CUSTOM_INPUT_OPTION,
  type RequestOption,
  type RequestQuestion,
  RequestOptionSchema,
  RequestQuestionSchema,
  type RequestUserInputDetails,
} from "./types.ts";

export function normalizeRequestOptions(
  input: Array<string | { label: string; value?: string; description?: string }>,
): RequestOption[] {
  return input.map((option) => {
    if (typeof option === "string") {
      return { label: option, value: option } as RequestOption;
    }

    return {
      label: option.label,
      value: option.value ?? option.label,
      description: option.description,
    } as RequestOption;
  });
}

export function normalizeRequestQuestions(
  input: Array<{
    id: string;
    header: string;
    question: string;
    options: Array<{ label: string; value?: string; description?: string }>;
  }>,
): RequestQuestion[] {
  return input
    .map((question) => ({
      id: question.id.trim(),
      header: question.header.trim(),
      question: question.question.trim(),
      options: normalizeRequestOptions(question.options),
    }))
    .filter(
      (question) =>
        question.id.length > 0 &&
        question.header.length > 0 &&
        question.question.length > 0 &&
        question.options.length > 0,
    );
}

export async function collectFreeformInput(
  ctx: ExtensionContext,
  question: string,
  placeholder: string | undefined,
  multiLine: boolean,
  defaultValue: string | undefined,
  timeoutMs: number | undefined,
): Promise<string | undefined> {
  const dialogOptions = timeoutMs ? { timeout: timeoutMs } : undefined;

  if (multiLine) {
    return await ctx.ui.editor(question, defaultValue ?? "");
  }

  return await ctx.ui.input(question, placeholder ?? defaultValue, dialogOptions);
}

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
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Error: UI is not available for request_user_input" }],
          details: {
            questions: [],
            answers: {},
            interrupted: true,
          } as RequestUserInputDetails,
          isError: true,
        };
      }

      const timeoutMs = params.timeout_ms;
      const legacyQuestion = (params.question ?? params.prompt ?? "").trim();
      const legacyOptions = normalizeRequestOptions(params.options ?? []);
      const questions = params.questions?.length
        ? normalizeRequestQuestions(params.questions)
        : legacyQuestion
          ? [
              {
                id: "question_1",
                header: "Question",
                question: legacyQuestion,
                options:
                  legacyOptions.length > 0
                    ? legacyOptions
                    : [
                        {
                          label: "Answer",
                          value: "Answer",
                          description: "Provide a custom answer.",
                        },
                      ],
              },
            ]
          : [];

      if (questions.length === 0) {
        throw new Error("questions or question/prompt is required");
      }

      if (questions.length > 3) {
        throw new Error("request_user_input supports at most 3 questions");
      }

      const answers: RequestUserInputDetails["answers"] = {};
      let interrupted = false;

      for (const [index, question] of questions.entries()) {
        const isLegacyQuestion = !params.questions?.length && index === 0;
        const allowTextInput = isLegacyQuestion
          ? (params.allow_text_input ?? legacyOptions.length === 0)
          : true;
        const multiLine = isLegacyQuestion ? (params.multi_line ?? false) : false;

        if (multiLine && timeoutMs !== undefined) {
          throw new Error("timeout_ms is not supported when multi_line is true");
        }

        if (isLegacyQuestion && legacyOptions.length === 0) {
          const typed = await collectFreeformInput(
            ctx,
            question.question,
            params.placeholder,
            multiLine,
            params.default_value,
            timeoutMs,
          );
          if (typed === undefined) {
            answers[question.id] = {
              answers: [],
              cancelled: true,
              wasCustom: true,
            };
            interrupted = true;
            break;
          }

          answers[question.id] = {
            answers: [typed, `user_note: ${typed}`],
            label: typed,
            wasCustom: true,
          };
          continue;
        }

        const labels = question.options.map((option) => option.label);
        if (allowTextInput) {
          labels.push(CUSTOM_INPUT_OPTION);
        }

        const selected = await ctx.ui.select(
          question.question,
          labels,
          timeoutMs ? { timeout: timeoutMs } : undefined,
        );
        if (selected === undefined) {
          answers[question.id] = {
            answers: [],
            cancelled: true,
          };
          interrupted = true;
          break;
        }

        if (allowTextInput && selected === CUSTOM_INPUT_OPTION) {
          const typed = await collectFreeformInput(
            ctx,
            question.question,
            params.placeholder,
            multiLine,
            params.default_value,
            timeoutMs,
          );
          if (typed === undefined) {
            answers[question.id] = {
              answers: [],
              cancelled: true,
              wasCustom: true,
            };
            interrupted = true;
            break;
          }

          answers[question.id] = {
            answers: [typed, `user_note: ${typed}`],
            label: typed,
            wasCustom: true,
          };
          continue;
        }

        const matched = question.options.find((option) => option.label === selected);
        answers[question.id] = {
          answers: [matched?.value ?? selected],
          label: selected,
          wasCustom: false,
        };
      }

      const answeredCount = Object.values(answers).filter(
        (answer) => answer.answers.length > 0,
      ).length;
      const contentText = interrupted
        ? `User input interrupted after ${answeredCount}/${questions.length} answers`
        : `Collected user input for ${answeredCount} question${answeredCount === 1 ? "" : "s"}`;

      return {
        content: [{ type: "text", text: contentText }],
        details: {
          questions,
          answers,
          interrupted,
        } as RequestUserInputDetails,
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return undefined;
      return renderRequestUserInputResult(theme, result, expanded);
    },
  });
}
