/**
 * Injects Codex prompts into Pi sessions.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUNDLED_MODELS_CATALOG_PATH = new URL("./assets/models.json", import.meta.url);
const DEFAULT_GPT_PROMPT_MODEL = "gpt-5.4";
const PERSONALITY_PLACEHOLDER = "{{ personality }}";
const CODEX_HOME_ENV = "CODEX_HOME";
const CODEX_CONFIG_FILE = "config.toml";
const CODEX_MODELS_CACHE_FILE = "models_cache.json";
const CODEX_MODEL_CATALOG_PATH_ENV = "PI_CODEX_MODEL_CATALOG_PATH";

type CodexPersonality = "none" | "friendly" | "pragmatic";

type ModelsCatalog = {
  fetched_at?: string;
  etag?: string;
  client_version?: string;
  models?: ModelCatalogEntry[];
};

type ModelCatalogEntry = {
  slug?: string;
  base_instructions?: string;
  model_messages?: {
    instructions_template?: string;
    instructions_variables?: ModelInstructionsVariables;
  } | null;
};

type ModelInstructionsVariables = {
  personality_default?: string;
  personality_friendly?: string;
  personality_pragmatic?: string;
};

function parseModelsCatalog(raw: string): ModelsCatalog | undefined {
  try {
    const parsed = JSON.parse(raw) as ModelsCatalog;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (!Array.isArray(parsed.models)) return undefined;

    const normalizedModels = parsed.models.filter(
      (entry): entry is ModelCatalogEntry => !!entry && typeof entry === "object",
    );

    return {
      fetched_at: typeof parsed.fetched_at === "string" ? parsed.fetched_at : undefined,
      etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
      client_version: typeof parsed.client_version === "string" ? parsed.client_version : undefined,
      models: normalizedModels,
    };
  } catch {
    return undefined;
  }
}

function readModelsCatalogFromPath(filePath: string | URL | undefined): ModelsCatalog | undefined {
  if (!filePath) return undefined;
  try {
    return parseModelsCatalog(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

export function readModelsCatalog(assetPath = BUNDLED_MODELS_CATALOG_PATH): ModelsCatalog | undefined {
  return readModelsCatalogFromPath(assetPath);
}

export function buildCodexPrompt(promptBody: string): string {
  return promptBody.trim();
}

export function resolveCodexHome(env = process.env, homeDir = os.homedir()): string | undefined {
  const configured = env[CODEX_HOME_ENV]?.trim();
  if (configured) {
    try {
      const stats = fs.statSync(configured);
      if (!stats.isDirectory()) return undefined;
      return fs.realpathSync(configured);
    } catch {
      return undefined;
    }
  }

  const normalizedHomeDir = homeDir?.trim();
  if (!normalizedHomeDir) return undefined;
  return path.join(normalizedHomeDir, ".codex");
}

export function resolveCodexConfigPath(
  env = process.env,
  homeDir = os.homedir(),
): string | undefined {
  const codexHome = resolveCodexHome(env, homeDir);
  if (!codexHome) return undefined;
  return path.join(codexHome, CODEX_CONFIG_FILE);
}

export function resolveCodexModelsCachePath(
  env = process.env,
  homeDir = os.homedir(),
): string | undefined {
  const codexHome = resolveCodexHome(env, homeDir);
  if (!codexHome) return undefined;
  return path.join(codexHome, CODEX_MODELS_CACHE_FILE);
}

export function resolveConfiguredModelCatalogPath(env = process.env): string | undefined {
  const configuredPath = env[CODEX_MODEL_CATALOG_PATH_ENV]?.trim();
  if (!configuredPath) return undefined;
  try {
    const stats = fs.statSync(configuredPath);
    if (!stats.isFile()) return undefined;
    return fs.realpathSync(configuredPath);
  } catch {
    return undefined;
  }
}

export function readFallbackModelsCatalog(
  env = process.env,
  homeDir = os.homedir(),
): ModelsCatalog | undefined {
  const configuredPath = resolveConfiguredModelCatalogPath(env);
  const configuredCatalog = readModelsCatalogFromPath(configuredPath);
  if (configuredCatalog) return configuredCatalog;
  return readModelsCatalogFromPath(resolveCodexModelsCachePath(env, homeDir));
}

export function parseCodexPersonality(
  configToml: string | undefined,
): CodexPersonality | undefined {
  const match = configToml?.match(
    /^[ \t]*personality[ \t]*=[ \t]*"(none|friendly|pragmatic)"[ \t]*(?:#.*)?$/m,
  );
  const personality = match?.[1];
  if (personality === "none" || personality === "friendly" || personality === "pragmatic") {
    return personality;
  }
  return undefined;
}

export function readCodexPersonality(
  env = process.env,
  homeDir = os.homedir(),
): CodexPersonality | undefined {
  const configPath = resolveCodexConfigPath(env, homeDir);
  if (!configPath) return undefined;
  try {
    return parseCodexPersonality(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return undefined;
  }
}

function getPersonalityMessage(
  variables: ModelInstructionsVariables | undefined,
  personality: CodexPersonality | undefined,
): string {
  if (personality === "none") return "";
  if (personality === "friendly") return variables?.personality_friendly ?? "";
  if (personality === "pragmatic") return variables?.personality_pragmatic ?? "";
  return variables?.personality_default ?? "";
}

function buildModelInstructions(
  entry: ModelCatalogEntry | undefined,
  personality: CodexPersonality | undefined,
): string {
  const template = entry?.model_messages?.instructions_template?.trim();
  if (template) {
    return template
      .replaceAll(
        PERSONALITY_PLACEHOLDER,
        getPersonalityMessage(entry?.model_messages?.instructions_variables, personality),
      )
      .trim();
  }
  return entry?.base_instructions?.trim() ?? "";
}

function resolvePromptEntry(
  catalog: ModelsCatalog | undefined,
  modelId: string | undefined,
): ModelCatalogEntry | undefined {
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) return undefined;
  return catalog?.models?.find((entry) => entry.slug === normalizedModelId);
}

export function resolveCodexPromptBody(
  modelId: string | undefined,
  catalogs: Array<ModelsCatalog | undefined>,
  personality?: CodexPersonality,
): string {
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) return "";

  for (const catalog of catalogs) {
    const exactEntry = resolvePromptEntry(catalog, normalizedModelId);
    if (exactEntry) {
      return buildModelInstructions(exactEntry, personality);
    }
  }

  for (const catalog of catalogs) {
    const defaultEntry = resolvePromptEntry(catalog, DEFAULT_GPT_PROMPT_MODEL);
    if (defaultEntry) {
      return buildModelInstructions(defaultEntry, personality);
    }
  }

  return "";
}

export function injectCodexPrompt(systemPrompt: string | undefined, codexPrompt: string): string {
  const basePrompt = (systemPrompt ?? "").trim();
  if (!codexPrompt) return basePrompt;
  if (basePrompt.includes(codexPrompt)) return basePrompt;
  return [basePrompt, codexPrompt].filter(Boolean).join("\n\n").trim();
}

export function registerCodexPrompt(pi: ExtensionAPI) {
  const bundledCatalog = readModelsCatalog();
  const fallbackCatalog = readFallbackModelsCatalog();
  if (!bundledCatalog && !fallbackCatalog) return;

  pi.on("before_agent_start", async (event, ctx) => {
    const codexPersonality = readCodexPersonality();
    const codexPrompt = buildCodexPrompt(
      resolveCodexPromptBody(ctx.model?.id, [bundledCatalog, fallbackCatalog], codexPersonality),
    );
    return {
      systemPrompt: injectCodexPrompt(event.systemPrompt, codexPrompt),
    };
  });
}

export default function codexSystemPrompt(pi: ExtensionAPI) {
  registerCodexPrompt(pi);
}
