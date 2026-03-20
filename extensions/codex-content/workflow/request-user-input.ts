import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import { renderRequestUserInputResult } from "../renderers/request-user-input.ts";
import {
  CUSTOM_INPUT_OPTION,
  type RequestAnswer,
  type RequestOption,
  type RequestQuestion,
  RequestOptionSchema,
  RequestQuestionSchema,
  type RequestUserInputDetails,
} from "./types.ts";

type RequestOptionInput = string | { label: string; value?: string; description?: string };

type RequestQuestionInput = {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; value?: string; description?: string }>;
};

type QuestionBehavior = {
  allowTextInput: boolean;
  multiLine: boolean;
  useFreeformOnly: boolean;
};

type CollectedAnswer = {
  answer: RequestAnswer;
  interrupted: boolean;
};

type QuestionBuildResult = {
  questions: RequestQuestion[];
  legacyOptions: RequestOption[];
  usesLegacyQuestion: boolean;
};

function defaultLegacyOption(): RequestOption {
  return {
    label: "Answer",
    value: "Answer",
    description: "Provide a custom answer.",
  };
}

function legacyQuestionText(params: { question?: string; prompt?: string }): string {
  return (params.question ?? params.prompt ?? "").trim();
}

function legacyQuestionDefinition(question: string, options: RequestOption[]): RequestQuestion {
  return {
    id: "question_1",
    header: "Question",
    question,
    options: options.length > 0 ? options : [defaultLegacyOption()],
  };
}

export function normalizeRequestOptions(input: RequestOptionInput[]): RequestOption[] {
  const normalized: RequestOption[] = [];

  for (const option of input) {
    if (typeof option === "string") {
      normalized.push({ label: option, value: option });
      continue;
    }

    normalized.push({
      label: option.label,
      value: option.value ?? option.label,
      description: option.description,
    });
  }

  return normalized;
}

export function normalizeRequestQuestions(input: RequestQuestionInput[]): RequestQuestion[] {
  const questions: RequestQuestion[] = [];

  for (const question of input) {
    const normalizedQuestion = {
      id: question.id.trim(),
      header: question.header.trim(),
      question: question.question.trim(),
      options: normalizeRequestOptions(question.options),
    } satisfies RequestQuestion;

    if (!normalizedQuestion.id) continue;
    if (!normalizedQuestion.header) continue;
    if (!normalizedQuestion.question) continue;
    if (normalizedQuestion.options.length === 0) continue;

    questions.push(normalizedQuestion);
  }

  return questions;
}

function buildQuestionsFromParams(params: {
  questions?: RequestQuestionInput[];
  question?: string;
  prompt?: string;
  options?: RequestOptionInput[];
}): QuestionBuildResult {
  const legacyOptions = normalizeRequestOptions(params.options ?? []);
  if (params.questions?.length) {
    return {
      questions: normalizeRequestQuestions(params.questions),
      legacyOptions,
      usesLegacyQuestion: false,
    };
  }

  const question = legacyQuestionText(params);
  if (!question) {
    return {
      questions: [],
      legacyOptions,
      usesLegacyQuestion: false,
    };
  }

  return {
    questions: [legacyQuestionDefinition(question, legacyOptions)],
    legacyOptions,
    usesLegacyQuestion: true,
  };
}

function buildQuestionBehavior(
  params: {
    allow_text_input?: boolean;
    multi_line?: boolean;
  },
  legacyOptions: RequestOption[],
  usesLegacyQuestion: boolean,
  questionIndex: number,
): QuestionBehavior {
  const isLegacyQuestion = usesLegacyQuestion && questionIndex === 0;
  if (!isLegacyQuestion) {
    return {
      allowTextInput: true,
      multiLine: false,
      useFreeformOnly: false,
    };
  }

  return {
    allowTextInput: params.allow_text_input ?? legacyOptions.length === 0,
    multiLine: params.multi_line ?? false,
    useFreeformOnly: legacyOptions.length === 0,
  };
}

