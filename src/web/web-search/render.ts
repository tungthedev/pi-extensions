import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";

import type { WebToolRenderDetails } from "./core.ts";

import { expandHintLine, renderEmptySlot, renderLines } from "../../shared/renderers/common.ts";
import { firstText, previewLines } from "../../shared/text.ts";

const COLLAPSED_PREVIEW_LINE_COUNT = 4;

function bodyLine(theme: Theme, text: string): string {
  return theme.fg("muted", text);
}

function errorLine(theme: Theme, text: string): string {
  return theme.fg("error", text);
}

function previewDetailLines(details: WebToolRenderDetails): {
  visible: string[];
  hiddenCount: number;
} {
  const visible = previewLines(details.preview_text ?? "", COLLAPSED_PREVIEW_LINE_COUNT);
  const total = previewLines(details.render_markdown ?? "", Number.MAX_SAFE_INTEGER).length;
  return {
    visible,
    hiddenCount: Math.max(0, total - visible.length),
  };
}

export function renderWebResult(
  result: AgentToolResult<unknown>,
  theme: Theme,
  options: { expanded: boolean; isPartial?: boolean },
): Container | Text {
  const details = (result.details ?? {}) as WebToolRenderDetails;

  if (options.isPartial) {
    return renderEmptySlot();
  }

  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;

  if (failed) {
    const messageLines = previewLines(firstText(result), options.expanded ? 6 : 3);
    const lines = messageLines.map((line) => errorLine(theme, line));
    return renderLines(lines);
  }

  if (!options.expanded) {
    const preview = previewDetailLines(details);
    const lines: string[] = [];

    if (preview.visible.length > 0) {
      for (const line of preview.visible) {
        lines.push(bodyLine(theme, line));
      }
    } else if (details.citations?.length) {
      lines.push(
        bodyLine(
          theme,
          `${details.citations.length} cited source${details.citations.length === 1 ? "" : "s"}`,
        ),
      );
    }

    if (preview.hiddenCount > 0) {
      lines.push(expandHintLine(theme, preview.hiddenCount, "line"));
    }

    return renderLines(lines);
  }

  const container = new Container();

  const markdown = details.render_markdown?.trim();
  if (markdown) {
    container.addChild(new Markdown(markdown, 0, 0, getMarkdownTheme()));
    return container;
  }

  const text = firstText(result);
  if (text) {
    for (const line of previewLines(text, 6)) {
      container.addChild(new Text(bodyLine(theme, line), 0, 0));
    }
  }

  return container;
}
