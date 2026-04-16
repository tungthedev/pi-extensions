import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createFetchUrlTool } from "./web-fetch/index.ts";
import { createWebSearchTool, createWebSummaryTool } from "./web-search/index.ts";

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
  pi.registerTool(createWebSearchTool());
  pi.registerTool(createWebSummaryTool());
  pi.registerTool(createFetchUrlTool());
}
