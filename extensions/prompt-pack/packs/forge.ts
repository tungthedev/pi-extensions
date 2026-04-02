import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { buildForgePrompt } from "../../forge-content/prompt/build-system-prompt.ts";

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
