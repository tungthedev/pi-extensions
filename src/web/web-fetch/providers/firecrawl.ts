export type FirecrawlFetchResult = {
  markdown: string;
  title?: string | null;
  url: string;
  statusCode?: number | null;
};

export function resolveFirecrawlApiKey(): string | undefined {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  return apiKey || undefined;
}

export function hasFirecrawlConfig(): boolean {
  return Boolean(resolveFirecrawlApiKey());
}

export async function runFirecrawlFetch(
  url: string,
  signal?: AbortSignal,
): Promise<FirecrawlFetchResult> {
  const apiKey = resolveFirecrawlApiKey();
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set.");

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
    signal,
  });

  const body = (await response.json().catch(() => undefined)) as
    | {
        success?: boolean;
        error?: string;
        data?: {
          markdown?: string;
          metadata?: { title?: string; sourceURL?: string; statusCode?: number };
        };
      }
    | undefined;

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || `Firecrawl request failed (${response.status})`);
  }

  const markdown = body?.data?.markdown?.trim();
  if (!markdown) {
    throw new Error("Firecrawl did not return markdown content.");
  }

  return {
    markdown,
    title: body?.data?.metadata?.title ?? null,
    url: body?.data?.metadata?.sourceURL?.trim() || url,
    statusCode: body?.data?.metadata?.statusCode ?? null,
  };
}
