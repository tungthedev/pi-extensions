import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
  Theme,
} from "@mariozechner/pi-coding-agent";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  detailLine,
  expandHintLine,
  renderLines,
  titleLine,
} from "../codex-content/renderers/common.ts";
import { firstText, previewLines, shortenText } from "../codex-content/shared/text.ts";
import {
  type Citation,
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_MAX_RESULTS,
  clampMaxResults,
  formatSources,
  resolveGeminiApiKey,
  runGeminiFetch,
  runGeminiSearch,
  trimToMaxChars,
  wrapUntrustedWebContent,
} from "./gemini.ts";

type SearchParams = {
  objective: string;
  search_queries?: string[];
  max_results?: number;
  model?: string;
};

type FetchParams = {
  url: string;
  objective?: string;
  prompt?: string;
  max_chars?: number;
  model?: string;
};

const WEB_SEARCH_TOOL_NAME = "web_search";
const WEB_EXTRACT_TOOL_NAME = "web_extract";

type WebToolKind = "search" | "extract";

type WebToolRenderDetails = {
  provider?: string;
  model?: string;
  citations?: Citation[];
  kind?: WebToolKind;
  subject?: string;
  context?: string;
  render_markdown?: string;
  preview_text?: string;
};

const COLLAPSED_PREVIEW_LINE_COUNT = 4;

function formatToolError(
  message: string,
  details: WebToolRenderDetails = {},
): {
  content: Array<{ type: "text"; text: string }>;
  details: WebToolRenderDetails;
  isError: true;
} {
  return {
    content: [{ type: "text", text: message }],
    details,
    isError: true,
  };
}

function formatSourcesMarkdown(citations: Citation[]): string {
  if (citations.length === 0) return "";

  const lines = citations.map((citation, index) => {
    const title = (citation.title?.trim() || citation.url).replace(/[[\]]/g, "\\$&");
    return `${index + 1}. [${title}](${citation.url})`;
  });

  return ["## Sources", "", ...lines].join("\n");
}

function buildRenderableMarkdown(body: string, citations: Citation[]): string {
  return [body.trim(), formatSourcesMarkdown(citations)].filter(Boolean).join("\n\n").trim();
}

function summaryTitle(kind: WebToolKind, failed: boolean): string {
  if (failed) return kind === "search" ? "Search failed" : "Extract failed";
  return kind === "search" ? "Searched" : "Extracted";
}

