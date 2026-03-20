/**
 * Adds Codex-compatible tool renderers, file tools, and workflow helpers to Pi.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCodexCompatibilityTools } from "./compatibility-tools/index.ts";
import { installExplorationEventHandlers } from "./exploration/events.ts";

export default function registerCodexContentExtension(pi: ExtensionAPI) {
  registerCodexCompatibilityTools(pi);
  installExplorationEventHandlers(pi);
}
