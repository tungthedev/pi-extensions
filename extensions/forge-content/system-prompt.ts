import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import fs from "node:fs";

import { readTungthedevSettings, type TungthedevSettings } from "../settings/config.ts";
import { isSystemMdPromptEnabled } from "../system-md/state.ts";

const FORGE_SYSTEM_PROMPT_PATH = new URL("./assets/forge-system.md", import.meta.url);

export type ForgePromptOptions = {
  baseSystemPrompt?: string;
  cwd: string;
  activeTools: Array<{ name: string; description: string }>;
  shell?: string;
  homeDir?: string;
  currentDate?: string;
};

export type ForgeSystemPromptDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  buildPromptForContext: (pi: ExtensionAPI, ctx: ExtensionContext) => string;
};

function createDefaultDeps(): ForgeSystemPromptDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    buildPromptForContext: (pi, ctx) => buildSelectedForgePrompt(pi, ctx),
  };
}

export function readForgeSystemPrompt(assetPath: string | URL = FORGE_SYSTEM_PROMPT_PATH): string {
  return fs.readFileSync(assetPath, "utf-8").trim();
}

export function buildForgePrompt(options: ForgePromptOptions): string {
  const sections = [options.baseSystemPrompt?.trim(), readForgeSystemPrompt()];

  return sections
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
}

function getActiveToolInfos(pi: ExtensionAPI): Array<{ name: string; description: string }> {
  const activeToolNames = new Set(pi.getActiveTools());
  return pi
    .getAllTools()
    .filter((tool) => activeToolNames.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
}

export function buildSelectedForgePrompt(pi: ExtensionAPI, ctx: ExtensionContext): string {
  return buildForgePrompt({
    cwd: ctx.cwd,
    activeTools: getActiveToolInfos(pi),
    shell: process.env.SHELL,
    homeDir: process.env.HOME,
  });
}

export function injectForgePrompt(systemPrompt: string | undefined, forgePrompt: string): string {
  const basePrompt = (systemPrompt ?? "").trim();
  const appendedPrompt = forgePrompt.trim();
  return [basePrompt, appendedPrompt].filter(Boolean).join("\n\n").trim();
}

export async function handleForgeSystemPromptBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  deps: ForgeSystemPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  if (isSystemMdPromptEnabled() && settings.systemMdPrompt) {
    return undefined;
  }

  if (settings.toolSet !== "forge") {
    return undefined;
  }

  return {
    systemPrompt: injectForgePrompt(event.systemPrompt, deps.buildPromptForContext(pi, ctx)),
  };
}

export function registerForgeSystemPrompt(
  pi: ExtensionAPI,
  deps: ForgeSystemPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleForgeSystemPromptBeforeAgentStart(event, ctx, pi, deps),
  );
}
