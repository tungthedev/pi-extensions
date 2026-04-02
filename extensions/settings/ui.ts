import { getSettingsListTheme, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type SettingItem } from "@mariozechner/pi-tui";

import type { SystemPromptPack, ToolSetPack, TungthedevSettings } from "./config.ts";

export type SettingsCommandAction =
  | { action: "open-root" }
  | { action: "open-system-prompt" }
  | { action: "open-tool-set" }
  | { action: "set-system-prompt"; value: SystemPromptPack }
  | { action: "set-tool-set"; value: ToolSetPack }
  | { action: "invalid"; message: string };

export type OpenSettingsUiOptions = {
  focus?: "systemPrompt" | "toolSet";
  readSettings: () => Promise<TungthedevSettings>;
  writeSystemPrompt: (value: SystemPromptPack) => Promise<void>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
};

const SYSTEM_PROMPT_LABELS: Record<"None" | "Codex" | "Forge", SystemPromptPack> = {
  None: null,
  Codex: "codex",
  Forge: "forge",
};

const TOOL_SET_LABELS: Record<"Codex" | "Forge", ToolSetPack> = {
  Codex: "codex",
  Forge: "forge",
};

export function formatSystemPromptPackLabel(value: SystemPromptPack): "None" | "Codex" | "Forge" {
  if (value === "codex") return "Codex";
  if (value === "forge") return "Forge";
  return "None";
}

export function formatToolSetLabel(value: ToolSetPack): "Codex" | "Forge" {
  return value === "forge" ? "Forge" : "Codex";
}

export function parseSettingsCommand(args: string): SettingsCommandAction {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "open-root" };
  if (parts[0] === "system-prompt") {
    if (parts.length === 1) return { action: "open-system-prompt" };
    if (parts[1] === "none") return { action: "set-system-prompt", value: null };
    if (parts[1] === "codex" || parts[1] === "forge") {
      return { action: "set-system-prompt", value: parts[1] };
    }
    return { action: "invalid", message: `Unknown system prompt pack: ${parts[1]}` };
  }

  if (parts[0] === "tool-set") {
    if (parts.length === 1) return { action: "open-tool-set" };
    if (parts[1] === "codex" || parts[1] === "forge") {
      return { action: "set-tool-set", value: parts[1] };
    }
    return { action: "invalid", message: `Unknown tool set: ${parts[1]}` };
  }

  {
    return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
  }
}

export async function openTungthedevSettingsUi(
  ctx: ExtensionContext,
  options: OpenSettingsUiOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const settings = await options.readSettings();
  const items: SettingItem[] = [
    {
      id: "systemPrompt",
      label: "System prompt pack",
      currentValue: formatSystemPromptPackLabel(settings.systemPrompt),
      values: ["None", "Codex", "Forge"],
    },
    {
      id: "toolSet",
      label: "Tool set",
      currentValue: formatToolSetLabel(settings.toolSet),
      values: ["Codex", "Forge"],
    },
  ];

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", theme.bold("Tungthedev Settings")), 1, 1));

    const settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 12),
      getSettingsListTheme(),
      async (id, newValue) => {
        if (id === "systemPrompt") {
          const nextValue = SYSTEM_PROMPT_LABELS[newValue as keyof typeof SYSTEM_PROMPT_LABELS];
          if (nextValue === undefined) return;

          await options.writeSystemPrompt(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatSystemPromptPackLabel(nextValue),
          };
          ctx.ui.notify(`System prompt pack: ${formatSystemPromptPackLabel(nextValue)}`, "info");
          return;
        }

        if (id === "toolSet") {
          const nextValue = TOOL_SET_LABELS[newValue as keyof typeof TOOL_SET_LABELS];
          if (nextValue === undefined) return;

          await options.writeToolSet(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatToolSetLabel(nextValue),
          };
          ctx.ui.notify(`Tool set: ${formatToolSetLabel(nextValue)}`, "info");
        }
      },
      () => done(undefined),
      {
        enableSearch: false,
      },
    );

    container.addChild(settingsList);

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => settingsList.handleInput?.(data),
    };
  });
}
