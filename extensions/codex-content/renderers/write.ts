import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import { firstLine, firstText, isErrorText, shortenPath } from "../shared/text.ts";
import { accentSuffix, detailLine, renderLines, titleLine } from "./common.ts";

function lineCountText(content: unknown): string | undefined {
  if (typeof content !== "string") return undefined;
  return `(${content.split("\n").length} lines)`;
}

export function renderWriteResult(
  theme: Theme,
  args: { path?: string; file_path?: string; content?: string },
  result: AgentToolResult<unknown>,
): Text {
  const path = shortenPath(args.path ?? args.file_path);
  const text = firstText(result);
  const failed = isErrorText(text);
  const suffix = accentSuffix(theme, path, lineCountText(args.content));
  const title = failed ? "Write failed" : "Wrote";
  const lines = [titleLine(theme, failed ? "error" : "text", title, suffix)];

  if (failed && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  }

  return renderLines(lines);
}
