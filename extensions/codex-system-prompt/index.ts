/**
 * Injects Codex prompts into Pi sessions.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CODEX_AGENT_PROFILE_JSON_ENV } from "../codex-subagents/subagents/types.ts";

const MODELS_CATALOG_PATH = new URL("./assets/models.json", import.meta.url);
const DEFAULT_GPT_PROMPT_MODEL = "gpt-5.4";
const PERSONALITY_PLACEHOLDER = "{{ personality }}";
const CODEX_HOME_ENV = "CODEX_HOME";
const CODEX_CONFIG_FILE = "config.toml";

type CodexPersonality = "none" | "friendly" | "pragmatic";

type ModelsCatalog = {
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

function readModelsCatalog(assetPath = MODELS_CATALOG_PATH): ModelsCatalog | undefined {
  try {
    return JSON.parse(fs.readFileSync(assetPath, "utf-8")) as ModelsCatalog;
  } catch {
    return undefined;
  }
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

export function parseCodexPersonality(configToml: string | undefined): CodexPersonality | undefined {
  const match = configToml?.match(/^[ \t]*personality[ \t]*=[ \t]*"(none|friendly|pragmatic)"[ \t]*(?:#.*)?$/m);
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
  catalog: ModelsCatalog | undefined,
  personality?: CodexPersonality,
): string {
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) return "";

  const exactEntry = resolvePromptEntry(catalog, normalizedModelId);
  if (exactEntry) {
    return buildModelInstructions(exactEntry, personality);
  }

  if (!normalizedModelId.startsWith("gpt-")) {
    return "";
  }

  return buildModelInstructions(resolvePromptEntry(catalog, DEFAULT_GPT_PROMPT_MODEL), personality);
}

export function injectCodexPrompt(systemPrompt: string | undefined, codexPrompt: string): string {
  const basePrompt = (systemPrompt ?? "").trim();
  if (!codexPrompt) return basePrompt;
  if (basePrompt.includes(codexPrompt)) return basePrompt;
  return [basePrompt, codexPrompt].filter(Boolean).join("\n\n").trim();
}

type AgentProfilePromptPayload = {
  name?: string;
  developerInstructions?: string;
};

export function readAgentProfilePromptPayload(
  env = process.env,
): AgentProfilePromptPayload | undefined {
  const raw = env[CODEX_AGENT_PROFILE_JSON_ENV]?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as AgentProfilePromptPayload;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildAgentProfilePromptBlock(
  payload: AgentProfilePromptPayload | undefined,
): string {
  const developerInstructions = payload?.developerInstructions?.trim();
  if (!developerInstructions) return "";
  return developerInstructions;
}

export function registerCodexPrompt(pi: ExtensionAPI) {
  const modelsCatalog = readModelsCatalog();
  const profilePrompt = buildAgentProfilePromptBlock(readAgentProfilePromptPayload());
  if (!modelsCatalog && !profilePrompt) return;

  pi.on("before_agent_start", async (event, ctx) => {
    const codexPersonality = readCodexPersonality();
    const codexPrompt = buildCodexPrompt(
      resolveCodexPromptBody(ctx.model?.id, modelsCatalog, codexPersonality),
    );
    return {
      systemPrompt: injectCodexPrompt(injectCodexPrompt(event.systemPrompt, codexPrompt), profilePrompt),
    };
  });
}

export default function codexSystemPrompt(pi: ExtensionAPI) {
  registerCodexPrompt(pi);
}
