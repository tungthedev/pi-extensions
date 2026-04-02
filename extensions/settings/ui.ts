import { getSettingsListTheme, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type SettingItem } from "@mariozechner/pi-tui";

import type { SystemPromptPack, TungthedevSettings } from "./config.ts";

export type SettingsCommandAction =
  | { action: "open-root" }
  | { action: "open-system-prompt" }
  | { action: "set-system-prompt"; value: SystemPromptPack }
  | { action: "invalid"; message: string };

export type OpenSettingsUiOptions = {
  focus?: "systemPrompt";
  readSettings: () => Promise<TungthedevSettings>;
  writeSystemPrompt: (value: SystemPromptPack) => Promise<void>;
};

const SYSTEM_PROMPT_LABELS: Record<"None" | "Codex" | "Forge", SystemPromptPack> = {
  None: null,
  Codex: "codex",
  Forge: "forge",
};

export function formatSystemPromptPackLabel(value: SystemPromptPack): "None" | "Codex" | "Forge" {
  if (value === "codex") return "Codex";
  if (value === "forge") return "Forge";
  return "None";
}

export function parseSettingsCommand(args: string): SettingsCommandAction {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "open-root" };
  if (parts[0] !== "system-prompt") {
    return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
  }
  if (parts.length === 1) return { action: "open-system-prompt" };
  if (parts[1] === "none") return { action: "set-system-prompt", value: null };
  if (parts[1] === "codex" || parts[1] === "forge") {
    return { action: "set-system-prompt", value: parts[1] };
  }
  return { action: "invalid", message: `Unknown system prompt pack: ${parts[1]}` };
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
  ];

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", theme.bold("Tungthedev Settings")), 1, 1));

    const settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 12),
      getSettingsListTheme(),
      async (id, newValue) => {
        if (id !== "systemPrompt") return;

        const nextValue = SYSTEM_PROMPT_LABELS[newValue as keyof typeof SYSTEM_PROMPT_LABELS];
        if (nextValue === undefined) return;

        await options.writeSystemPrompt(nextValue);
        items[0] = {
          ...items[0],
          currentValue: formatSystemPromptPackLabel(nextValue),
        };
        ctx.ui.notify(`System prompt pack: ${formatSystemPromptPackLabel(nextValue)}`, "info");
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
