import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import type { RequestAnswer, RequestUserInputDetails } from "../workflow/types.ts";

import { firstLine, firstText, shortenText } from "../shared/text.ts";
import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

const COLLAPSED_INLINE_TEXT_MAX = 90;
const EXPANDED_INLINE_TEXT_MAX = 140;
const COLLAPSED_QUESTION_TEXT_MAX = 90;
const EXPANDED_QUESTION_TEXT_MAX = 120;
const USER_NOTE_PREFIX = /^user_note:\s*/i;

function answerValues(answer: RequestAnswer | undefined): string[] {
  if (!answer) return [];
  return answer.answers.filter((value) => !USER_NOTE_PREFIX.test(value));
}

function answerLabel(answer: RequestAnswer | undefined): string {
  if (!answer) return "";
  if (answer.label?.trim()) return answer.label.trim();
  return answerValues(answer)[0]?.trim() ?? "";
}

export function summarizeRequestAnswer(
  answer: RequestAnswer | undefined,
  expanded: boolean,
): string {
  if (!answer) return "No response";
  if (answer.cancelled || answer.answers.length === 0) return "Cancelled";

  const label = answerLabel(answer);
  const value = answerValues(answer)[0]?.trim() ?? "";
  const summary = answer.wasCustom ? `Typed: ${label}` : label;
  const suffix = expanded && value && value !== label ? ` [${value}]` : "";
  const maxLength = expanded ? EXPANDED_INLINE_TEXT_MAX : COLLAPSED_INLINE_TEXT_MAX;

  return shortenText(`${summary}${suffix}`.trim(), maxLength);
}

function askedQuestions(details: RequestUserInputDetails): RequestUserInputDetails["questions"] {
  return details.questions.filter((question) => details.answers[question.id] !== undefined);
}

function answeredCount(details: RequestUserInputDetails): number {
  return Object.values(details.answers).filter((answer) => answer.answers.length > 0).length;
}

function hiddenRequestUserInputLineCount(details: RequestUserInputDetails): number {
  let hiddenCount = 0;

  for (const question of askedQuestions(details)) {
    const answer = details.answers[question.id];
    const collapsedQuestion = shortenText(question.question, COLLAPSED_QUESTION_TEXT_MAX);
    const expandedQuestion = shortenText(question.question, EXPANDED_QUESTION_TEXT_MAX);
    if (collapsedQuestion !== expandedQuestion) {
      hiddenCount += 1;
    }

    if (summarizeRequestAnswer(answer, false) !== summarizeRequestAnswer(answer, true)) {
      hiddenCount += 1;
    }
  }

  return hiddenCount;
}

export function buildRequestUserInputLines(
  theme: Theme,
  details: RequestUserInputDetails,
  expanded: boolean,
): string[] {
  const lines: string[] = [];
  const questionMaxLength = expanded ? EXPANDED_QUESTION_TEXT_MAX : COLLAPSED_QUESTION_TEXT_MAX;

  for (const question of askedQuestions(details)) {
    const answer = details.answers[question.id];
    const questionText = shortenText(question.question, questionMaxLength);
    const headerPrefix = question.header.trim() ? `${question.header.trim()}: ` : "";

    lines.push(
      titleLine(
        theme,
        answer?.cancelled ? "error" : "text",
        "Asked",
        theme.fg("accent", questionText),
      ),
    );
    lines.push(
      detailLine(theme, `${headerPrefix}${summarizeRequestAnswer(answer, expanded)}`, true),
    );
  }

  if (details.interrupted) {
    lines.push(
      titleLine(
        theme,
        "error",
        "Interrupted",
        theme.fg("dim", `after ${answeredCount(details)}/${details.questions.length} answers`),
      ),
    );
  }

  return lines;
}

function renderFallbackRequestUserInputResult(
  theme: Theme,
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;
  const text = firstText(result);
  const maxLength = expanded ? EXPANDED_QUESTION_TEXT_MAX : COLLAPSED_QUESTION_TEXT_MAX;
  const summary = shortenText(firstLine(text) || "No user input collected", maxLength);
  const lines = [
    titleLine(
      theme,
      failed ? "error" : "text",
      failed ? "Question failed" : "Asked",
      theme.fg("dim", summary),
    ),
  ];

  if (
    !expanded &&
    shortenText(summary, COLLAPSED_QUESTION_TEXT_MAX) !==
      shortenText(summary, EXPANDED_QUESTION_TEXT_MAX)
  ) {
    lines.push(expandHintLine(theme, 1, "line"));
  }

  return renderLines(lines);
}

export function renderRequestUserInputResult(
  theme: Theme,
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const details = result.details as RequestUserInputDetails | undefined;
  if (!details?.questions.length) {
    return renderFallbackRequestUserInputResult(theme, result, expanded);
  }

  const lines = buildRequestUserInputLines(theme, details, expanded);
  if (!expanded) {
    const hiddenCount = hiddenRequestUserInputLineCount(details);
    if (hiddenCount > 0) {
      lines.push(expandHintLine(theme, hiddenCount, "line"));
    }
  }

  return renderLines(lines);
}
