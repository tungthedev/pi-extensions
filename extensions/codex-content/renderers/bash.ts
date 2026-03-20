import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import {
  firstLine,
  firstText,
  isErrorText,
  parseExitCode,
  previewLines,
  stripExitCodeLines,
  summarizeCommand,
} from "../shared/text.ts";
import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

const COLLAPSED_BODY_LINE_COUNT = 5;
const EXPANDED_BODY_LINE_COUNT = 12;

type BashCommandState = "ran" | "timed_out" | "aborted";

export function isFailedBashResult(result: AgentToolResult<unknown>): boolean {
  const text = firstText(result);
  const exitCode = parseExitCode(text);
  return isErrorText(text) || (exitCode !== undefined && exitCode !== 0);
}

function commandState(text: string): BashCommandState {
  if (/command timed out/i.test(text)) return "timed_out";
  if (/command aborted/i.test(text)) return "aborted";
  return "ran";
}

function commandTitle(state: BashCommandState): string {
  switch (state) {
    case "timed_out":
      return "Timed out";
    case "aborted":
      return "Aborted";
    default:
      return "Ran";
  }
}

function previewBodyLines(
  text: string,
  expanded: boolean,
): {
  visibleLines: string[];
  hiddenCount: number;
} {
  const allBodyLines = stripExitCodeLines(previewLines(text, Number.MAX_SAFE_INTEGER));
  const maxLines = expanded ? EXPANDED_BODY_LINE_COUNT : COLLAPSED_BODY_LINE_COUNT;
  const visibleLines = allBodyLines.slice(0, maxLines);
  const hiddenCount = Math.max(
    0,
    allBodyLines.slice(0, EXPANDED_BODY_LINE_COUNT).length - visibleLines.length,
  );

  return {
    visibleLines,
    hiddenCount,
  };
}

function resultSuffix(
  theme: Theme,
  command: string,
  exitCode: number | undefined,
  failed: boolean,
): string {
  const commandText = theme.fg(failed ? "error" : "accent", command);
  if (exitCode === undefined) return commandText;
  return `${commandText}${theme.fg("dim", ` (exit ${exitCode})`)}`;
}

export function renderBashResult(
  theme: Theme,
  args: { command?: string },
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const text = firstText(result);
  const exitCode = parseExitCode(text);
  const failed = isFailedBashResult(result);
  const state = commandState(text);
  const suffix = resultSuffix(theme, summarizeCommand(args.command), exitCode, failed);
  const lines = [titleLine(theme, failed ? "error" : "text", commandTitle(state), suffix)];
  const { visibleLines, hiddenCount } = previewBodyLines(text, expanded);

  for (const [index, line] of visibleLines.entries()) {
    lines.push(detailLine(theme, line, index === 0));
  }

  if (visibleLines.length === 0 && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  }

  if (!expanded && hiddenCount > 0) {
    lines.push(expandHintLine(theme, hiddenCount, "line"));
  }

  return renderLines(lines);
}
