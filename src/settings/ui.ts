import { getSettingsListTheme, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  Input,
  SettingsList,
  type Component,
  type SettingItem,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

import {
  formatToolSetLabel,
  type PiModeSettings,
  type ToolSetPack,
  type WebToolSettingKey,
} from "./config.ts";

export type SettingsCommandAction =
  | { action: "open-root" }
  | { action: "open-tool-set" }
  | { action: "open-load-skills" }
  | { action: "open-system-md-prompt" }
  | { action: "set-tool-set"; value: ToolSetPack }
  | { action: "set-load-skills"; value: boolean }
  | { action: "set-system-md-prompt"; value: boolean }
  | { action: "invalid"; message: string };

export type OpenSettingsUiOptions = {
  focus?: "toolSet" | "loadSkills" | "systemMdPrompt";
  readSettings: () => Promise<PiModeSettings>;
  applyToolSetTransition: (
    ctx: Pick<ExtensionContext, "hasUI" | "ui">,
    value: ToolSetPack,
  ) => Promise<void>;
  writeLoadSkills: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  writeWebToolSetting: (key: WebToolSettingKey, value: string | undefined) => Promise<void>;
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

const LOAD_SKILLS_LABELS: Record<"Enabled" | "Disabled", boolean> = {
  Enabled: true,
  Disabled: false,
};

export function formatSystemMdPromptLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

export function formatLoadSkillsLabel(value: boolean): "Enabled" | "Disabled" {
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
      id: "loadSkills",
      label: "Load Skills",
      description:
        "Includes Pi's available skill list in the system prompt when enabled. Disabling this keeps skills installed, but hides the list from the prompt.",
      currentValue: formatLoadSkillsLabel(settings.loadSkills),
      values: ["Enabled", "Disabled"],
    },
    {
      id: "systemMdPrompt",
      label: "Inject SYSTEM.md",
      description:
        "Uses the repo root SYSTEM.md as the prompt body in Pi, Codex, or Droid mode when enabled.",
      currentValue: formatSystemMdPromptLabel(settings.systemMdPrompt),
      values: ["Enabled", "Disabled"],
    },
    {
      id: "webTools",
      label: "Web Tools",
      description:
        "Store Gemini, Cloudflare, and Firecrawl credentials for web tools. Shell ENV values still take precedence over stored settings.",
      currentValue: buildWebToolsSummary(settings),
    },
  ];
}

function getGeminiEnvValue(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || undefined;
}

function getCloudflareAccountIdEnvValue(): string | undefined {
  return process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined;
}

function getCloudflareTokenEnvValue(): string | undefined {
  return (
    process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    undefined
  );
}

function getFirecrawlApiKeyEnvValue(): string | undefined {
  return process.env.FIRECRAWL_API_KEY?.trim() || undefined;
}

function formatStoredSettingStatus(storedValue?: string, envValue?: string): string {
  if (envValue && storedValue) return "ENV override";
  if (envValue) return "ENV";
  if (storedValue) return "Stored";
  return "Not set";
}

function buildWebToolsSummary(settings: PiModeSettings): string {
  const geminiReady = Boolean(getGeminiEnvValue() || settings.webTools.geminiApiKey);
  const cloudflareReady = Boolean(
    (getCloudflareAccountIdEnvValue() || settings.webTools.cloudflareAccountId) &&
    (getCloudflareTokenEnvValue() || settings.webTools.cloudflareApiToken),
  );
  const firecrawlReady = Boolean(getFirecrawlApiKeyEnvValue() || settings.webTools.firecrawlApiKey);
  const crawlReady = cloudflareReady || firecrawlReady;
  const partial = Boolean(
    settings.webTools.geminiApiKey ||
    settings.webTools.cloudflareAccountId ||
    settings.webTools.cloudflareApiToken ||
    settings.webTools.firecrawlApiKey ||
    getGeminiEnvValue() ||
    getCloudflareAccountIdEnvValue() ||
    getCloudflareTokenEnvValue() ||
    getFirecrawlApiKeyEnvValue(),
  );

  if (geminiReady && crawlReady) return "Search + crawl ready";
  if (geminiReady) return "Search ready";
  if (crawlReady) return "Crawl ready";
  if (partial) return "Partially configured";
  return "Not configured";
}

