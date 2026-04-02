import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { applyForgeMode } from "./agents/modes.ts";
import { registerForgeModeCommands } from "./agents/commands.ts";
import { getSharedForgeRuntimeState } from "./runtime-state.ts";
import { registerForgeResources } from "./resources/discover.ts";
import { registerForgeTools } from "./tools/index.ts";
import { registerForgeWorkflow } from "./workflow/index.ts";

export default function registerForgeContentExtension(pi: ExtensionAPI) {
  const state = getSharedForgeRuntimeState();

  registerForgeResources(pi);
  registerForgeTools(pi);
  registerForgeWorkflow(pi);
  registerForgeModeCommands(pi, state);

  pi.on("session_start", async (_event, ctx) => {
    applyForgeMode(pi, ctx, state.currentMode);
  });

  pi.on("session_switch", async (_event, ctx) => {
    applyForgeMode(pi, ctx, state.currentMode);
  });
}
