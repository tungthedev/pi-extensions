import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../settings/config.ts";
import { applyForgeMode, type ForgeModeName } from "./agents/modes.ts";
import { registerForgeModeCommands } from "./agents/commands.ts";
import { getSharedForgeRuntimeState } from "./runtime-state.ts";
import { registerForgeResources } from "./resources/discover.ts";
import { registerForgeTools } from "./tools/index.ts";
import { registerForgeWorkflow } from "./workflow/index.ts";

async function syncForgeToolSet(pi: ExtensionAPI, ctx: ExtensionContext, mode: ForgeModeName): Promise<void> {
  const settings = await readTungthedevSettings();
  if (settings.toolSet !== "forge") {
    ctx.ui.setStatus("forge-content:mode", undefined);
    return;
  }

  applyForgeMode(pi, ctx, mode);
}

export default function registerForgeContentExtension(pi: ExtensionAPI) {
  const state = getSharedForgeRuntimeState();

  registerForgeResources(pi);
  registerForgeTools(pi);
  registerForgeWorkflow(pi);
  registerForgeModeCommands(pi, state);

  pi.on("session_start", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx, state.currentMode);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx, state.currentMode);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx, state.currentMode);
  });
}
