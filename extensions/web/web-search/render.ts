import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";

import { detailLine, expandHintLine, renderLines, titleLine } from "../../shared/renderers/common.ts";
import { firstText, previewLines, shortenText } from "../../shared/text.ts";

import type { WebToolKind, WebToolRenderDetails } from "./core.ts";

const COLLAPSED_PREVIEW_LINE_COUNT = 4;

function summaryTitle(kind: WebToolKind, failed: boolean): string {
  if (failed) return kind === "search" ? "Search failed" : "Summary failed";
  return kind === "search" ? "Searched" : "Summarized";
}

function inProgressTitle(kind: WebToolKind): string {
  return kind === "search" ? "Searching" : "Summarizing";
}

function summarizeSubject(kind: WebToolKind, subject?: string): string {
  const fallback = kind === "search" ? "objective" : "URL";
  return shortenText(subject?.trim(), kind === "search" ? 84 : 96, fallback);
}

function metadataSuffix(theme: Theme, details: WebToolRenderDetails, failed: boolean): string {
  const subject = theme.fg(
    failed ? "error" : "accent",
    summarizeSubject(details.kind ?? "search", details.subject),
  );
  const meta: string[] = [];

  if (!failed && details.citations?.length) {
    meta.push(`${details.citations.length} source${details.citations.length === 1 ? "" : "s"}`);
  }
  if (details.model) {
    meta.push(details.model);
  }

  if (meta.length === 0) return subject;
  return `${subject}${theme.fg("dim", ` (${meta.join(" • ")})`)}`;
}

function summarizeExtractContext(details: WebToolRenderDetails): string | undefined {
  if (details.kind !== "summary") return undefined;

  return shortenText(details.context?.trim(), 90);
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
  const kind = details.kind ?? "search";

  if (options.isPartial) {
    return new Text(
      titleLine(theme, "text", inProgressTitle(kind), metadataSuffix(theme, details, false)),
      0,
      0,
    );
  }

  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;
  const lines: string[] = [
    titleLine(
      theme,
      failed ? "error" : "text",
      summaryTitle(kind, failed),
      metadataSuffix(theme, details, failed),
    ),
  ];

  if (failed) {
    const messageLines = previewLines(firstText(result), options.expanded ? 6 : 3);
    for (const [index, line] of messageLines.entries()) {
      lines.push(detailLine(theme, line, index === 0));
    }
    return renderLines(lines);
  }

  if (!options.expanded) {
    const preview = previewDetailLines(details);
    const extractContext = summarizeExtractContext(details);
    if (extractContext) {
      lines.push(detailLine(theme, extractContext, true));
    }

    if (preview.visible.length > 0) {
      for (const [index, line] of preview.visible.entries()) {
        lines.push(detailLine(theme, line, index === 0 && !extractContext));
      }
    } else if (details.citations?.length) {
      lines.push(
        detailLine(
          theme,
          `${details.citations.length} cited source${details.citations.length === 1 ? "" : "s"}`,
          !extractContext,
        ),
      );
    }

    if (preview.hiddenCount > 0) {
      lines.push(expandHintLine(theme, preview.hiddenCount, "line"));
    }

    return renderLines(lines);
  }

  const container = new Container();
  container.addChild(new Text(lines[0], 0, 0));

  const markdown = details.render_markdown?.trim();
  if (markdown) {
    container.addChild(new Spacer(1));
    container.addChild(new Markdown(markdown, 0, 0, getMarkdownTheme()));
    return container;
  }

  const text = firstText(result);
  if (text) {
    for (const [index, line] of previewLines(text, 6).entries()) {
      container.addChild(new Text(detailLine(theme, line, index === 0), 0, 0));
    }
  }

  return container;
}
