import { getSettingsListTheme, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type SettingItem } from "@mariozechner/pi-tui";

import { formatToolSetLabel, type ToolSetPack, type TungthedevSettings } from "./config.ts";

export type SettingsCommandAction =
  | { action: "open-root" }
  | { action: "open-tool-set" }
  | { action: "open-custom-shell-tool" }
  | { action: "open-system-md-prompt" }
  | { action: "set-tool-set"; value: ToolSetPack }
  | { action: "set-custom-shell-tool"; value: boolean }
  | { action: "set-system-md-prompt"; value: boolean }
  | { action: "invalid"; message: string };

export type OpenSettingsUiOptions = {
  focus?: "toolSet" | "customShellTool" | "systemMdPrompt";
  readSettings: () => Promise<TungthedevSettings>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeCustomShellTool: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  onToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
};

const TOOL_SET_LABELS: Record<"Pi" | "Codex" | "Forge", ToolSetPack> = {
  Pi: "pi",
  Codex: "codex",
  Forge: "forge",
};

const CUSTOM_SHELL_TOOL_LABELS: Record<"Enabled" | "Disabled", boolean> = {
  Enabled: true,
  Disabled: false,
};

const SYSTEM_MD_PROMPT_LABELS: Record<"Enabled" | "Disabled", boolean> = {
  Enabled: true,
  Disabled: false,
};

export function formatCustomShellToolLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

export function formatSystemMdPromptLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

export function buildTungthedevSettingItems(settings: TungthedevSettings): SettingItem[] {
  return [
    {
      id: "toolSet",
      label: "Tool set",
      description:
        "Selects the Pi, Codex, or Forge tool and prompt behavior for this package. Pi keeps native Pi tools only.",
      currentValue: formatToolSetLabel(settings.toolSet),
      values: ["Pi", "Codex", "Forge"],
    },
    {
      id: "customShellTool",
      label: "Custom shell tool",
      description: "Switches between the package shell tool and Pi's built-in bash tool.",
      currentValue: formatCustomShellToolLabel(settings.customShellTool),
      values: ["Enabled", "Disabled"],
    },
    {
      id: "systemMdPrompt",
      label: "System.md prompt",
      description:
        "Loads the repo root SYSTEM.md and overrides the active Pi, Codex, or Forge system prompt when enabled.",
      currentValue: formatSystemMdPromptLabel(settings.systemMdPrompt),
      values: ["Enabled", "Disabled"],
    },
  ];
}

export function parseSettingsCommand(args: string): SettingsCommandAction {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "open-root" };

  if (parts[0] === "system-prompt") {
    return {
      action: "invalid",
      message: "System prompts now follow the selected tool set. Use: tool-set pi|codex|forge",
    };
  }

  if (parts[0] === "content-pack" || parts[0] === "tool-set") {
    if (parts.length === 1) return { action: "open-tool-set" };
    if (parts[1] === "pi" || parts[1] === "codex" || parts[1] === "forge") {
      return { action: "set-tool-set", value: parts[1] };
    }
    return { action: "invalid", message: `Unknown tool set: ${parts[1]}` };
  }

  if (parts[0] === "custom-shell-tool") {
    if (parts.length === 1) return { action: "open-custom-shell-tool" };
    if (parts[1] === "on" || parts[1] === "enabled") {
      return { action: "set-custom-shell-tool", value: true };
    }
    if (parts[1] === "off" || parts[1] === "disabled") {
      return { action: "set-custom-shell-tool", value: false };
    }
    return { action: "invalid", message: `Unknown custom shell tool value: ${parts[1]}` };
  }

  if (parts[0] === "system-md") {
    if (parts.length === 1) return { action: "open-system-md-prompt" };
    if (parts[1] === "on" || parts[1] === "enabled") {
      return { action: "set-system-md-prompt", value: true };
    }
    if (parts[1] === "off" || parts[1] === "disabled") {
      return { action: "set-system-md-prompt", value: false };
    }
    return { action: "invalid", message: `Unknown system-md value: ${parts[1]}` };
  }

  return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
}

export async function openTungthedevSettingsUi(
  ctx: ExtensionContext,
  options: OpenSettingsUiOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const settings = await options.readSettings();
  const items = buildTungthedevSettingItems(settings);

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", theme.bold("Pi Mode")), 1, 1));

    const settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 12),
      getSettingsListTheme(),
      async (id, newValue) => {
        if (id === "toolSet") {
          const nextValue = TOOL_SET_LABELS[newValue as keyof typeof TOOL_SET_LABELS];
          if (nextValue === undefined) return;

          await options.writeToolSet(nextValue);
          await options.onToolSetChange?.(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatToolSetLabel(nextValue),
          };
          ctx.ui.notify(`Tool set: ${formatToolSetLabel(nextValue)}`, "info");
          return;
        }

        if (id === "customShellTool") {
          const nextValue =
            CUSTOM_SHELL_TOOL_LABELS[newValue as keyof typeof CUSTOM_SHELL_TOOL_LABELS];
          if (nextValue === undefined) return;

          await options.writeCustomShellTool(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatCustomShellToolLabel(nextValue),
          };
          ctx.ui.notify(`Custom shell tool: ${formatCustomShellToolLabel(nextValue)}`, "info");
          return;
        }

        if (id === "systemMdPrompt") {
          const nextValue =
            SYSTEM_MD_PROMPT_LABELS[newValue as keyof typeof SYSTEM_MD_PROMPT_LABELS];
          if (nextValue === undefined) return;

          await options.writeSystemMdPrompt(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatSystemMdPromptLabel(nextValue),
          };
          ctx.ui.notify(`System.md prompt: ${formatSystemMdPromptLabel(nextValue)}`, "info");
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
