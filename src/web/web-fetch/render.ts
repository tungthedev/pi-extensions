import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";

import { detailLine, expandHintLine, renderLines, titleLine } from "../../shared/renderers/common.ts";
import { firstText, previewLines, shortenText } from "../../shared/text.ts";

import type { WebFetchProvider } from "./index.ts";

export type FetchUrlDetails = {
  provider?: WebFetchProvider;
  subject?: string;
  title?: string | null;
  statusCode?: number | null;
  render_markdown?: string;
  preview_text?: string;
};

const COLLAPSED_PREVIEW_LINE_COUNT = 4;

export function formatFetchUrlError(message: string, details: FetchUrlDetails = {}) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
    isError: true as const,
  };
}

export function renderFetchUrlResult(
  result: AgentToolResult<unknown>,
  theme: Theme,
  options: { expanded: boolean; isPartial?: boolean },
) {
  const details = (result.details ?? {}) as FetchUrlDetails;
  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;
  const subject = theme.fg("accent", shortenText(details.subject?.trim(), 96, "URL"));
  const meta: string[] = [];
  if (details.provider) meta.push(details.provider);
  if (details.statusCode) meta.push(String(details.statusCode));
  const suffix = `${subject}${meta.length ? theme.fg("dim", ` (${meta.join(" • ")})`) : ""}`;

  if (options.isPartial) {
    return new Text(titleLine(theme, "text", "Fetching", suffix), 0, 0);
  }

  const lines = [titleLine(theme, failed ? "error" : "text", failed ? "Fetch failed" : "Fetched", suffix)];

  if (!options.expanded) {
    const preview = previewLines(details.preview_text ?? firstText(result), COLLAPSED_PREVIEW_LINE_COUNT);
    for (const [index, line] of preview.entries()) {
      lines.push(detailLine(theme, line, index === 0));
    }
    const total = previewLines(details.render_markdown ?? details.preview_text ?? "", Number.MAX_SAFE_INTEGER).length;
    const hiddenCount = Math.max(0, total - preview.length);
    if (hiddenCount > 0) lines.push(expandHintLine(theme, hiddenCount, "line"));
    return renderLines(lines);
  }

  const markdown = details.render_markdown?.trim();
  if (!markdown) {
    return renderLines([...lines, detailLine(theme, firstText(result), true)]);
  }

  const container = new Container();
  container.addChild(new Text(lines[0], 0, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Markdown(markdown, 0, 0, getMarkdownTheme()));
  return container;
}
