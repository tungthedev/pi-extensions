import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { readSettings, type PiModeSettings } from "../settings/config.js";
import { composeCustomPromptWithPiSections } from "../shared/custom-prompt.js";
import { resolvePromptOptionsCwd } from "../shared/system-prompt-options.js";
import {
  buildSystemMdPrompt,
  readSystemMdPrompt,
  resolveSystemMdPrompt,
  resolveSystemMdPath,
} from "./state.js";

export { buildSystemMdPrompt, readSystemMdPrompt, resolveSystemMdPath } from "./state.js";

export type SystemMdPromptDeps = {
  readSettings: () => Promise<PiModeSettings>;
};

function createDefaultDeps(): SystemMdPromptDeps {
  return {
    readSettings: () => readSettings(),
  };
}

export async function handleSystemMdBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  deps: SystemMdPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  const systemMdPrompt = resolveSystemMdPrompt(
    resolvePromptOptionsCwd(event, ctx),
    settings.systemMdPrompt,
  );
  const systemPrompt = composeCustomPromptWithPiSections(event.systemPrompt, systemMdPrompt);
  return systemPrompt ? { systemPrompt } : undefined;
}

export function registerSystemMdPrompt(
  pi: ExtensionAPI,
  deps: SystemMdPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleSystemMdBeforeAgentStart(event, ctx, deps),
  );
}

export interface SystemMdOptions {}

export function registerSystemMdExtension(pi: ExtensionAPI, _options: SystemMdOptions = {}): void {
  registerSystemMdPrompt(pi);
}

export default registerSystemMdExtension;
