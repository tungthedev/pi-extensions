import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings, type SystemPromptPack, type TungthedevSettings } from "../settings/config.ts";
import { buildSelectedCodexPrompt, injectCodexPrompt } from "./packs/codex.ts";
import { buildSelectedForgePrompt } from "./packs/forge.ts";

export type PromptPackDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  buildCodexPromptForModel: (modelId: string | undefined) => string;
  buildForgePromptForContext: (pi: ExtensionAPI, ctx: ExtensionContext) => string;
};

function createDefaultDeps(): PromptPackDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    buildCodexPromptForModel: (modelId) => buildSelectedCodexPrompt(modelId),
    buildForgePromptForContext: (pi, ctx) => buildSelectedForgePrompt(pi, ctx),
  };
}

export function resolvePromptPack(settings: TungthedevSettings): SystemPromptPack {
  return settings.systemPrompt;
}

export function injectSelectedPromptPack(options: {
  baseSystemPrompt: string | undefined;
  selectedPack: Exclude<SystemPromptPack, null>;
  codexPrompt?: string;
  forgePrompt?: string;
}): string {
  if (options.selectedPack === "codex") {
    return injectCodexPrompt(options.baseSystemPrompt, options.codexPrompt ?? "");
  }

  return [(options.baseSystemPrompt ?? "").trim(), options.forgePrompt?.trim()]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
}

export async function handlePromptPackBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  deps: PromptPackDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const selectedPack = resolvePromptPack(await deps.readSettings());

  if (selectedPack === null) {
    return undefined;
  }

  if (selectedPack === "codex") {
    const codexPrompt = deps.buildCodexPromptForModel(ctx.model?.id);
    return {
      systemPrompt: injectSelectedPromptPack({
        baseSystemPrompt: event.systemPrompt,
        selectedPack,
        codexPrompt,
      }),
    };
  }

  const forgePrompt = deps.buildForgePromptForContext(pi, ctx);
  return {
    systemPrompt: injectSelectedPromptPack({
      baseSystemPrompt: event.systemPrompt,
      selectedPack,
      forgePrompt,
    }),
  };
}

export function registerPromptPack(pi: ExtensionAPI, deps: PromptPackDeps = createDefaultDeps()): void {
  pi.on("before_agent_start", async (event, ctx) => handlePromptPackBeforeAgentStart(event, ctx, pi, deps));
}

export default function registerPromptPackExtension(pi: ExtensionAPI) {
  registerPromptPack(pi);
}
