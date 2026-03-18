import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import { detailLine, renderLines, titleLine } from "./common.ts";
import { firstLine, firstText, isErrorText, shortenPath } from "../shared/text.ts";

export function renderWriteResult(
  theme: Theme,
  args: { path?: string; file_path?: string; content?: string },
  result: AgentToolResult<unknown>,
): Text {
  const path = shortenPath(args.path ?? args.file_path);
  const lineCount = typeof args.content === "string" ? args.content.split("\n").length : undefined;
  const text = firstText(result);
  const failed = isErrorText(text);
  const suffix = `${theme.fg("accent", path)}${
    lineCount ? theme.fg("dim", ` (${lineCount} lines)`) : ""
  }`;
  const lines = [
    titleLine(theme, failed ? "error" : "text", failed ? "Write failed" : "Wrote", suffix),
  ];

  if (failed && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  }

  return renderLines(lines);
}
