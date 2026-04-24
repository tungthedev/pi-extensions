import assert from "node:assert/strict";
import test from "node:test";

import { runCloudflareFetch } from "./cloudflare.ts";

test("runCloudflareFetch omits the invalid zero depth crawl option", async () => {
  const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const originalApiToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalBrowserToken = process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN;
  const originalFetch = globalThis.fetch;

  process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_API_TOKEN = "api-token";
  delete process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN;

  let requestBody: Record<string, unknown> | null = null;
  let callCount = 0;

  globalThis.fetch = (async (_url, init) => {
    callCount += 1;

    if (callCount === 1) {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({ success: true, result: "job-123" }),
      } as Response;
    }

    return {
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              markdown: "Fetched markdown",
              metadata: { title: "Example", url: "https://example.com", status: 200 },
            },
          ],
        },
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await runCloudflareFetch("https://example.com");

    assert.equal(result.markdown, "Fetched markdown");
    assert.ok(requestBody);
    assert.equal(requestBody["url"], "https://example.com");
    assert.equal(requestBody["limit"], 1);
    assert.equal(requestBody["depth"], undefined);
  } finally {
    if (originalAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;

    if (originalApiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalApiToken;

    if (originalBrowserToken === undefined) {
      delete process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN = originalBrowserToken;
    }

    globalThis.fetch = originalFetch;
  }
});
