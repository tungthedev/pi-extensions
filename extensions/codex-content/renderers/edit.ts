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
import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

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
  const diffStats = countDiff(details?.diff);
  const diffPreview = details?.diff ? previewLines(details.diff, 10) : [];
  const diffSuffix = details?.diff
    ? theme.fg("dim", ` (+${diffStats.added} -${diffStats.removed})`)
    : "";
  const suffix = `${theme.fg("accent", path)}${diffSuffix}`;
  const lines = [
    titleLine(theme, failed ? "error" : "text", failed ? "Edit failed" : "Edited", suffix),
  ];

  if (failed && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  } else if (expanded && diffPreview.length > 0) {
    for (const [index, line] of diffPreview.entries()) {
      lines.push(detailLine(theme, line, index === 0));
    }
  } else if (diffPreview.length > 0) {
    lines.push(expandHintLine(theme, diffPreview.length, "line"));
  }

  return renderLines(lines);
}
