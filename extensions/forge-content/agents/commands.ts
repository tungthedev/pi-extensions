import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyForgeMode, FORGE_MODE_NAMES, getForgeModeDefinition, isForgeModeName, type ForgeModeName } from "./modes.ts";
import { setForgeRuntimeMode, type ForgeRuntimeState } from "../runtime-state.ts";

export type ForgeModeState = ForgeRuntimeState;

function setMode(pi: ExtensionAPI, ctx: ExtensionContext, state: ForgeModeState, mode: ForgeModeName): void {
  setForgeRuntimeMode(state, mode);
  applyForgeMode(pi, ctx, mode);
  ctx.ui.notify(`Switched to ${getForgeModeDefinition(mode).label} mode`, "info");
}

export function registerForgeModeCommands(pi: ExtensionAPI, state: ForgeModeState): void {
  for (const mode of FORGE_MODE_NAMES) {
    pi.registerCommand(mode, {
      description: `Switch to ${getForgeModeDefinition(mode).label} mode`,
      handler: async (_args, ctx) => {
        setMode(pi, ctx, state, mode);
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

      setMode(pi, ctx, state, requestedMode);
    },
  });
}
