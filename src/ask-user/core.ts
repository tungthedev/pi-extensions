import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  CUSTOM_INPUT_OPTION,
  type AskUserParams,
  type NormalizedAskUserRequest,
  type NormalizedRequestQuestion,
  type RequestAnswer,
  type RequestQuestion,
  type RequestUserInputDetails,
} from "./types.ts";
import { normalizeAskUserRequest, normalizeRequestOptions, normalizeRequestQuestions } from "./normalize.ts";

export { normalizeRequestOptions, normalizeRequestQuestions } from "./normalize.ts";

type CollectedAnswer = {
  answer: RequestAnswer;
  interrupted: boolean;
};

type AskUserExecutionResult = {
  content: Array<{ type: "text"; text: string }>;
  details: RequestUserInputDetails;
  isError?: true;
};

function validateQuestionRequest(request: NormalizedAskUserRequest): void {
  const { questions } = request;
  if (questions.length === 0) {
    throw new Error("questions is required");
  }

  if (questions.length > 4) {
    throw new Error("request_user_input supports at most 4 questions");
  }
}

export async function collectFreeformInput(
  ctx: ExtensionContext,
  question: string,
  timeoutMs: number,
): Promise<string | undefined> {
  return await ctx.ui.input(question, undefined, { timeout: timeoutMs });
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
  question: NormalizedRequestQuestion,
  request: NormalizedAskUserRequest,
): Promise<CollectedAnswer> {
  const typed = await collectFreeformInput(ctx, question.question, request.timeoutMs);

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
  question: NormalizedRequestQuestion,
  request: NormalizedAskUserRequest,
): Promise<CollectedAnswer> {
  const labels = question.options.map((option) => option.label);
  labels.push(CUSTOM_INPUT_OPTION);

  const selected = await ctx.ui.select(question.question, labels, { timeout: request.timeoutMs });
  if (selected === undefined) {
    return {
      answer: buildCancelledAnswer(),
      interrupted: true,
    };
  }

  if (selected === CUSTOM_INPUT_OPTION) {
    return await collectTypedAnswer(ctx, question, request);
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

function resultSummaryText(answeredCount: number, questionCount: number, interrupted: boolean): string {
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
  message = "Error: UI is not available for user input",
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

  const request = normalizeAskUserRequest(params);
  validateQuestionRequest(request);
  const questions = request.questions;

  const answers: RequestUserInputDetails["answers"] = {};
  let interrupted = false;

  for (const question of questions) {
    const collected = question.behavior.useFreeformOnly
      ? await collectTypedAnswer(ctx, question, request)
      : await collectSelectedAnswer(ctx, question, request);

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
      questions: questions.map(({ behavior: _behavior, ...question }) => question),
      answers,
      interrupted,
    },
  };
}
