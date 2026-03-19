import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_MAX_RESULTS,
  clampMaxResults,
  formatSources,
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

function formatToolError(message: string): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: message }],
    details: {},
    isError: true,
  };
}

export function createWebSearchTool(): ToolDefinition {
  return {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for information relevant to a research objective using Gemini Google Search grounding.\n\n" +
      "Use when you need up-to-date or precise documentation. " +
      "Use `web_fetch` to read a specific URL in more detail.\n\n" +
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
          description: "Optional Gemini model override. Defaults to GEMINI_WEB_MODEL or gemini-2.5-flash.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal, _onUpdate, _ctx) {
      const params = rawParams as unknown as SearchParams;

      try {
        const result = await runGeminiSearch({
          objective: params.objective,
          searchQueries: params.search_queries,
          maxResults: params.max_results,
          model: params.model,
          signal,
        });

        const citations = result.citations.slice(0, clampMaxResults(params.max_results));
        const sources = formatSources(citations);
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
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolError(message);
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as SearchParams;
      const objective = args.objective || "...";
      const short = objective.length > 70 ? `${objective.slice(0, 70)}...` : objective;
      let text =
        theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("dim", short);
      if (args.search_queries?.length) {
        text += theme.fg("muted", ` [${args.search_queries.join(", ")}]`);
      }
      return new Text(text, 0, 0);
    },
    renderResult() {
      return undefined;
    },
  };
}

export function createWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract content from a specific URL using Gemini URL Context.\n\n" +
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
          description: "Optional Gemini model override. Defaults to GEMINI_WEB_MODEL or gemini-2.5-flash.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal, _onUpdate, _ctx) {
      const params = rawParams as unknown as FetchParams;

      try {
        const result = await runGeminiFetch({
          url: params.url,
          objective: params.objective,
          prompt: params.prompt,
          maxChars: params.max_chars,
          model: params.model,
          signal,
        });

        const sources = formatSources(result.citations);
        const body = trimToMaxChars(
          wrapUntrustedWebContent(result.text, "web_fetch"),
          params.max_chars ?? DEFAULT_FETCH_MAX_CHARS,
        );
        const output = [body, sources ? `Sources:\n${sources}` : ""].filter(Boolean).join("\n\n");

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            provider: "gemini",
            model: result.model,
            citations: result.citations,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolError(message);
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as FetchParams;
      const url = args.url || "...";
      const short = url.length > 70 ? `${url.slice(0, 70)}...` : url;
      const detail = args.prompt || args.objective;
      let text = theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("dim", short);
      if (detail) {
        const trimmed = detail.length > 48 ? `${detail.slice(0, 48)}...` : detail;
        text += theme.fg("muted", ` — ${trimmed}`);
      }
      return new Text(text, 0, 0);
    },
    renderResult() {
      return undefined;
    },
  };
}

export default function webSearchPack(pi: ExtensionAPI) {
  pi.registerTool(createWebSearchTool());
  pi.registerTool(createWebFetchTool());
}
