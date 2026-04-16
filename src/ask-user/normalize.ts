import type {
  AskUserParams,
  NormalizedAskUserRequest,
  NormalizedRequestQuestion,
  RequestOption,
  RequestQuestion,
  RequestQuestionInput,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 60_000;

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(timeoutMs, DEFAULT_TIMEOUT_MS);
}

export function normalizeRequestOptions(input: string[] = []): RequestOption[] {
  return input
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => ({ label: option, value: option }));
}

export function normalizeRequestQuestions(input: RequestQuestionInput[]): RequestQuestion[] {
  const questions: RequestQuestion[] = [];

  for (const question of input) {
    const prompt = question.question.trim();
    if (!prompt) continue;

    questions.push({
      id: `question_${questions.length + 1}`,
      header: "",
      question: prompt,
      options: normalizeRequestOptions(question.options),
    });
  }

  return questions;
}

export function normalizeAskUserRequest(params: AskUserParams): NormalizedAskUserRequest {
  const rawQuestions = normalizeRequestQuestions(params.questions ?? []);
  const questions: NormalizedRequestQuestion[] = rawQuestions.map((question) => ({
    ...question,
    behavior: {
      useFreeformOnly: question.options.length === 0,
    },
  }));

  return {
    questions,
    timeoutMs: normalizeTimeoutMs(params.timeout_ms),
  };
}
