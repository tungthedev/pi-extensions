/**
 * Adds Codex-compatible tool renderers, file tools, and workflow helpers to Pi.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCodexSystemPrompt } from "./system-prompt.js";
import { registerCodexCompatibilityTools } from "./tools/index.js";

export { CODEX_CONTENT_TOOL_NAMES } from "./metadata.js";

export interface CodexContentOptions {}

export function registerCodexContentExtension(
  pi: ExtensionAPI,
  _options: CodexContentOptions = {},
) {
  registerCodexCompatibilityTools(pi);
  registerCodexSystemPrompt(pi);
}

export default registerCodexContentExtension;
export { registerCodexSystemPrompt, registerCodexCompatibilityTools }
