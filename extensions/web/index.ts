import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  resolveGeminiApiKey,
  createUnavailableWebSearchTool,
  createWebSearchTool,
  createWebSummaryTool,
  resolveWebSearchProvider,
} from "./web-search/index.ts";
import { createFetchUrlTool } from "./web-fetch/index.ts";

export {
  createDroidWebSearchTool,
  createUnavailableWebSearchTool,
  createWebSearchTool,
  createWebSummaryTool,
  resolveGeminiApiKey,
  resolveWebSearchProvider,
} from "./web-search/index.ts";
export { createFetchUrlTool } from "./web-fetch/index.ts";
export { createUnavailableFetchUrlTool } from "./web-fetch/index.ts";
export { resolveWebFetchProvider } from "./web-fetch/index.ts";

export default function registerWebExtension(pi: ExtensionAPI): void {
  const searchProvider = resolveWebSearchProvider();

  if (searchProvider === "unavailable") {
    pi.registerTool(createUnavailableWebSearchTool());
  } else {
    pi.registerTool(createWebSearchTool());
  }

  if (resolveGeminiApiKey()) {
    pi.registerTool(createWebSummaryTool());
  }

  pi.registerTool(createFetchUrlTool());
}
