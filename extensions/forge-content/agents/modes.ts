import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export const FORGE_MODE_NAMES = ["forge", "sage", "muse"] as const;

export type ForgeModeName = (typeof FORGE_MODE_NAMES)[number];

export type ForgeModeDefinition = {
  label: string;
  statusLabel: string;
  activeTools: string[];
  promptInstructions: string;
};

export const FORGE_MODES: Record<ForgeModeName, ForgeModeDefinition> = {
  forge: {
    label: "Forge",
    statusLabel: "forge",
    activeTools: ["read", "write", "shell", "fs_search", "patch", "followup", "todo_write", "todo_read"],
    promptInstructions:
      "You are operating in Forge mode. Default to hands-on implementation, patching, command execution, and full task completion.",
  },
  sage: {
    label: "Sage",
    statusLabel: "sage",
    activeTools: ["read", "shell", "fs_search", "followup"],
    promptInstructions:
      "You are operating in Sage mode. Focus on research, codebase investigation, architecture tracing, and read-only analysis.",
  },
  muse: {
    label: "Muse",
    statusLabel: "muse",
    activeTools: ["read", "fs_search", "followup", "todo_write", "todo_read"],
    promptInstructions:
      "You are operating in Muse mode. Focus on planning, breakdowns, risks, alternatives, and implementation strategy rather than making changes.",
  },
};

export function isForgeModeName(value: string): value is ForgeModeName {
  return FORGE_MODE_NAMES.includes(value as ForgeModeName);
}

export function getForgeModeDefinition(mode: ForgeModeName): ForgeModeDefinition {
  return FORGE_MODES[mode];
}

export function applyForgeMode(pi: ExtensionAPI, ctx: ExtensionContext, mode: ForgeModeName): void {
  const definition = getForgeModeDefinition(mode);
  pi.setActiveTools(definition.activeTools);
  ctx.ui.setStatus("forge-content:mode", ctx.ui.theme.fg("accent", definition.statusLabel));
}
