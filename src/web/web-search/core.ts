import type { Citation } from "./gemini.ts";

export type GenericSearchParams = {
  objective: string;
  search_queries?: string[];
  max_results?: number;
  model?: string;
};

export type DroidSearchParams = {
  query: string;
  type?: string;
  category?: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  text?: boolean;
};

export type SearchParams = Partial<GenericSearchParams & DroidSearchParams>;

export type FetchParams = {
  url: string;
  objective?: string;
  prompt?: string;
  max_chars?: number;
  model?: string;
};

export type WebSearchProvider = "exa" | "gemini" | "unavailable";
export type WebToolKind = "search" | "summary";

export type WebToolRenderDetails = {
  provider?: string;
  model?: string;
  citations?: Citation[];
  kind?: WebToolKind;
  subject?: string;
  context?: string;
  render_markdown?: string;
  preview_text?: string;
};

export function formatWebToolError(
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

export function formatSourcesMarkdown(citations: Citation[]): string {
  if (citations.length === 0) return "";

  const lines = citations.map((citation, index) => {
    const title = (citation.title?.trim() || citation.url).replace(/[[\]]/g, "\\$&");
    return `${index + 1}. [${title}](${citation.url})`;
  });

  return ["## Sources", "", ...lines].join("\n");
}

export function buildRenderableMarkdown(body: string, citations: Citation[]): string {
  return [body.trim(), formatSourcesMarkdown(citations)].filter(Boolean).join("\n\n").trim();
}
