export type ExaSearchArgs = {
  query: string;
  type?: string;
  category?: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  text?: boolean;
  signal?: AbortSignal;
};

export type ExaSearchCitation = {
  url: string;
  title?: string;
  text?: string;
};

export function resolveExaApiKey(): string | undefined {
  const apiKey = process.env.EXA_API_KEY?.trim();
  return apiKey || undefined;
}

export async function runExaSearch(
  args: ExaSearchArgs,
): Promise<{ text: string; citations: ExaSearchCitation[]; provider: "exa" }> {
  const apiKey = resolveExaApiKey();
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not set.");
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: args.query,
      ...(args.type ? { type: args.type } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(typeof args.numResults === "number" ? { numResults: args.numResults } : {}),
      ...(args.includeDomains?.length ? { includeDomains: args.includeDomains } : {}),
      ...(args.excludeDomains?.length ? { excludeDomains: args.excludeDomains } : {}),
      ...(typeof args.text === "boolean" ? { text: args.text } : {}),
    }),
    signal: args.signal,
  });

  const body = (await response.json().catch(() => undefined)) as
    | {
        results?: Array<{ url?: string; title?: string; text?: string }>;
        error?: string;
      }
    | undefined;

  if (!response.ok) {
    throw new Error(body?.error || `Exa request failed (${response.status})`);
  }

  const citations = (body?.results ?? [])
    .map((result) => ({
      url: result.url?.trim() || "",
      title: result.title?.trim() || undefined,
      text: result.text?.trim() || undefined,
    }))
    .filter((result) => result.url.length > 0);

  const text = citations.length
    ? citations
        .map((citation, index) => {
          const parts = [`[${index + 1}] ${citation.title || citation.url}`, citation.url];
          if (citation.text) parts.push(citation.text);
          return parts.join("\n");
        })
        .join("\n\n")
    : "No search results returned.";

  return { text, citations, provider: "exa" };
}
