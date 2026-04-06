/**
 * Adds Codex-compatible tool renderers, file tools, and workflow helpers to Pi.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installExplorationEventHandlers } from "./exploration/events.ts";
import { registerCodexSystemPrompt } from "./system-prompt.ts";
import { registerCodexCompatibilityTools } from "./tools/index.ts";

export default function registerCodexContentExtension(pi: ExtensionAPI) {
  registerCodexCompatibilityTools(pi);
  installExplorationEventHandlers(pi);
  registerCodexSystemPrompt(pi);
}
