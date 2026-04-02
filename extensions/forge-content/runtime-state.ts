import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { getForgeModeDefinition, type ForgeModeName } from "./agents/modes.ts";

export type ActiveToolInfo = {
  name: string;
  description: string;
};

export type ForgeRuntimeState = {
  currentMode: ForgeModeName;
};

const sharedForgeRuntimeState: ForgeRuntimeState = {
  currentMode: "forge",
};

export function createForgeRuntimeState(initialMode: ForgeModeName = "forge"): ForgeRuntimeState {
  return { currentMode: initialMode };
}

export function getSharedForgeRuntimeState(): ForgeRuntimeState {
  return sharedForgeRuntimeState;
}

export function setForgeRuntimeMode(state: ForgeRuntimeState, mode: ForgeModeName): void {
  state.currentMode = mode;
}

export function getForgeRuntimeSnapshot(state: ForgeRuntimeState): {
  mode: ForgeModeName;
  modeInstructions: string;
} {
  const definition = getForgeModeDefinition(state.currentMode);
  return {
    mode: state.currentMode,
    modeInstructions: definition.promptInstructions,
  };
}

export function getActiveToolInfos(pi: ExtensionAPI): ActiveToolInfo[] {
  const activeToolNames = new Set(pi.getActiveTools());
  return pi
    .getAllTools()
    .filter((tool) => activeToolNames.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
}

export function getForgePromptContext(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: ForgeRuntimeState,
): {
  cwd: string;
  activeTools: ActiveToolInfo[];
  mode: ForgeModeName;
  modeInstructions: string;
  shell?: string;
  homeDir?: string;
} {
  const snapshot = getForgeRuntimeSnapshot(state);
  return {
    cwd: ctx.cwd,
    activeTools: getActiveToolInfos(pi),
    mode: snapshot.mode,
    modeInstructions: snapshot.modeInstructions,
    shell: process.env.SHELL,
    homeDir: process.env.HOME,
  };
}
