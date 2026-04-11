import { type Citation, runGeminiSearch, type GeminiSearchArgs } from "../gemini.ts";

export type GeminiDroidSearchArgs = {
  query: string;
  type?: string;
  category?: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  text?: boolean;
  signal?: AbortSignal;
};

function buildGeminiObjective(args: GeminiDroidSearchArgs): string {
  const lines = [args.query.trim()];
  if (args.type) lines.push(`Search type: ${args.type}`);
  if (args.category) lines.push(`Category: ${args.category}`);
  if (args.includeDomains?.length) {
    lines.push(`Prefer domains: ${args.includeDomains.join(", ")}`);
  }
  if (args.excludeDomains?.length) {
    lines.push(`Avoid domains: ${args.excludeDomains.join(", ")}`);
  }
  if (args.text) {
    lines.push("Return fuller text when available.");
  }
  return lines.join("\n");
}

export async function runGeminiDroidSearch(
  args: GeminiDroidSearchArgs,
): Promise<{ text: string; citations: Citation[]; model: string; provider: "gemini" }> {
  const result = await runGeminiSearch({
    objective: buildGeminiObjective(args),
    maxResults: args.numResults,
    searchQueries: [args.query.trim()],
    signal: args.signal,
  } satisfies GeminiSearchArgs);

  return {
    ...result,
    provider: "gemini",
  };
}
