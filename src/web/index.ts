import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createFetchUrlTool } from "./web-fetch/index.js";
import { createWebSearchTool, createWebSummaryTool } from "./web-search/index.js";

export {
  createDroidWebSearchTool,
  createUnavailableWebSearchTool,
  createWebSearchTool,
  createWebSummaryTool,
  resolveGeminiApiKey,
  resolveWebSearchProvider,
} from "./web-search/index.js";
export { createFetchUrlTool } from "./web-fetch/index.js";
export { createUnavailableFetchUrlTool } from "./web-fetch/index.js";
export { resolveWebFetchProvider } from "./web-fetch/index.js";

export default function registerWebExtension(pi: ExtensionAPI): void {
  pi.registerTool(createWebSearchTool());
  pi.registerTool(createWebSummaryTool());
  pi.registerTool(createFetchUrlTool());
}
