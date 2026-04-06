import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  readTungthedevSettings,
  writeCustomShellToolSetting,
  writeSystemMdPromptSetting,
  writeToolSetSetting,
  type ToolSetPack,
  type TungthedevSettings,
} from "./config.ts";
import {
  formatToolSetLabel,
  formatSystemMdPromptLabel,
  openTungthedevSettingsUi,
  parseSettingsCommand,
} from "./ui.ts";

export type TungthedevCommandDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeCustomShellTool: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  openSettingsUi: (
    ctx: ExtensionCommandContext,
    options: { focus?: "toolSet" | "customShellTool" | "systemMdPrompt" },
  ) => Promise<void>;
};

function createDefaultDeps(): TungthedevCommandDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    writeToolSet: (value) => writeToolSetSetting(value),
    writeCustomShellTool: (value) => writeCustomShellToolSetting(value),
    writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
    openSettingsUi: (ctx, options) =>
      openTungthedevSettingsUi(ctx, {
        focus: options.focus,
        readSettings: () => readTungthedevSettings(),
        writeToolSet: (value) => writeToolSetSetting(value),
        writeCustomShellTool: (value) => writeCustomShellToolSetting(value),
        writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
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

  if (action.action === "set-tool-set") {
    await deps.writeToolSet(action.value);
    ctx.ui.notify(`Tool set: ${formatToolSetLabel(action.value)}`, "info");
    return;
  }

  if (action.action === "set-custom-shell-tool") {
    await deps.writeCustomShellTool(action.value);
    ctx.ui.notify(`Custom shell tool: ${action.value ? "Enabled" : "Disabled"}`, "info");
    return;
  }

  if (action.action === "set-system-md-prompt") {
    await deps.writeSystemMdPrompt(action.value);
    ctx.ui.notify(`System.md prompt: ${formatSystemMdPromptLabel(action.value)}`, "info");
    return;
  }

  await deps.openSettingsUi(ctx, {
    focus:
      action.action === "open-tool-set"
        ? "toolSet"
        : action.action === "open-custom-shell-tool"
          ? "customShellTool"
          : action.action === "open-system-md-prompt"
            ? "systemMdPrompt"
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
