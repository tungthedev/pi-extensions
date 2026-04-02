import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../../settings/config.ts";
import { applyForgeMode, FORGE_MODE_NAMES, getForgeModeDefinition, isForgeModeName, type ForgeModeName } from "./modes.ts";
import { setForgeRuntimeMode, type ForgeRuntimeState } from "../runtime-state.ts";

export type ForgeModeState = ForgeRuntimeState;

async function setMode(pi: ExtensionAPI, ctx: ExtensionContext, state: ForgeModeState, mode: ForgeModeName): Promise<void> {
  setForgeRuntimeMode(state, mode);

  const settings = await readTungthedevSettings();
  if (settings.toolSet === "forge") {
    applyForgeMode(pi, ctx, mode);
    ctx.ui.notify(`Switched to ${getForgeModeDefinition(mode).label} mode`, "info");
    return;
  }

  ctx.ui.notify(
    `Saved ${getForgeModeDefinition(mode).label} mode. Switch the Tungthedev tool set to Forge to apply it.`,
    "info",
  );
}

export function registerForgeModeCommands(pi: ExtensionAPI, state: ForgeModeState): void {
  for (const mode of FORGE_MODE_NAMES) {
    pi.registerCommand(mode, {
      description: `Switch to ${getForgeModeDefinition(mode).label} mode`,
      handler: async (_args, ctx) => {
        await setMode(pi, ctx, state, mode);
      },
    });
  }

  pi.registerCommand("forge-mode", {
    description: "Switch Forge mode: /forge-mode <forge|sage|muse>",
    handler: async (args, ctx) => {
      const requestedMode = args.trim().toLowerCase();
      if (!requestedMode) {
        ctx.ui.notify(`Current mode: ${state.currentMode}`, "info");
        return;
      }

      if (!isForgeModeName(requestedMode)) {
        ctx.ui.notify(`Unknown Forge mode: ${requestedMode}`, "warning");
        return;
      }

      await setMode(pi, ctx, state, requestedMode);
    },
  });
}