function inProgressTitle(kind: WebToolKind): string {
  return kind === "search" ? "Searching" : "Extracting";
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
  if (details.kind !== "extract") return undefined;

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

function renderWebResult(
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

export function createWebSearchTool(): ToolDefinition {
  return {
    name: WEB_SEARCH_TOOL_NAME,
    label: "Web Search",
    description:
      "Search the web for information relevant to a research objective using Gemini Google Search grounding.\n\n" +
      "Use when you need up-to-date or precise documentation. " +
      "Use `web_extract` to read a specific URL in more detail.\n\n" +
      "# Examples\n\n" +
      "Get API documentation for a specific provider\n" +
      '```json\n{"objective":"I want to know the request fields for the Stripe billing create customer API. Prefer Stripe docs.","search_queries":["stripe","create customer","billing api"]}\n```\n\n' +
      "See usage documentation for newly released library features\n" +
      '```json\n{"objective":"I want to know how to use SvelteKit remote functions, which is a new feature shipped recently.","search_queries":["sveltekit","remote functions"],"max_results":5}\n```',
    parameters: Type.Object({
      objective: Type.String({
        description:
          "A natural-language description of the broader task or research goal, including source or freshness guidance.",
      }),
      search_queries: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional keyword queries to ensure matches for specific terms are prioritized (recommended for best results).",
        }),
      ),
      max_results: Type.Optional(
        Type.Number({
          description: `The maximum number of sources to surface in the response (default: ${DEFAULT_MAX_RESULTS}).`,
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Optional Gemini model override. Defaults to GEMINI_WEB_MODEL or gemini-2.5-flash.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal, _onUpdate, _ctx) {
      const params = rawParams as unknown as SearchParams;
      const objective = params.objective.trim();

      try {
        const result = await runGeminiSearch({
          objective,
          searchQueries: params.search_queries,
          maxResults: params.max_results,
          model: params.model,
          signal,
        });

        const citations = result.citations.slice(0, clampMaxResults(params.max_results));
        const sources = formatSources(citations);
        const renderMarkdown = buildRenderableMarkdown(result.text, citations);
        const output = [
          wrapUntrustedWebContent(result.text, "web_search"),
          sources ? `Sources:\n${sources}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            provider: "gemini",
            model: result.model,
            citations,
            kind: "search" as const,
            subject: objective,
            render_markdown: renderMarkdown,
            preview_text: result.text,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolError(message, {
          kind: "search",
          subject: objective,
        });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as SearchParams;
      const objective = args.objective?.trim();
      const queryCount = args.search_queries?.length ?? 0;
      const suffix = `${theme.fg("accent", summarizeSubject("search", objective))}${queryCount > 0 ? theme.fg("dim", ` (${queryCount} query${queryCount === 1 ? "" : "ies"})`) : ""}`;
      return new Text(titleLine(theme, "text", "Searching", suffix), 0, 0);
    },
    renderResult(result, options, theme) {
      return renderWebResult(result, theme, options);
    },
  };
}

export function createWebExtractTool(): ToolDefinition {
  return {
    name: WEB_EXTRACT_TOOL_NAME,
    label: "Web Extract",
    description:
      "Extract relevant content from a specific URL using Gemini URL Context.\n\n" +
      "Use when you already know the page you want and need a grounded summary or answer from that URL. " +
      "Prefer `web_search` when you are still discovering sources.\n\n" +
      "# Examples\n\n" +
      "Extract the relevant section from a docs page\n" +
      '```json\n{"url":"https://docs.stripe.com/api/customers/create","objective":"Find the required and optional request fields for creating a customer."}\n```\n\n' +
      "Ask a specific question about a page\n" +
      '```json\n{"url":"https://kit.svelte.dev/docs","prompt":"What does the docs page say about remote functions?","max_chars":6000}\n```',
    parameters: Type.Object({
      url: Type.String({
        description: "The URL of the web page to fetch. Must start with http:// or https://.",
      }),
      objective: Type.Optional(
        Type.String({
          description:
            "A natural-language description of the research goal. If set, the returned extract focuses on information relevant to that goal.",
        }),
      ),
      prompt: Type.Optional(
        Type.String({
          description:
            "A specific question to answer from the page content. If set, it takes precedence over objective.",
        }),
      ),
      max_chars: Type.Optional(
        Type.Number({
          description: `Maximum characters to return after extraction (default: ${DEFAULT_FETCH_MAX_CHARS}).`,
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Optional Gemini model override. Defaults to GEMINI_WEB_MODEL or gemini-2.5-flash.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal, _onUpdate, _ctx) {
      const params = rawParams as unknown as FetchParams;
      const url = params.url.trim();
      const context = params.prompt?.trim() || params.objective?.trim();

      try {
        const result = await runGeminiFetch({
          url,
          objective: params.objective,
          prompt: params.prompt,
          maxChars: params.max_chars,
          model: params.model,
          signal,
        });

        const sources = formatSources(result.citations);
        const renderMarkdown = buildRenderableMarkdown(result.text, result.citations);
        const body = trimToMaxChars(
          wrapUntrustedWebContent(result.text, "web_extract"),
          params.max_chars ?? DEFAULT_FETCH_MAX_CHARS,
        );
        const output = [body, sources ? `Sources:\n${sources}` : ""].filter(Boolean).join("\n\n");

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            provider: "gemini",
            model: result.model,
            citations: result.citations,
            kind: "extract" as const,
            subject: url,
            context,
            render_markdown: renderMarkdown,
            preview_text: result.text,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolError(message, {
          kind: "extract",
          subject: url,
          context,
        });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as FetchParams;
      const suffix = theme.fg("accent", summarizeSubject("extract", args.url));
      const context = shortenText((args.prompt || args.objective)?.trim(), 72);
      const title = new Text(titleLine(theme, "text", "Extracting", suffix), 0, 0);

      if (!context) {
        return title;
      }

      const container = new Container();
      container.addChild(title);
      container.addChild(new Text(detailLine(theme, context, true), 0, 0));
      return container;
    },
    renderResult(result, options, theme) {
      return renderWebResult(result, theme, options);
    },
  };
}

export default function webSearchPack(pi: ExtensionAPI) {
  const hasGeminiConfig = (): boolean => Boolean(resolveGeminiApiKey());

  if (!hasGeminiConfig()) {
    return;
  }

  pi.registerTool(createWebSearchTool());
  pi.registerTool(createWebExtractTool());
}
