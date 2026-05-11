import TurndownService from "turndown";

const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndownService.remove([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "meta",
  "link",
]);

export type DirectFetchResult = {
  markdown: string;
  title?: string | null;
  url: string;
  statusCode?: number | null;
};

type FetchResult = {
  body: Uint8Array;
  contentType: string;
  status: number;
  url: string;
};

export async function runDirectFetch(
  url: string,
  signal?: AbortSignal,
): Promise<DirectFetchResult> {
  const fetched = await fetchUrl(url, signal);
  const raw = new TextDecoder().decode(fetched.body);
  const markdown = convertToMarkdown(raw, fetched.contentType);

  if (!markdown.trim()) {
    throw new Error("Direct web fetch did not return content.");
  }

  return {
    markdown: markdown.trim(),
    title: extractTitle(raw, fetched.contentType),
    url: fetched.url,
    statusCode: fetched.status,
  };
}

async function fetchUrl(url: string, signal?: AbortSignal): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${DEFAULT_TIMEOUT_SECONDS}s`)),
    Math.min(DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) * 1000,
  );
  const removeAbortForwarder = forwardAbort(signal, controller);

  try {
    const response = await fetch(url, {
      headers: buildHeaders(BROWSER_USER_AGENT),
      signal: controller.signal,
    });

    if (
      !response.ok &&
      response.status === 403 &&
      response.headers.get("cf-mitigated") === "challenge"
    ) {
      await cancelBody(response);
      const retry = await fetch(url, {
        headers: buildHeaders("pi-webfetch"),
        signal: controller.signal,
      });
      return await readFetchResponse(url, retry, controller.signal);
    }

    return await readFetchResponse(url, response, controller.signal);
  } finally {
    clearTimeout(timeout);
    removeAbortForwarder();
  }
}

function buildHeaders(userAgent: string): Record<string, string> {
  return {
    Accept:
      "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": userAgent,
  };
}

async function readFetchResponse(
  url: string,
  response: Response,
  signal: AbortSignal,
): Promise<FetchResult> {
  await rejectOversizedContentLength(response);
  const body = await readResponseBody(response, signal);
  return {
    body,
    contentType: response.headers.get("content-type") ?? "",
    status: response.status,
    url: response.url || url,
  };
}

async function rejectOversizedContentLength(response: Response): Promise<void> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE_BYTES) {
    await cancelBody(response);
    throw new Error("Response too large (exceeds 5MB limit)");
  }
}

async function readResponseBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      if (signal.aborted) {
        await cancelReader(reader);
        throw new Error("Request aborted");
      }
      const read = await reader.read();
      if (read.done) break;
      chunks.push(read.value);
      total += read.value.length;
      if (total > MAX_RESPONSE_SIZE_BYTES) {
        await cancelReader(reader);
        throw new Error("Response too large (exceeds 5MB limit)");
      }
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Keep the caller's original failure.
  }
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Keep the caller's original failure.
  }
}

function forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }

  const listener = (): void => controller.abort(signal.reason);
  signal.addEventListener("abort", listener, { once: true });
  return () => signal.removeEventListener("abort", listener);
}

function convertToMarkdown(content: string, contentType: string): string {
  const normalizedContentType = contentType.toLowerCase();
  if (
    normalizedContentType.includes("text/html") ||
    normalizedContentType.includes("application/xhtml+xml")
  ) {
    return turndownService.turndown(content);
  }
  return content;
}

function extractTitle(content: string, contentType: string): string | null {
  const normalizedContentType = contentType.toLowerCase();
  if (
    !normalizedContentType.includes("text/html") &&
    !normalizedContentType.includes("application/xhtml+xml")
  ) {
    return null;
  }

  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(content);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}