function validateQuestionRequest(
  questions: RequestQuestion[],
  behavior: QuestionBehavior,
  timeoutMs: number | undefined,
): void {
  if (questions.length === 0) {
    throw new Error("questions or question/prompt is required");
  }

  if (questions.length > 3) {
    throw new Error("request_user_input supports at most 3 questions");
  }

  if (behavior.multiLine && timeoutMs !== undefined) {
    throw new Error("timeout_ms is not supported when multi_line is true");
  }
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

function buildCancelledAnswer(wasCustom = false): RequestAnswer {
  return {
    answers: [],
    cancelled: true,
    wasCustom: wasCustom || undefined,
  };
}

function buildTypedAnswer(value: string): RequestAnswer {
  return {
    answers: [value, `user_note: ${value}`],
    label: value,
    wasCustom: true,
  };
}

function buildSelectedAnswer(label: string, value: string): RequestAnswer {
  return {
    answers: [value],
    label,
    wasCustom: false,
  };
}

async function collectTypedAnswer(
  ctx: ExtensionContext,
  question: RequestQuestion,
  params: {
    placeholder?: string;
    default_value?: string;
  },
  behavior: QuestionBehavior,
  timeoutMs: number | undefined,
): Promise<CollectedAnswer> {
  const typed = await collectFreeformInput(
    ctx,
    question.question,
    params.placeholder,
    behavior.multiLine,
    params.default_value,
    timeoutMs,
  );

  if (typed === undefined) {
    return {
      answer: buildCancelledAnswer(true),
      interrupted: true,
    };
  }

  return {
    answer: buildTypedAnswer(typed),
    interrupted: false,
  };
}

async function collectSelectedAnswer(
  ctx: ExtensionContext,
  question: RequestQuestion,
  params: {
    placeholder?: string;
    default_value?: string;
  },
  behavior: QuestionBehavior,
  timeoutMs: number | undefined,
): Promise<CollectedAnswer> {
  const labels = question.options.map((option) => option.label);
  if (behavior.allowTextInput) {
    labels.push(CUSTOM_INPUT_OPTION);
  }

  const selected = await ctx.ui.select(
    question.question,
    labels,
    timeoutMs ? { timeout: timeoutMs } : undefined,
  );
  if (selected === undefined) {
    return {
      answer: buildCancelledAnswer(),
      interrupted: true,
    };
  }

  if (behavior.allowTextInput && selected === CUSTOM_INPUT_OPTION) {
    return await collectTypedAnswer(ctx, question, params, behavior, timeoutMs);
  }

  const matched = question.options.find((option) => option.label === selected);
  return {
    answer: buildSelectedAnswer(selected, matched?.value ?? selected),
    interrupted: false,
  };
}

function answeredQuestionCount(answers: RequestUserInputDetails["answers"]): number {
  return Object.values(answers).filter((answer) => answer.answers.length > 0).length;
}

function resultSummaryText(
  answeredCount: number,
  questionCount: number,
  interrupted: boolean,
): string {
  if (interrupted) {
    return `User input interrupted after ${answeredCount}/${questionCount} answers`;
  }

  return `Collected user input for ${answeredCount} question${answeredCount === 1 ? "" : "s"}`;
}

function noUiResult(): {
  content: Array<{ type: "text"; text: string }>;
  details: RequestUserInputDetails;
  isError: true;
} {
  return {
    content: [{ type: "text", text: "Error: UI is not available for request_user_input" }],
    details: {
      questions: [],
      answers: {},
      interrupted: true,
    },
    isError: true,
  };
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
        return noUiResult();
      }

      const timeoutMs = params.timeout_ms;
      const { questions, legacyOptions, usesLegacyQuestion } = buildQuestionsFromParams(params);
      const firstQuestionBehavior = buildQuestionBehavior(
        params,
        legacyOptions,
        usesLegacyQuestion,
        0,
      );
      validateQuestionRequest(questions, firstQuestionBehavior, timeoutMs);

      const answers: RequestUserInputDetails["answers"] = {};
      let interrupted = false;

      for (const [index, question] of questions.entries()) {
        const behavior = buildQuestionBehavior(params, legacyOptions, usesLegacyQuestion, index);
        validateQuestionRequest(questions, behavior, timeoutMs);

        const collected = behavior.useFreeformOnly
          ? await collectTypedAnswer(ctx, question, params, behavior, timeoutMs)
          : await collectSelectedAnswer(ctx, question, params, behavior, timeoutMs);

        answers[question.id] = collected.answer;
        if (!collected.interrupted) {
          continue;
        }

        interrupted = true;
        break;
      }

      const answeredCount = answeredQuestionCount(answers);
      return {
        content: [
          { type: "text", text: resultSummaryText(answeredCount, questions.length, interrupted) },
        ],
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