function createSecretInputComponent(options: {
  title: string;
  description: string;
  prefill?: string;
  saveLabel: string;
  dimText: (text: string) => string;
  mutedText: (text: string) => string;
  onSubmit: (value: string | undefined) => Promise<void>;
  onCancel: () => void;
}): Component {
  const input = new Input();
  let errorMessage: string | undefined;

  if (options.prefill) {
    input.setValue(options.prefill);
  }

  input.onSubmit = (value) => {
    const nextValue = value.trim() || undefined;
    errorMessage = undefined;

    void options.onSubmit(nextValue).catch((error) => {
      errorMessage = error instanceof Error ? error.message : String(error);
      input.invalidate();
    });
  };
  input.onEscape = options.onCancel;

  return {
    handleInput(data: string) {
      input.handleInput(data);
    },
    invalidate() {
      input.invalidate();
    },
    render(width: number) {
      const lines = [options.title, ""];

      for (const line of wrapTextWithAnsi(options.description, Math.max(16, width - 2))) {
        lines.push(line);
      }

      lines.push("");
      lines.push(...input.render(width));
      lines.push("");
      if (errorMessage) {
        lines.push(`Error: ${errorMessage}`);
      }
      lines.push(
        options.dimText(`${options.saveLabel}. Submit an empty value to clear the stored setting.`),
      );
      lines.push("");
      lines.push(options.mutedText("[enter] save  [esc] back"));
      return lines;
    },
  };
}

function renderSettingsListWithFooter(
  settingsList: SettingsList,
  width: number,
  mutedText: (text: string) => string,
): string[] {
  const lines = settingsList.render(width);
  if (lines.length === 0) return lines;

  lines[lines.length - 1] = mutedText("  [space] update/select  [esc] back");
  return lines;
}

function createWebToolsSubmenu(
  ctx: Pick<ExtensionContext, "ui">,
  options: Pick<OpenSettingsUiOptions, "writeWebToolSetting">,
  settings: PiModeSettings,
  stylers: {
    dimText: (text: string) => string;
    mutedText: (text: string) => string;
    breadcrumbText: (parent: string, current: string) => string;
  },
  done: (selectedValue?: string) => void,
): Component {
  const state = settings;

  const items: SettingItem[] = [
    {
      id: "geminiApiKey",
      label: "Gemini API Key",
      description:
        "Used by WebSearch and WebSummary. GEMINI_API_KEY or GOOGLE_API_KEY from the shell overrides the stored value.",
      currentValue: formatStoredSettingStatus(state.webTools.geminiApiKey, getGeminiEnvValue()),
    },
    {
      id: "cloudflareAccountId",
      label: "Cloudflare Account ID",
      description:
        "Used with the Cloudflare Browser Rendering crawl API. CLOUDFLARE_ACCOUNT_ID from the shell overrides the stored value.",
      currentValue: formatStoredSettingStatus(
        state.webTools.cloudflareAccountId,
        getCloudflareAccountIdEnvValue(),
      ),
    },
    {
      id: "cloudflareApiToken",
      label: "Cloudflare API Token",
      description:
        "Used for Cloudflare web crawl requests. CLOUDFLARE_BROWSER_RENDERING_API_TOKEN or CLOUDFLARE_API_TOKEN from the shell overrides the stored value.",
      currentValue: formatStoredSettingStatus(
        state.webTools.cloudflareApiToken,
        getCloudflareTokenEnvValue(),
      ),
    },
    {
      id: "firecrawlApiKey",
      label: "Firecrawl API Key",
      description:
        "Used as the fallback web crawl provider when Cloudflare is not configured. FIRECRAWL_API_KEY from the shell overrides the stored value.",
      currentValue: formatStoredSettingStatus(
        state.webTools.firecrawlApiKey,
        getFirecrawlApiKeyEnvValue(),
      ),
    },
  ];

  const settingsList = new SettingsList(
    items.map((item) => ({
      ...item,
      submenu: (_currentValue, leafDone) =>
        createSecretInputComponent({
          title: item.label,
          description: item.description ?? "",
          prefill: state.webTools[item.id as WebToolSettingKey],
          saveLabel: `Stored value for ${item.label}`,
          dimText: stylers.dimText,
          mutedText: stylers.mutedText,
          onSubmit: async (value) => {
            const key = item.id as WebToolSettingKey;
            await options.writeWebToolSetting(key, value);
            state.webTools[key] = value;
            settingsList.updateValue(
              key,
              key === "geminiApiKey"
                ? formatStoredSettingStatus(state.webTools[key], getGeminiEnvValue())
                : key === "cloudflareAccountId"
                  ? formatStoredSettingStatus(state.webTools[key], getCloudflareAccountIdEnvValue())
                  : key === "cloudflareApiToken"
                    ? formatStoredSettingStatus(state.webTools[key], getCloudflareTokenEnvValue())
                    : formatStoredSettingStatus(state.webTools[key], getFirecrawlApiKeyEnvValue()),
            );
            ctx.ui.notify(
              value ? `Saved stored ${item.label}` : `Cleared stored ${item.label}`,
              "info",
            );
            leafDone(
              key === "geminiApiKey"
                ? formatStoredSettingStatus(state.webTools[key], getGeminiEnvValue())
                : key === "cloudflareAccountId"
                  ? formatStoredSettingStatus(state.webTools[key], getCloudflareAccountIdEnvValue())
                  : key === "cloudflareApiToken"
                    ? formatStoredSettingStatus(state.webTools[key], getCloudflareTokenEnvValue())
                    : formatStoredSettingStatus(state.webTools[key], getFirecrawlApiKeyEnvValue()),
            );
          },
          onCancel: () => leafDone(undefined),
        }),
    })),
    10,
    getSettingsListTheme(),
    () => undefined,
    () => done(buildWebToolsSummary(state)),
    { enableSearch: false },
  );

  return {
    render(width: number) {
      return [
        stylers.breadcrumbText("Pi Mode", "Web Tools"),
        "",
        ...renderSettingsListWithFooter(settingsList, width, stylers.mutedText),
      ];
    },
    invalidate() {
      settingsList.invalidate();
    },
    handleInput(data: string) {
      settingsList.handleInput(data);
    },
  };
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

  if (parts[0] === "load-skills") {
    if (parts.length === 1) return { action: "open-load-skills" };
    if (parts[1] === "on" || parts[1] === "enabled") {
      return { action: "set-load-skills", value: true };
    }
    if (parts[1] === "off" || parts[1] === "disabled") {
      return { action: "set-load-skills", value: false };
    }
    return { action: "invalid", message: `Unknown load-skills value: ${parts[1]}` };
  }

  if (parts[0] === "include-pi-prompt") {
    return {
      action: "invalid",
      message:
        "Include Pi prompt section has been removed. Prompt selection now follows mode + optional SYSTEM.md.",
    };
  }

  return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
}

