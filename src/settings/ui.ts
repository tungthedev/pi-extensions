import { getSettingsListTheme, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type SettingItem } from "@mariozechner/pi-tui";

import { formatToolSetLabel, type PiModeSettings, type ToolSetPack } from "./config.ts";

export type SettingsCommandAction =
  | { action: "open-root" }
  | { action: "open-tool-set" }
  | { action: "open-system-md-prompt" }
  | { action: "open-include-pi-prompt-section" }
  | { action: "set-tool-set"; value: ToolSetPack }
  | { action: "set-system-md-prompt"; value: boolean }
  | { action: "set-include-pi-prompt-section"; value: boolean }
  | { action: "invalid"; message: string };

export type OpenSettingsUiOptions = {
  focus?: "toolSet" | "systemMdPrompt" | "includePiPromptSection";
  readSettings: () => Promise<PiModeSettings>;
  applyToolSetTransition: (
    ctx: Pick<ExtensionContext, "hasUI" | "ui">,
    value: ToolSetPack,
  ) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  writeIncludePiPromptSection: (value: boolean) => Promise<void>;
};

const TOOL_SET_LABELS: Record<"Pi" | "Codex" | "Droid", ToolSetPack> = {
  Pi: "pi",
  Codex: "codex",
  Droid: "droid",
};

const SYSTEM_MD_PROMPT_LABELS: Record<"Enabled" | "Disabled", boolean> = {
  Enabled: true,
  Disabled: false,
};

const INCLUDE_PI_PROMPT_SECTION_LABELS: Record<"Enabled" | "Disabled", boolean> = {
  Enabled: true,
  Disabled: false,
};

export function formatSystemMdPromptLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

export function formatIncludePiPromptSectionLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

export function buildPiModeSettingItems(settings: PiModeSettings): SettingItem[] {
  return [
    {
      id: "toolSet",
      label: "Mode",
      description:
        "Selects the Pi, Codex, or Droid mode behavior for this package. Pi keeps native Pi tools only.",
      currentValue: formatToolSetLabel(settings.toolSet),
      values: ["Pi", "Codex", "Droid"],
    },
    {
      id: "systemMdPrompt",
      label: "Inject SYSTEM.md",
      description:
        "Injects the repo root SYSTEM.md into the active Pi, Codex, or Droid system prompt when enabled.",
      currentValue: formatSystemMdPromptLabel(settings.systemMdPrompt),
      values: ["Enabled", "Disabled"],
    },
    {
      id: "includePiPromptSection",
      label: "Include Pi prompt section",
      description:
        "Keeps the incoming Pi coding-environment prompt and appends the selected Codex or Droid prompt after it when enabled.",
      currentValue: formatIncludePiPromptSectionLabel(settings.includePiPromptSection),
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
      message: "System prompts now follow the selected tool set. Use: tool-set pi|codex|droid",
    };
  }

  if (parts[0] === "content-pack" || parts[0] === "tool-set") {
    if (parts.length === 1) return { action: "open-tool-set" };
    if (parts[1] === "pi" || parts[1] === "codex" || parts[1] === "droid") {
      return { action: "set-tool-set", value: parts[1] };
    }
    return { action: "invalid", message: `Unknown tool set: ${parts[1]}` };
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

  if (parts[0] === "include-pi-prompt") {
    if (parts.length === 1) return { action: "open-include-pi-prompt-section" };
    if (parts[1] === "on" || parts[1] === "enabled") {
      return { action: "set-include-pi-prompt-section", value: true };
    }
    if (parts[1] === "off" || parts[1] === "disabled") {
      return { action: "set-include-pi-prompt-section", value: false };
    }
    return { action: "invalid", message: `Unknown include-pi-prompt value: ${parts[1]}` };
  }

  return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
}

export async function openPiModeSettingsUi(
  ctx: ExtensionContext,
  options: OpenSettingsUiOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const settings = await options.readSettings();
  const items = buildPiModeSettingItems(settings);

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

          await options.applyToolSetTransition(ctx, nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatToolSetLabel(nextValue),
          };
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
          ctx.ui.notify(`Inject SYSTEM.md: ${formatSystemMdPromptLabel(nextValue)}`, "info");
          return;
        }

        if (id === "includePiPromptSection") {
          const nextValue =
            INCLUDE_PI_PROMPT_SECTION_LABELS[
              newValue as keyof typeof INCLUDE_PI_PROMPT_SECTION_LABELS
            ];
          if (nextValue === undefined) return;

          await options.writeIncludePiPromptSection(nextValue);
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatIncludePiPromptSectionLabel(nextValue),
          };
          ctx.ui.notify(
            `Include Pi prompt section: ${formatIncludePiPromptSectionLabel(nextValue)}`,
            "info",
          );
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
