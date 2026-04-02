import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  readTungthedevSettings,
  writeSystemPromptSetting,
  type SystemPromptPack,
  type TungthedevSettings,
} from "./config.ts";
import {
  formatSystemPromptPackLabel,
  openTungthedevSettingsUi,
  parseSettingsCommand,
} from "./ui.ts";

export type TungthedevCommandDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  writeSystemPrompt: (value: SystemPromptPack) => Promise<void>;
  openSettingsUi: (
    ctx: ExtensionCommandContext,
    options: { focus?: "systemPrompt" },
  ) => Promise<void>;
};

function createDefaultDeps(): TungthedevCommandDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    writeSystemPrompt: (value) => writeSystemPromptSetting(value),
    openSettingsUi: (ctx, options) =>
      openTungthedevSettingsUi(ctx, {
        focus: options.focus,
        readSettings: () => readTungthedevSettings(),
        writeSystemPrompt: (value) => writeSystemPromptSetting(value),
      }),
  };
}

export async function handleTungthedevCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: TungthedevCommandDeps = createDefaultDeps(),
): Promise<void> {
  const action = parseSettingsCommand(args);

  if (action.action === "invalid") {
    ctx.ui.notify(action.message, "warning");
    return;
  }

  if (action.action === "set-system-prompt") {
    await deps.writeSystemPrompt(action.value);
    ctx.ui.notify(`System prompt pack: ${formatSystemPromptPackLabel(action.value)}`, "info");
    return;
  }

  await deps.openSettingsUi(ctx, {
    focus: action.action === "open-system-prompt" ? "systemPrompt" : undefined,
  });
}

export function registerTungthedevCommand(
  pi: ExtensionAPI,
  deps: TungthedevCommandDeps = createDefaultDeps(),
): void {
  pi.registerCommand("tungthedev", {
    description: "Open Tungthedev package settings or update a package setting",
    handler: async (args, ctx) => {
      await handleTungthedevCommand(args, ctx, deps);
    },
  });
}

export default function registerTungthedevSettingsExtension(pi: ExtensionAPI) {
  registerTungthedevCommand(pi);
}
