import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";

import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { detailLine, titleLine } from "../../shared/renderers/common.ts";
import { shortenText } from "../../shared/text.ts";
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
import {
  buildRenderableMarkdown,
  formatWebToolError,
  type DroidSearchParams,
  type FetchParams,
  type SearchParams,
  type WebSearchProvider,
} from "./core.ts";
import { runGeminiDroidSearch } from "./providers/gemini-adapter.ts";
import { resolveExaApiKey, runExaSearch } from "./providers/exa.ts";
import { renderWebResult } from "./render.ts";

const WEB_SEARCH_TOOL_NAME = "WebSearch";
const WEB_SUMMARY_TOOL_NAME = "WebSummary";

export { resolveGeminiApiKey } from "./gemini.ts";

export function resolveWebSearchProvider(): WebSearchProvider {
  if (resolveExaApiKey()) return "exa";
  if (resolveGeminiApiKey()) return "gemini";
  return "unavailable";
}

function summarizeSubject(kind: "search" | "summary", subject?: string): string {
  const fallback = kind === "search" ? "objective" : "URL";
  return shortenText(subject?.trim(), kind === "search" ? 84 : 96, fallback);
}

function buildSearchOutput(text: string, citations: Citation[]): string {
  const sources = formatSources(citations);
  return [wrapUntrustedWebContent(text, "web_search"), sources ? `Sources:\n${sources}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function buildSummaryOutput(text: string, citations: Citation[], maxChars: number): string {
  const sources = formatSources(citations);
  const body = trimToMaxChars(wrapUntrustedWebContent(text, "web_summary"), maxChars);
  return [body, sources ? `Sources:\n${sources}` : ""].filter(Boolean).join("\n\n");
}

function buildSearchSuccessResult(options: {
  provider: string;
  subject?: string;
  text: string;
  citations: Citation[];
  model?: string;
}) {
  return {
    content: [{ type: "text" as const, text: buildSearchOutput(options.text, options.citations) }],
    details: {
      provider: options.provider,
      model: options.model,
      citations: options.citations,
      kind: "search" as const,
      subject: options.subject,
      render_markdown: buildRenderableMarkdown(options.text, options.citations),
      preview_text: options.text,
    },
  };
}

function buildSummarySuccessResult(options: {
  url: string;
  text: string;
  citations: Citation[];
  model: string;
  context?: string;
  maxChars: number;
}) {
  return {
    content: [
      {
        type: "text" as const,
        text: buildSummaryOutput(options.text, options.citations, options.maxChars),
      },
    ],
    details: {
      provider: "gemini",
      model: options.model,
      citations: options.citations,
      kind: "summary" as const,
      subject: options.url,
      context: options.context,
      render_markdown: buildRenderableMarkdown(options.text, options.citations),
      preview_text: options.text,
    },
  };
}

export function createWebSearchTool(): ToolDefinition {
  const provider = resolveWebSearchProvider();

  return {
    name: WEB_SEARCH_TOOL_NAME,
    label: "Web Search",
    description:
      "Search the web for information relevant to a research objective using the best available search provider.\n\n" +
      "Use when you need up-to-date or precise documentation. " +
      "For Droid-style searches, you can also use query/type/category/domain filters. " +
      "Use `WebSummary` to read a specific URL in more detail.\n\n" +
      "# Examples\n\n" +
      "Get API documentation for a specific provider\n" +
      '```json\n{"objective":"I want to know the request fields for the Stripe billing create customer API. Prefer Stripe docs.","search_queries":["stripe","create customer","billing api"]}\n```\n\n' +
      "See usage documentation for newly released library features\n" +
      '```json\n{"objective":"I want to know how to use SvelteKit remote functions, which is a new feature shipped recently.","search_queries":["sveltekit","remote functions"],"max_results":5}\n```',
    parameters: Type.Object({
      objective: Type.Optional(
        Type.String({
          description:
            "A natural-language description of the broader task or research goal, including source or freshness guidance.",
        }),
      ),
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
      query: Type.Optional(Type.String({ description: "Search query" })),
      type: Type.Optional(Type.String({ description: "Search type" })),
      category: Type.Optional(Type.String({ description: "Category filter" })),
      numResults: Type.Optional(Type.Number({ description: "Maximum number of results" })),
      includeDomains: Type.Optional(Type.Array(Type.String())),
      excludeDomains: Type.Optional(Type.Array(Type.String())),
      text: Type.Optional(Type.Boolean({ description: "Request fuller text when available" })),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as SearchParams;
      const objective = params.objective?.trim();
      const query = params.query?.trim();

      if (!objective && !query) {
        return formatWebToolError("Search requests require an objective or query.", {
          kind: "search",
        });
      }

      try {
        if (provider === "exa") {
          if (query) {
            const result = await runExaSearch({
              query,
              type: params.type,
              category: params.category,
              numResults: params.numResults,
              includeDomains: params.includeDomains,
              excludeDomains: params.excludeDomains,
              text: params.text,
              signal,
            });
            const citations = result.citations.slice(0, clampMaxResults(params.numResults));
            return buildSearchSuccessResult({
              provider: result.provider,
              subject: query,
              text: result.text,
              citations,
            });
          }

          const exaObjective = [objective, ...(params.search_queries ?? [])]
            .filter(Boolean)
            .join(" ")
            .trim();
          const result = await runExaSearch({
            query: exaObjective,
            numResults: params.max_results,
            signal,
          });
          const citations = result.citations.slice(0, clampMaxResults(params.max_results));
          return buildSearchSuccessResult({
            provider: result.provider,
            subject: exaObjective,
            text: result.text,
            citations,
          });
        }

        if (provider === "gemini") {
          if (query) {
            const result = await runGeminiDroidSearch({
              query,
              type: params.type,
              category: params.category,
              numResults: params.numResults,
              includeDomains: params.includeDomains,
              excludeDomains: params.excludeDomains,
              text: params.text,
              signal,
            });
            const citations = result.citations.slice(0, clampMaxResults(params.numResults));
            return buildSearchSuccessResult({
              provider: result.provider,
              subject: query,
              text: result.text,
              citations,
              model: result.model,
            });
          }

          const result = await runGeminiSearch({
            objective: objective ?? "",
            searchQueries: params.search_queries,
            maxResults: params.max_results,
            model: params.model,
            signal,
          });
          const citations = result.citations.slice(0, clampMaxResults(params.max_results));
          return buildSearchSuccessResult({
            provider: "gemini",
            subject: objective,
            text: result.text,
            citations,
            model: result.model,
          });
        }

        return formatWebToolError(
          "No web search provider is configured. Set EXA_API_KEY or GEMINI_API_KEY.",
          {
            kind: "search",
            subject: objective ?? query,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatWebToolError(message, {
          kind: "search",
          subject: objective ?? query,
        });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as SearchParams;
      const subject = args.query?.trim() || args.objective?.trim();
      const queryCount = args.search_queries?.length ?? 0;
      const suffix = `${theme.fg("accent", summarizeSubject("search", subject))}${queryCount > 0 ? theme.fg("dim", ` (${queryCount} query${queryCount === 1 ? "" : "ies"})`) : ""}`;
      return new Text(titleLine(theme, "text", "Searching", suffix), 0, 0);
    },
    renderResult(result, options, theme) {
      return renderWebResult(result, theme, options);
    },
  };
}

export function createUnavailableWebSearchTool(
  name = WEB_SEARCH_TOOL_NAME,
  label = "Web Search",
): ToolDefinition {
  return {
    name,
    label,
    description:
      "Search the web. This tool is registered even when no provider is configured and will return a runtime error when invoked.",
    parameters: Type.Object({
      objective: Type.Optional(Type.String()),
      query: Type.Optional(Type.String()),
    }),
    async execute() {
      return formatWebToolError(
        "No web search provider is configured. Set EXA_API_KEY or GEMINI_API_KEY.",
        {
          kind: "search",
        },
      );
    },
    renderCall(_args, theme) {
      return new Text(
        titleLine(theme, "text", "Searching", theme.fg("dim", "provider unavailable")),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderWebResult(result, theme, options);
    },
  };
}

export function createDroidWebSearchTool(): ToolDefinition {
  const provider = resolveWebSearchProvider();
  return {
    name: "WebSearch",
    label: "Web Search",
    description: `Performs a web search to find relevant web pages and documents to the input query. Has options to filter by search type, category, and domains. Use this tool ONLY when the query requires finding specific factual information that would benefit from accessing current web content, such as:
      - Recent news, events, or developments
      - Up-to-date statistics, data points, or facts
      - Information about public entities (companies, organizations, people)
      - Specific published content, articles, or references
      - Current trends or technologies
      - API documents for a publicly available API
      - Public github repositories, and other public code resources
    DO NOT use for:
      - Creative generation (writing, poetry, etc.)
      - Mathematical calculations or problem-solving
      - Code generation or debugging unrelated to web resources
      - Finding code files in a repository in factory`,
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      type: Type.Optional(Type.String({ description: "Search type" })),
      category: Type.Optional(Type.String({ description: "Category filter" })),
      numResults: Type.Optional(Type.Number({ description: "Maximum number of results" })),
      includeDomains: Type.Optional(Type.Array(Type.String())),
      excludeDomains: Type.Optional(Type.Array(Type.String())),
      text: Type.Optional(Type.Boolean({ description: "Request fuller text when available" })),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as DroidSearchParams;
      const subject = params.query.trim();
      try {
        if (provider === "exa") {
          const result = await runExaSearch({ ...params, signal });
          const citations = result.citations.slice(0, clampMaxResults(params.numResults));
          return buildSearchSuccessResult({
            provider: result.provider,
            subject,
            text: result.text,
            citations,
          });
        }
        if (provider === "gemini") {
          const result = await runGeminiDroidSearch({ ...params, signal });
          const citations = result.citations.slice(0, clampMaxResults(params.numResults));
          return buildSearchSuccessResult({
            provider: result.provider,
            subject,
            text: result.text,
            citations,
            model: result.model,
          });
        }
        return formatWebToolError(
          "No web search provider is configured. Set EXA_API_KEY or GEMINI_API_KEY.",
          {
            kind: "search",
            subject,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatWebToolError(message, { kind: "search", subject });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as DroidSearchParams;
      return new Text(
        titleLine(theme, "text", "Searching", theme.fg("accent", summarizeSubject("search", args.query))),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderWebResult(result, theme, options);
    },
  };
}

export function createWebSummaryTool(): ToolDefinition {
  return {
    name: WEB_SUMMARY_TOOL_NAME,
    label: "Web Summary",
    description:
      "Summarize relevant content from a specific URL using Gemini URL Context.\n\n" +
      "Use when you already know the page you want and need a grounded summary or answer from that URL. " +
      "Prefer `WebSearch` when you are still discovering sources.\n\n" +
      "# Examples\n\n" +
      "Summarize the relevant section from a docs page\n" +
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
            "A natural-language description of the research goal. If set, the returned summary focuses on information relevant to that goal.",
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
          description: `Maximum characters to return after summarization (default: ${DEFAULT_FETCH_MAX_CHARS}).`,
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Optional Gemini model override. Defaults to GEMINI_WEB_MODEL or gemini-2.5-flash.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as FetchParams;
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

        return buildSummarySuccessResult({
          url,
          text: result.text,
          citations: result.citations,
          model: result.model,
          context,
          maxChars: params.max_chars ?? DEFAULT_FETCH_MAX_CHARS,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatWebToolError(message, {
          kind: "summary",
          subject: url,
          context,
        });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as FetchParams;
      const suffix = theme.fg("accent", summarizeSubject("summary", args.url));
      const context = shortenText((args.prompt || args.objective)?.trim(), 72);
      const title = new Text(titleLine(theme, "text", "Summarizing", suffix), 0, 0);

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
  const provider = resolveWebSearchProvider();

  if (provider === "unavailable") {
    pi.registerTool(createUnavailableWebSearchTool());
    return;
  }

  pi.registerTool(createWebSearchTool());

  if (resolveGeminiApiKey()) {
    pi.registerTool(createWebSummaryTool());
  }
}
