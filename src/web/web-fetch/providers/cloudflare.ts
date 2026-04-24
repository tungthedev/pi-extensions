import { readPiModeSettingsSync } from "../../../settings/config.ts";

const DEFAULT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;

export type CloudflareFetchResult = {
  markdown: string;
  title?: string | null;
  url: string;
  statusCode?: number | null;
};

function resolveCloudflareConfig(): { accountId: string; apiToken: string } {
  const settings = readPiModeSettingsSync();
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || settings.webTools.cloudflareAccountId;
  const apiToken =
    process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    settings.webTools.cloudflareApiToken;

  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set.");
  if (!apiToken) {
    throw new Error("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN or CLOUDFLARE_API_TOKEN is not set.");
  }

  return { accountId, apiToken };
}

export function hasCloudflareConfig(): boolean {
  try {
    resolveCloudflareConfig();
    return true;
  } catch {
    return false;
  }
}

async function cloudflareRequest<T>(pathname: string, init: RequestInit = {}) {
  const { accountId, apiToken } = resolveCloudflareConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiToken}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl${pathname}`,
    { ...init, headers },
  );

  const body = (await response.json().catch(() => undefined)) as
    | { success?: boolean; result?: T; errors?: Array<{ message?: string }> }
    | undefined;

  if (!response.ok || !body?.success) {
    const message = body?.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || `Cloudflare request failed (${response.status})`);
  }

  return body.result;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("fetch aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runCloudflareFetch(
  url: string,
  signal?: AbortSignal,
): Promise<CloudflareFetchResult> {
  const jobId = await cloudflareRequest<string>("", {
    method: "POST",
    body: JSON.stringify({
      url,
      limit: 1,
      formats: ["markdown"],
      render: true,
      source: "all",
      crawlPurposes: ["search"],
    }),
  });

  if (!jobId) throw new Error("Cloudflare did not return a fetch job id.");

  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("fetch aborted");

    const job = await cloudflareRequest<{
      status?: string;
      records?: Array<{
        markdown?: string;
        metadata?: { title?: string; url?: string; status?: number };
      }>;
    }>(`/${jobId}`);

    if (job?.status === "completed") {
      const record = job.records?.find((entry) => entry.markdown?.trim());
      if (!record?.markdown?.trim()) {
        throw new Error("Cloudflare fetch completed without markdown content.");
      }
      return {
        markdown: record.markdown.trim(),
        title: record.metadata?.title ?? null,
        url: record.metadata?.url?.trim() || url,
        statusCode: record.metadata?.status ?? null,
      };
    }

    if (job?.status && job.status !== "running") {
      throw new Error(`Cloudflare fetch ended with status ${job.status}.`);
    }

    await sleep(POLL_INTERVAL_MS, signal);
  }

  throw new Error("Cloudflare fetch timed out.");
}
