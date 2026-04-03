import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  CUSTOM_INPUT_OPTION,
  type AskUserParams,
  type RequestAnswer,
  type RequestOption,
  type RequestOptionInput,
  type RequestQuestion,
  type RequestQuestionInput,
  type RequestUserInputDetails,
} from "./types.ts";

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

type AskUserExecutionResult = {
  content: Array<{ type: "text"; text: string }>;
  details: RequestUserInputDetails;
  isError?: true;
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

export function buildQuestionsFromParams(params: Pick<AskUserParams, "questions" | "question" | "prompt" | "options">): QuestionBuildResult {
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
  params: Pick<AskUserParams, "allow_text_input" | "multi_line">,
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
  params: Pick<AskUserParams, "placeholder" | "default_value">,
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
  params: Pick<AskUserParams, "placeholder" | "default_value">,
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

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function answerValue(answer: RequestAnswer): string {
  return answer.answers.find((value) => !value.startsWith("user_note:"))?.trim() ?? "";
}

function answerSummaryLine(question: RequestQuestion, answer: RequestAnswer | undefined): string | undefined {
  if (!answer) return undefined;

  const prompt = normalizeInlineText(question.question);
  if (answer.cancelled || answer.answers.length === 0) {
    return `- ${question.id} (${prompt}): cancelled`;
  }

  const label = answer.label?.trim() || answerValue(answer);
  const value = answerValue(answer);

  if (answer.wasCustom) {
    return `- ${question.id} (${prompt}): typed "${label}"`;
  }

  if (value && value !== label) {
    return `- ${question.id} (${prompt}): selected "${label}" (value: ${value})`;
  }

  return `- ${question.id} (${prompt}): selected "${label}"`;
}

function resultContentText(
  questions: RequestQuestion[],
  answers: RequestUserInputDetails["answers"],
  interrupted: boolean,
): string {
  const answeredCount = answeredQuestionCount(answers);
  const lines = [resultSummaryText(answeredCount, questions.length, interrupted)];

  for (const question of questions) {
    const line = answerSummaryLine(question, answers[question.id]);
    if (line) {
      lines.push(line);
    }
  }

  return lines.join("\n");
}

export function buildNoUiAskUserResult(
  message = "Error: UI is not available for request_user_input",
): AskUserExecutionResult {
  return {
    content: [{ type: "text", text: message }],
    details: {
      questions: [],
      answers: {},
      interrupted: true,
    },
    isError: true,
  };
}

export async function executeAskUserRequest(
  ctx: ExtensionContext,
  params: AskUserParams,
): Promise<AskUserExecutionResult> {
  if (!ctx.hasUI) {
    return buildNoUiAskUserResult();
  }

  const timeoutMs = params.timeout_ms;
  const { questions, legacyOptions, usesLegacyQuestion } = buildQuestionsFromParams(params);
  const firstQuestionBehavior = buildQuestionBehavior(params, legacyOptions, usesLegacyQuestion, 0);
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
  return {
    content: [{ type: "text", text: resultContentText(questions, answers, interrupted) }],
    details: {
      questions,
      answers,
      interrupted,
    },
  };
}
