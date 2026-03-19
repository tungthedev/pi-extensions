import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCodexCompatibilityTools } from "./compatibility-tools/index.ts";
import { installExplorationEventHandlers } from "./exploration/events.ts";

export default function codexContentRendering(pi: ExtensionAPI) {
  registerCodexCompatibilityTools(pi);
  installExplorationEventHandlers(pi);
}
