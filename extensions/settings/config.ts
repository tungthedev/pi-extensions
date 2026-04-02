import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SETTINGS_FILE = "settings.json";
const TUNGTHEDEV_NAMESPACE = "tungthedev/pi";

export type SystemPromptPack = "codex" | "forge" | null;

export type TungthedevSettings = {
  systemPrompt: SystemPromptPack;
};

type SettingsRoot = Record<string, unknown>;

export function getGlobalPiSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, SETTINGS_FILE);
}

function normalizeSystemPrompt(value: unknown): SystemPromptPack {
  return value === "codex" || value === "forge" || value === null ? value : null;
}

export function parseTungthedevSettings(root: unknown): TungthedevSettings {
  const namespace =
    root && typeof root === "object" && !Array.isArray(root)
      ? (root as SettingsRoot)[TUNGTHEDEV_NAMESPACE]
      : undefined;

  const systemPrompt =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as SettingsRoot).systemPrompt
      : undefined;

  return {
    systemPrompt: normalizeSystemPrompt(systemPrompt),
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

export async function readTungthedevSettingsFromFile(filePath: string): Promise<TungthedevSettings> {
  return parseTungthedevSettings(await readSettingsRoot(filePath));
}

export async function readTungthedevSettings(filePath = getGlobalPiSettingsPath()): Promise<TungthedevSettings> {
  return readTungthedevSettingsFromFile(filePath);
}

export async function writeSystemPromptSetting(
  systemPrompt: SystemPromptPack,
  filePath = getGlobalPiSettingsPath(),
): Promise<void> {
  const root = await readSettingsRoot(filePath, true);
  const currentNamespace = root[TUNGTHEDEV_NAMESPACE];
  const namespace =
    currentNamespace && typeof currentNamespace === "object" && !Array.isArray(currentNamespace)
      ? { ...(currentNamespace as SettingsRoot) }
      : {};

  namespace.systemPrompt = systemPrompt;
  root[TUNGTHEDEV_NAMESPACE] = namespace;

  await writeSettingsRoot(filePath, root);
}
