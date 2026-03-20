import type { AgentToolResult, EditToolDetails, Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import {
  countDiff,
  firstLine,
  firstText,
  isErrorText,
  previewLines,
  shortenPath,
} from "../shared/text.ts";
import { accentSuffix, detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

function diffStatsText(diff?: string): string | undefined {
  if (!diff) return undefined;
  const diffStats = countDiff(diff);
  return `(+${diffStats.added} -${diffStats.removed})`;
}

export function renderEditResult(
  theme: Theme,
  args: { path?: string; file_path?: string },
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const path = shortenPath(args.path ?? args.file_path);
  const text = firstText(result);
  const failed = isErrorText(text);
  const details = result.details as EditToolDetails | undefined;
  const diffPreview = details?.diff ? previewLines(details.diff, 10) : [];
  const suffix = accentSuffix(theme, path, diffStatsText(details?.diff));
  const title = failed ? "Edit failed" : "Edited";
  const lines = [titleLine(theme, failed ? "error" : "text", title, suffix)];

  if (failed && text) {
    lines.push(detailLine(theme, firstLine(text), true));
    return renderLines(lines);
  }

  if (!expanded) {
    if (diffPreview.length > 0) {
      lines.push(expandHintLine(theme, diffPreview.length, "line"));
    }
    return renderLines(lines);
  }

  for (const [index, line] of diffPreview.entries()) {
    lines.push(detailLine(theme, line, index === 0));
  }

  return renderLines(lines);
}
