import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";
import {
  firstLine,
  firstText,
  isErrorText,
  parseExitCode,
  previewLines,
  stripExitCodeLines,
  summarizeCommand,
} from "../shared/text.ts";

export function renderBashResult(
  theme: Theme,
  args: { command?: string },
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const text = firstText(result);
  const exitCode = parseExitCode(text);
  const failed = isErrorText(text) || (exitCode !== undefined && exitCode !== 0);
  const command = summarizeCommand(args.command);
  const suffix = `${theme.fg("accent", command)}${
    exitCode !== undefined ? theme.fg("dim", ` (exit ${exitCode})`) : ""
  }`;

  const lines = [titleLine(theme, failed ? "error" : "text", "Ran", suffix)];
  const allBodyLines = stripExitCodeLines(previewLines(text, Number.MAX_SAFE_INTEGER));
  const visibleBodyLines = allBodyLines.slice(0, expanded ? 12 : 5);
  for (const [index, line] of visibleBodyLines.entries()) {
    lines.push(detailLine(theme, line, index === 0));
  }

  if (!visibleBodyLines.length && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  }

  if (!expanded) {
    const expandedBodyLines = allBodyLines.slice(0, 12);
    const hiddenCount = Math.max(0, expandedBodyLines.length - visibleBodyLines.length);
    if (hiddenCount > 0) {
      lines.push(expandHintLine(theme, hiddenCount, "line"));
    }
  }

  return renderLines(lines);
}