export async function openPiModeSettingsUi(
  ctx: ExtensionContext,
  options: OpenSettingsUiOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const currentSettings = await options.readSettings();
  const settings = {
    ...currentSettings,
    webTools: { ...currentSettings.webTools },
  } satisfies PiModeSettings;

  await ctx.ui.custom((_tui, theme, _kb, done) => {
    let showRootHeader = true;

    const items = buildPiModeSettingItems(settings).map((item) =>
      item.id === "webTools"
        ? {
            ...item,
            submenu: (_currentValue: string, done: (selectedValue?: string) => void) => {
              showRootHeader = false;
              return createWebToolsSubmenu(
                ctx,
                options,
                settings,
                {
                  dimText: (text) => theme.fg("dim", text),
                  mutedText: (text) => theme.fg("muted", text),
                  breadcrumbText: (parent, current) =>
                    `${theme.fg("muted", parent)} ${theme.fg("muted", ">")} ${theme.fg("accent", theme.bold(current))}`,
                },
                (selectedValue) => {
                  showRootHeader = true;
                  done(selectedValue);
                },
              );
            },
          }
        : item,
    );

    const settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 12),
      getSettingsListTheme(),
      async (id, newValue) => {
        if (id === "toolSet") {
          const nextValue = TOOL_SET_LABELS[newValue as keyof typeof TOOL_SET_LABELS];
          if (nextValue === undefined) return;

          await options.applyToolSetTransition(ctx, nextValue);
          settings.toolSet = nextValue;
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
          settings.systemMdPrompt = nextValue;
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatSystemMdPromptLabel(nextValue),
          };
          ctx.ui.notify(`Inject SYSTEM.md: ${formatSystemMdPromptLabel(nextValue)}`, "info");
          return;
        }

        if (id === "loadSkills") {
          const nextValue = LOAD_SKILLS_LABELS[newValue as keyof typeof LOAD_SKILLS_LABELS];
          if (nextValue === undefined) return;

          await options.writeLoadSkills(nextValue);
          settings.loadSkills = nextValue;
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: formatLoadSkillsLabel(nextValue),
          };
          ctx.ui.notify(`Load Skills: ${formatLoadSkillsLabel(nextValue)}`, "info");
          return;
        }

        if (id === "webTools") {
          const itemIndex = items.findIndex((item) => item.id === id);
          items[itemIndex] = {
            ...items[itemIndex],
            currentValue: newValue,
          };
        }
      },
      () => done(undefined),
      {
        enableSearch: false,
      },
    );

    return {
      render: (width) => {
        const lines = renderSettingsListWithFooter(settingsList, width, (text) =>
          theme.fg("muted", text),
        );

        if (!showRootHeader) {
          return lines;
        }

        return [theme.fg("accent", theme.bold("Pi Mode")), "", ...lines];
      },
      invalidate: () => settingsList.invalidate(),
      handleInput: (data) => settingsList.handleInput?.(data),
    };
  });
}
