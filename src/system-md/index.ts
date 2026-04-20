import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { readSettings, type PiModeSettings } from "../settings/config.ts";
import { composeCustomPromptWithPiSections } from "../shared/custom-prompt.ts";
import {
  buildSystemMdPrompt,
  readSystemMdPrompt,
  resolveSystemMdPrompt,
  resolveSystemMdPath,
} from "./state.ts";

export { buildSystemMdPrompt, readSystemMdPrompt, resolveSystemMdPath } from "./state.ts";

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
  const systemMdPrompt = resolveSystemMdPrompt(ctx.cwd, settings.systemMdPrompt);
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

export default function registerSystemMdExtension(pi: ExtensionAPI): void {
  registerSystemMdPrompt(pi);
}
