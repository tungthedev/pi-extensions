import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";

import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

import { renderToolCall } from "../../shared/renderers/common.ts";
import { shortenText } from "../../shared/text.ts";
import { wrapUntrustedWebContent } from "../web-search/gemini.ts";
import { hasCloudflareConfig, runCloudflareFetch } from "./providers/cloudflare.ts";
import { hasFirecrawlConfig, runFirecrawlFetch } from "./providers/firecrawl.ts";
import { formatFetchUrlError, renderFetchUrlResult } from "./render.ts";

export type WebFetchProvider = "cloudflare" | "firecrawl" | "unavailable";

export function resolveWebFetchProvider(): WebFetchProvider {
  if (hasCloudflareConfig()) return "cloudflare";
  if (hasFirecrawlConfig()) return "firecrawl";
  return "unavailable";
}

function isIpv6Loopback(hostname: string): boolean {
  return /^::1$/i.test(hostname) || /^(?:0*:){7}0*1$/i.test(hostname);
}

function isIpv6Private(hostname: string): boolean {
  return /^(fc|fd)/i.test(hostname) || /^fe[89ab]/i.test(hostname);
}

function validateFetchUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Invalid URL: ${url}. URL must start with http:// or https://`);
  }
  if (/^file:\/\//i.test(trimmed) || /^view-source:/i.test(trimmed)) {
    throw new Error("FetchUrl only supports explicit http:// or https:// URLs.");
  }

  const parsed = new URL(trimmed);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "host.docker.internal" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIpv6Loopback(hostname)
  ) {
    throw new Error("FetchUrl does not allow localhost, loopback, or internal hostnames.");
  }
  if (
    /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(hostname) ||
    isIpv6Private(hostname)
  ) {
    throw new Error("FetchUrl does not allow private network URLs.");
  }

  return trimmed;
}

export function createUnavailableFetchUrlTool(): ToolDefinition {
  return {
    name: "FetchUrl",
    label: "Web Fetch",
    description:
      "Fetch a user-provided URL and return markdown content. Returns a runtime error when no provider is configured.",
    parameters: Type.Object({
      url: Type.String({ description: "The URL to scrape content from" }),
    }),
    async execute(_toolCallId, rawParams) {
      const params = rawParams as { url: string };
      return formatFetchUrlError(
        "No web fetch provider is configured. Set Cloudflare or Firecrawl credentials.",
        {
          provider: "unavailable",
          subject: params.url,
        },
      );
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as { url: string };
      const provider = resolveWebFetchProvider();
      const providerSuffix =
        provider === "unavailable" ? theme.fg("dim", " (provider unavailable)") : "";
      return renderToolCall(
        theme,
        "Fetch",
        `${theme.fg("accent", shortenText(args.url, 96, "URL"))}${providerSuffix}`,
      );
    },
    renderResult(result, options, theme) {
      return renderFetchUrlResult(result, theme, options);
    },
  };
}

export function createFetchUrlTool(): ToolDefinition {
  return {
    name: "FetchUrl",
    label: "Web Fetch",
    description: `Scrapes content from URLs that the user provided, and returns the contents in markdown format. This tool supports both generic webpages and specific integration URLs.

CRITICAL: BEFORE CALLING THIS TOOL, CHECK IF THE URL WILL FAIL

URLs THAT WILL ALWAYS FAIL - DO NOT ATTEMPT TO FETCH:
- localhost / loopback / private network URLs
- file:// and other non-http protocols
- internal or corporate infrastructure URLs
- malformed or obviously non-viewable URLs

DO NOT use this tool for:
- URLs not explicitly provided by the user
- Web searching (use WebSearch tool instead)
- Any URL matching the failure patterns above`,
    parameters: Type.Object({
      url: Type.String({ description: "The URL to scrape content from" }),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const provider = resolveWebFetchProvider();
      const params = rawParams as { url: string };
      let url: string;
      try {
        url = validateFetchUrl(params.url);
      } catch (error) {
        return formatFetchUrlError(error instanceof Error ? error.message : String(error), {
          provider,
          subject: params.url,
        });
      }

      try {
        if (provider === "cloudflare") {
          const result = await runCloudflareFetch(url, signal);
          return {
            content: [
              {
                type: "text" as const,
                text: wrapUntrustedWebContent(result.markdown, "web_fetch"),
              },
            ],
            details: {
              provider,
              subject: result.url,
              title: result.title,
              statusCode: result.statusCode,
              render_markdown: result.markdown,
              preview_text: result.markdown,
            },
          };
        }

        if (provider === "firecrawl") {
          const result = await runFirecrawlFetch(url, signal);
          return {
            content: [
              {
                type: "text" as const,
                text: wrapUntrustedWebContent(result.markdown, "web_fetch"),
              },
            ],
            details: {
              provider,
              subject: result.url,
              title: result.title,
              statusCode: result.statusCode,
              render_markdown: result.markdown,
              preview_text: result.markdown,
            },
          };
        }

        return formatFetchUrlError(
          "No web fetch provider is configured. Set Cloudflare or Firecrawl credentials.",
          {
            provider,
            subject: url,
          },
        );
      } catch (error) {
        return formatFetchUrlError(error instanceof Error ? error.message : String(error), {
          provider,
          subject: url,
        });
      }
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as { url: string };
      const provider = resolveWebFetchProvider();
      const providerSuffix = provider === "unavailable" ? "" : theme.fg("dim", ` (${provider})`);
      return renderToolCall(
        theme,
        "Fetch",
        `${theme.fg("accent", shortenText(args.url, 96, "URL"))}${providerSuffix}`,
      );
    },
    renderResult(result, options, theme) {
      return renderFetchUrlResult(result, theme, options);
    },
  };
}

export default function cloudflareCrawlPack(pi: ExtensionAPI) {
  pi.registerTool(createFetchUrlTool());
}
