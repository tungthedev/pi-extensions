import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { readSettings, type PiModeSettings } from "../settings/config.ts";
import { buildPromptResult } from "../shared/prompt-composition.ts";
import {
  buildSystemMdPrompt,
  readSystemMdPrompt,
  resolveSystemMdPath,
  resolveSystemMdPromptContribution,
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
  return buildPromptResult(
    event.systemPrompt,
    resolveSystemMdPromptContribution(ctx.cwd, settings.systemMdPrompt),
  );
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
