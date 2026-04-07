import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SETTINGS_FILE = "settings.json";
const PI_MODE_NAMESPACE = "pi-mode";
const LEGACY_TUNGTHEDEV_NAMESPACE = "tungthedev/pi";

export type ToolSetPack = "pi" | "codex" | "forge";
export type ToolSetChangedPayload = {
  toolSet: ToolSetPack;
};

export const DEFAULT_TOOL_SET: ToolSetPack = "pi";
export const DEFAULT_CUSTOM_SHELL_TOOL = true;
export const DEFAULT_SYSTEM_MD_PROMPT = false;
export const TOOL_SET_CHANGED_EVENT = "settings:tool-set-changed";

export type TungthedevSettings = {
  toolSet: ToolSetPack;
  customShellTool: boolean;
  systemMdPrompt: boolean;
};

type SettingsRoot = Record<string, unknown>;

export function getGlobalPiSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, SETTINGS_FILE);
}

function normalizeToolSet(value: unknown): ToolSetPack {
  if (value === "pi" || value === "codex" || value === "forge") {
    return value;
  }

  return DEFAULT_TOOL_SET;
}

function normalizeCustomShellTool(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_CUSTOM_SHELL_TOOL;
}

function normalizeSystemMdPrompt(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_SYSTEM_MD_PROMPT;
}

export function formatToolSetLabel(value: ToolSetPack): "Pi" | "Codex" | "Forge" {
  if (value === "forge") return "Forge";
  if (value === "codex") return "Codex";
  return "Pi";
}

export function parseTungthedevSettings(root: unknown): TungthedevSettings {
  const namespaceRoot =
    root && typeof root === "object" && !Array.isArray(root) ? (root as SettingsRoot) : undefined;
  const namespace = namespaceRoot?.[PI_MODE_NAMESPACE] ?? namespaceRoot?.[LEGACY_TUNGTHEDEV_NAMESPACE];

  const toolSet =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).toolSet
      : undefined;
  const customShellTool =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).customShellTool
      : undefined;
  const systemMdPrompt =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).systemMdPrompt
      : undefined;

  return {
    toolSet: normalizeToolSet(toolSet),
    customShellTool: normalizeCustomShellTool(customShellTool),
    systemMdPrompt: normalizeSystemMdPrompt(systemMdPrompt),
  };
}

async function readSettingsRoot(filePath: string, strict = false): Promise<SettingsRoot> {
  try {
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (strict) {
        throw new Error(`Invalid settings format in ${filePath}: expected object`);
      }
      return {};
    }

    return parsed as SettingsRoot;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    if (strict) throw error;
    return {};
  }
}

async function writeSettingsRoot(filePath: string, root: SettingsRoot): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(root, null, 2)}\n`;

  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, filePath);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

export async function readTungthedevSettingsFromFile(
  filePath: string,
): Promise<TungthedevSettings> {
  return parseTungthedevSettings(await readSettingsRoot(filePath));
}

export async function readTungthedevSettings(
  filePath = getGlobalPiSettingsPath(),
): Promise<TungthedevSettings> {
  return readTungthedevSettingsFromFile(filePath);
}

async function writeTungthedevSettings(
  updater: (namespace: SettingsRoot) => SettingsRoot,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  const root = await readSettingsRoot(filePath, true);
  const currentNamespace = root[PI_MODE_NAMESPACE] ?? root[LEGACY_TUNGTHEDEV_NAMESPACE];
  const namespace =
    currentNamespace && typeof currentNamespace === "object" && !Array.isArray(currentNamespace)
      ? { ...(currentNamespace as SettingsRoot) }
      : {};

  delete namespace.skillListInjection;
  delete namespace.systemPrompt;
  delete root[LEGACY_TUNGTHEDEV_NAMESPACE];
  root[PI_MODE_NAMESPACE] = updater(namespace);

  await writeSettingsRoot(filePath, root);
}

export async function writeToolSetSetting(
  toolSet: ToolSetPack,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeTungthedevSettings(
    (namespace) => ({
      ...namespace,
      toolSet,
    }),
    filePath,
  );
}

export async function writeCustomShellToolSetting(
  customShellTool: boolean,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeTungthedevSettings(
    (namespace) => ({
      ...namespace,
      customShellTool,
    }),
    filePath,
  );
}

export async function writeSystemMdPromptSetting(
  systemMdPrompt: boolean,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  await writeTungthedevSettings(
    (namespace) => ({
      ...namespace,
      systemMdPrompt,
    }),
    filePath,
  );
}
