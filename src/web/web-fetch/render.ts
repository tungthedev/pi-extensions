import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";

import type { WebFetchProvider } from "./index.ts";

import { expandHintLine, renderEmptySlot, renderLines } from "../../shared/renderers/common.ts";
import { firstText, previewLines } from "../../shared/text.ts";

export type FetchUrlDetails = {
  provider?: WebFetchProvider;
  subject?: string;
  title?: string | null;
  statusCode?: number | null;
  render_markdown?: string;
  preview_text?: string;
};

const COLLAPSED_PREVIEW_LINE_COUNT = 4;

function bodyLine(theme: Theme, text: string): string {
  return theme.fg("muted", text);
}

function errorLine(theme: Theme, text: string): string {
  return theme.fg("error", text);
}

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

  if (options.isPartial) {
    return renderEmptySlot();
  }

  if (failed) {
    const messageLines = previewLines(firstText(result), options.expanded ? 6 : 3);
    return renderLines(messageLines.map((line) => errorLine(theme, line)));
  }

  if (!options.expanded) {
    const lines: string[] = [];
    const preview = previewLines(
      details.preview_text ?? firstText(result),
      COLLAPSED_PREVIEW_LINE_COUNT,
    );
    for (const line of preview) {
      lines.push(bodyLine(theme, line));
    }
    const total = previewLines(
      details.render_markdown ?? details.preview_text ?? "",
      Number.MAX_SAFE_INTEGER,
    ).length;
    const hiddenCount = Math.max(0, total - preview.length);
    if (hiddenCount > 0) lines.push(expandHintLine(theme, hiddenCount, "line"));
    return renderLines(lines);
  }

  const markdown = details.render_markdown?.trim();
  if (!markdown) {
    return renderLines([bodyLine(theme, firstText(result))]);
  }

  const container = new Container();
  container.addChild(new Markdown(markdown, 0, 0, getMarkdownTheme()));
  return container;
}
