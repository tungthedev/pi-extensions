import type { RequestQuestionInput } from "../../ask-user/types.ts";

type MutableQuestion = {
  index: number;
  question?: string;
  topic?: string;
  options: string[];
};

function normalizeHeader(topic: string | undefined): string {
  const trimmed = topic?.trim();
  if (!trimmed) return "Question";
  return trimmed.replace(/\s+/g, "-");
}

function pushQuestion(
  questions: RequestQuestionInput[],
  current: MutableQuestion | undefined,
): void {
  if (!current) return;
  if (!current.question?.trim()) {
    throw new Error(`Question ${current.index} is missing a [question] line`);
  }
  if (current.options.length < 2) {
    throw new Error(`Question ${current.index} must include at least 2 options`);
  }
  if (current.options.length > 4) {
    throw new Error(`Question ${current.index} cannot include more than 4 options`);
  }

  questions.push({
    id: `question_${questions.length + 1}`,
    header: normalizeHeader(current.topic),
    question: current.question.trim(),
    options: current.options.map((option) => ({ label: option, value: option })),
  });
}

export function buildDroidAskUserQuestions(questionnaire: string): RequestQuestionInput[] {
  const lines = questionnaire.replace(/\r/g, "").split("\n");
  const questions: RequestQuestionInput[] = [];
  let current: MutableQuestion | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const questionMatch = /^([0-9]+)\.\s*\[question\]\s*(.+)$/i.exec(line);
    if (questionMatch) {
      pushQuestion(questions, current);
      current = {
        index: Number.parseInt(questionMatch[1] ?? `${questions.length + 1}`, 10),
        question: questionMatch[2]?.trim(),
        options: [],
      };
      continue;
    }

    if (!current) {
      throw new Error("Questionnaire must start with a numbered [question] line");
    }

    const topicMatch = /^\[topic\]\s*(.+)$/i.exec(line);
    if (topicMatch) {
      current.topic = topicMatch[1]?.trim();
      continue;
    }

    const optionMatch = /^\[option\]\s*(.+)$/i.exec(line);
    if (optionMatch) {
      current.options.push(optionMatch[1]?.trim() ?? "");
      continue;
    }

    throw new Error(`Unrecognized questionnaire line: ${line}`);
  }

  pushQuestion(questions, current);

  if (questions.length === 0) {
    throw new Error("Questionnaire must include at least one question");
  }
  if (questions.length > 4) {
    throw new Error("Questionnaire cannot include more than 4 questions");
  }

  return questions;
}
