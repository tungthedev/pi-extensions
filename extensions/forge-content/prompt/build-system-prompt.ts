import fs from "node:fs";

import { buildForgeRuntimeContext } from "./runtime-context.ts";

const FORGE_SYSTEM_PROMPT_PATH = new URL("./forge-system.md", import.meta.url);

export type ForgePromptOptions = {
  baseSystemPrompt?: string;
  cwd: string;
  activeTools: Array<{ name: string; description: string }>;
  mode: string;
  modeInstructions?: string;
  shell?: string;
  homeDir?: string;
  currentDate?: string;
};

export function readForgeSystemPrompt(assetPath: string | URL = FORGE_SYSTEM_PROMPT_PATH): string {
  return fs.readFileSync(assetPath, "utf-8").trim();
}

export function buildForgePrompt(options: ForgePromptOptions): string {
  const sections = [
    options.baseSystemPrompt?.trim(),
    readForgeSystemPrompt(),
    options.modeInstructions?.trim(),
    buildForgeRuntimeContext({
      cwd: options.cwd,
      activeTools: options.activeTools,
      mode: options.mode,
      shell: options.shell,
      homeDir: options.homeDir,
      currentDate: options.currentDate,
    }),
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n").trim();
}
