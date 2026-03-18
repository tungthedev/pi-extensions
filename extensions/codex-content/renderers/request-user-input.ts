import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import { firstLine, firstText } from "../shared/text.ts";
import type { RequestUserInputDetails } from "../workflow/types.ts";
import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

type RequestUserAnswer = RequestUserInputDetails["answers"][string];

function shortenInline(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function answerValue(answer: RequestUserAnswer | undefined): string {
  if (!answer) return "";

  return (
    answer.label?.trim() ||
    answer.answers.find((value) => !/^user_note:\s*/i.test(value))?.trim() ||
    ""
  );
}

export function summarizeRequestAnswer(answer: RequestUserAnswer | undefined, expanded: boolean): string {
  if (!answer) return "No response";
  if (answer.cancelled || answer.answers.length === 0) return "Cancelled";

  const label = answerValue(answer);
  const value = answer.answers.find((item) => !/^user_note:\s*/i.test(item))?.trim() || "";
  const summary = answer.wasCustom ? `Typed: ${label}` : label;
  const suffix = expanded && value && label && value !== label ? ` [${value}]` : "";
  return shortenInline(`${summary}${suffix}`.trim(), expanded ? 140 : 90);
}

export function buildRequestUserInputLines(
  theme: Theme,
  details: RequestUserInputDetails,
  expanded: boolean,
): string[] {
  const lines: string[] = [];
  const askedQuestions = details.questions.filter((question) => details.answers[question.id] !== undefined);

  for (const question of askedQuestions) {
    const answer = details.answers[question.id];
    lines.push(
      titleLine(
        theme,
        answer?.cancelled ? "error" : "text",
        "Asked",
        theme.fg("accent", shortenInline(question.question, expanded ? 120 : 90)),
      ),
    );

    const headerPrefix = question.header.trim() ? `${question.header.trim()}: ` : "";
    lines.push(detailLine(theme, `${headerPrefix}${summarizeRequestAnswer(answer, expanded)}`, true));
  }

  if (details.interrupted) {
    const answeredCount = Object.values(details.answers).filter((answer) => answer.answers.length > 0).length;
    lines.push(
      titleLine(theme, "error", "Interrupted", theme.fg("dim", `after ${answeredCount}/${details.questions.length} answers`)),
    );
  }

  return lines;
}

function hiddenRequestUserInputLineCount(theme: Theme, details: RequestUserInputDetails): number {
  const collapsedLines = buildRequestUserInputLines(theme, details, false);
  const expandedLines = buildRequestUserInputLines(theme, details, true);
  const maxLength = Math.max(collapsedLines.length, expandedLines.length);

  let hiddenCount = 0;
  for (let index = 0; index < maxLength; index += 1) {
    if (collapsedLines[index] !== expandedLines[index]) hiddenCount += 1;
  }

  return hiddenCount;
}

export function renderRequestUserInputResult(
  theme: Theme,
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const details = result.details as RequestUserInputDetails | undefined;
  if (details?.questions.length) {
    const lines = buildRequestUserInputLines(theme, details, expanded);
    if (!expanded) {
      const hiddenCount = hiddenRequestUserInputLineCount(theme, details);
      if (hiddenCount > 0) {
        lines.push(expandHintLine(theme, hiddenCount, "line"));
      }
    }
    return renderLines(lines);
  }

  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;
  const text = firstText(result);
  const lines = [
    titleLine(
      theme,
      failed ? "error" : "text",
      failed ? "Question failed" : "Asked",
      theme.fg("dim", shortenInline(firstLine(text) || "No user input collected", expanded ? 120 : 90)),
    ),
  ];
  if (!expanded && text.length > 90) {
    lines.push(expandHintLine(theme, 1, "line"));
  }
  return renderLines(lines);
}
