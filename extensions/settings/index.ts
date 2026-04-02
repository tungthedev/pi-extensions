import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  readTungthedevSettings,
  writeToolSetSetting,
  writeSystemPromptSetting,
  type SystemPromptPack,
  type ToolSetPack,
  type TungthedevSettings,
} from "./config.ts";
import {
  formatSystemPromptPackLabel,
  formatToolSetLabel,
  openTungthedevSettingsUi,
  parseSettingsCommand,
} from "./ui.ts";

export type TungthedevCommandDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  writeSystemPrompt: (value: SystemPromptPack) => Promise<void>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  openSettingsUi: (
    ctx: ExtensionCommandContext,
    options: { focus?: "systemPrompt" | "toolSet" },
  ) => Promise<void>;
};

function createDefaultDeps(): TungthedevCommandDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    writeSystemPrompt: (value) => writeSystemPromptSetting(value),
    writeToolSet: (value) => writeToolSetSetting(value),
    openSettingsUi: (ctx, options) =>
      openTungthedevSettingsUi(ctx, {
        focus: options.focus,
        readSettings: () => readTungthedevSettings(),
        writeSystemPrompt: (value) => writeSystemPromptSetting(value),
        writeToolSet: (value) => writeToolSetSetting(value),
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

  if (action.action === "set-tool-set") {
    await deps.writeToolSet(action.value);
    ctx.ui.notify(`Tool set: ${formatToolSetLabel(action.value)}`, "info");
    return;
  }

  await deps.openSettingsUi(ctx, {
    focus:
      action.action === "open-system-prompt"
        ? "systemPrompt"
        : action.action === "open-tool-set"
          ? "toolSet"
          : undefined,
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
