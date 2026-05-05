import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mutateJsonObjectFile, readJsonObjectFile } from "../shared/json-settings.ts";

const SETTINGS_FILE = "settings.json";
const PI_MODE_NAMESPACE = "pi-mode";

export type ToolSetPack = "pi" | "codex" | "droid";
export type ToolSetChangedPayload = {
  toolSet: ToolSetPack;
};

export type LoadSkillsChangedPayload = {
  loadSkills: boolean;
};

export const DEFAULT_TOOL_SET: ToolSetPack = "pi";
export const DEFAULT_LOAD_SKILLS = true;
export const DEFAULT_SYSTEM_MD_PROMPT = false;
export const DEFAULT_MODE_SHORTCUT = "ctrl+alt+m";
export const TOOL_SET_CHANGED_EVENT = "settings:tool-set-changed";
export const LOAD_SKILLS_CHANGED_EVENT = "settings:load-skills-changed";

export type WebToolSettings = {
  geminiApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  firecrawlApiKey?: string;
};

export type WebToolSettingKey = keyof WebToolSettings;

export type PiModeSettings = {
  toolSet: ToolSetPack;
  loadSkills: boolean;
  systemMdPrompt: boolean;
  modeShortcut?: string;
  webTools: WebToolSettings;
};

type SettingsRoot = Record<string, unknown>;

export function getGlobalPiSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, SETTINGS_FILE);
}

function normalizeToolSet(value: unknown): ToolSetPack {
  if (value === "pi" || value === "codex" || value === "droid") {
    return value;
  }

  return DEFAULT_TOOL_SET;
}

function normalizeLoadSkills(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_LOAD_SKILLS;
}

function normalizeSystemMdPrompt(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_SYSTEM_MD_PROMPT;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeModeShortcut(value: unknown): string {
  return normalizeOptionalString(value) ?? DEFAULT_MODE_SHORTCUT;
}

function normalizeWebToolSettings(value: unknown): WebToolSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const webTools = value as SettingsRoot;
  const normalized: WebToolSettings = {};
  const geminiApiKey = normalizeOptionalString(webTools.geminiApiKey);
  const cloudflareAccountId = normalizeOptionalString(webTools.cloudflareAccountId);
  const cloudflareApiToken = normalizeOptionalString(webTools.cloudflareApiToken);
  const firecrawlApiKey = normalizeOptionalString(webTools.firecrawlApiKey);

  if (geminiApiKey) normalized.geminiApiKey = geminiApiKey;
  if (cloudflareAccountId) normalized.cloudflareAccountId = cloudflareAccountId;
  if (cloudflareApiToken) normalized.cloudflareApiToken = cloudflareApiToken;
  if (firecrawlApiKey) normalized.firecrawlApiKey = firecrawlApiKey;

  return normalized;
}

function readSettingsRootSync(filePath: string, options: { strict?: boolean } = {}): SettingsRoot {
  try {
    const raw = readFileSync(filePath, "utf8");
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (options.strict) {
        throw new Error(`Invalid settings format in ${filePath}: expected object`);
      }
      return {};
    }

    return parsed as SettingsRoot;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    if (options.strict) throw error;
    return {};
  }
}

export function formatToolSetLabel(value: ToolSetPack): "Pi" | "Codex" | "Droid" {
  if (value === "codex") return "Codex";
  if (value === "droid") return "Droid";
  return "Pi";
}

export function parsePiModeSettings(root: unknown): PiModeSettings {
  const namespaceRoot =
    root && typeof root === "object" && !Array.isArray(root) ? (root as SettingsRoot) : undefined;
  const namespace = namespaceRoot?.[PI_MODE_NAMESPACE];

  const toolSet =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).toolSet
      : undefined;
  const loadSkills =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).loadSkills
      : undefined;
  const systemMdPrompt =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).systemMdPrompt
      : undefined;
  const webTools =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).webTools
      : undefined;
  const modeShortcut =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).modeShortcut
      : undefined;

  return {
    toolSet: normalizeToolSet(toolSet),
    loadSkills: normalizeLoadSkills(loadSkills),
    systemMdPrompt: normalizeSystemMdPrompt(systemMdPrompt),
    modeShortcut: normalizeModeShortcut(modeShortcut),
    webTools: normalizeWebToolSettings(webTools),
  };
}

export async function readPiModeSettingsFromFile(filePath: string): Promise<PiModeSettings> {
  return parsePiModeSettings(await readJsonObjectFile(filePath));
}

export async function readPiModeSettings(
  filePath = getGlobalPiSettingsPath(),
): Promise<PiModeSettings> {
  return readPiModeSettingsFromFile(filePath);
}

export function readPiModeSettingsSync(filePath = getGlobalPiSettingsPath()): PiModeSettings {
  return parsePiModeSettings(readSettingsRootSync(filePath));
}

export async function readSettingsFromFile(filePath: string): Promise<PiModeSettings> {
  return readPiModeSettingsFromFile(filePath);
}

export async function readSettings(filePath = getGlobalPiSettingsPath()): Promise<PiModeSettings> {
  return readPiModeSettings(filePath);
}

async function writeSettings(
  updater: (namespace: SettingsRoot) => SettingsRoot,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await mutateJsonObjectFile(
    filePath,
    (root) => {
      const nextRoot = root as SettingsRoot;
      const currentNamespace = nextRoot[PI_MODE_NAMESPACE];
      const namespace =
        currentNamespace && typeof currentNamespace === "object" && !Array.isArray(currentNamespace)
          ? { ...(currentNamespace as SettingsRoot) }
          : {};

      delete namespace.skillListInjection;
      delete namespace.systemPrompt;
      nextRoot[PI_MODE_NAMESPACE] = updater(namespace);

      return nextRoot;
    },
    { strict: true },
  );
}

export async function writeToolSetSetting(
  toolSet: ToolSetPack,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeSettings(
    (namespace) => ({
      ...namespace,
      toolSet,
    }),
    filePath,
  );
}

export async function writeSystemMdPromptSetting(
  systemMdPrompt: boolean,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeSettings(
    (namespace) => ({
      ...namespace,
      systemMdPrompt,
    }),
    filePath,
  );
}

export async function writeLoadSkillsSetting(
  loadSkills: boolean,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeSettings(
    (namespace) => ({
      ...namespace,
      loadSkills,
    }),
    filePath,
  );
}

export async function writeModeShortcutSetting(
  modeShortcut: string | undefined,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeSettings(
    (namespace) => ({
      ...namespace,
      modeShortcut: normalizeModeShortcut(modeShortcut),
    }),
    filePath,
  );
}

export async function writeWebToolSetting(
  key: WebToolSettingKey,
  value: string | undefined,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  const normalizedValue = normalizeOptionalString(value);

  await writeSettings((namespace) => {
    const current = normalizeWebToolSettings(namespace.webTools);
    const webTools: SettingsRoot = { ...current };

    if (normalizedValue) {
      webTools[key] = normalizedValue;
    } else {
      delete webTools[key];
    }

    return {
      ...namespace,
      webTools,
    };
  }, filePath);
}
