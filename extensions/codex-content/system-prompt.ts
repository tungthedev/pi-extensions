import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import fs from "node:fs";

import { readSettings, type PiModeSettings } from "../settings/config.ts";
import { resolveSessionToolSet } from "../settings/session.ts";
import {
  resolveCodexConfigPath,
  resolveCodexHome,
  resolveCodexModelsCachePath,
  resolveConfiguredModelCatalogPath,
} from "../shared/codex-config.ts";
import {
  appendPromptContribution,
  buildPromptResult,
  replacePromptContribution,
  resolvePromptContribution,
} from "../shared/prompt-composition.ts";
import { matchTomlString } from "../shared/toml-lite.ts";
import { resolveSystemMdPromptContribution } from "../system-md/state.ts";

export {
  resolveCodexConfigPath,
  resolveCodexHome,
  resolveCodexModelsCachePath,
  resolveConfiguredModelCatalogPath,
} from "../shared/codex-config.ts";

const BUNDLED_MODELS_CATALOG_PATH = new URL("./assets/codex-models.json", import.meta.url);
const DEFAULT_GPT_PROMPT_MODEL = "gpt-5.4";
const PERSONALITY_PLACEHOLDER = "{{ personality }}";

export type CodexPersonality = "none" | "friendly" | "pragmatic";

export type ModelsCatalog = {
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

export type CodexSystemPromptDeps = {
  readSettings: () => Promise<PiModeSettings>;
  buildPromptForModel: (modelId: string | undefined) => string;
};

function createDefaultDeps(): CodexSystemPromptDeps {
  return {
    readSettings: () => readSettings(),
    buildPromptForModel: (modelId) => buildSelectedCodexPrompt(modelId),
  };
}

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

export function readModelsCatalog(
  assetPath: string | URL = BUNDLED_MODELS_CATALOG_PATH,
): ModelsCatalog | undefined {
  return readModelsCatalogFromPath(assetPath);
}

export function buildCodexPrompt(promptBody: string): string {
  return promptBody.trim();
}

export function readFallbackModelsCatalog(
  env: NodeJS.ProcessEnv = process.env,
  homeDir?: string,
): ModelsCatalog | undefined {
  const configuredPath = resolveConfiguredModelCatalogPath(env);
  const configuredCatalog = readModelsCatalogFromPath(configuredPath);
  if (configuredCatalog) return configuredCatalog;
  return readModelsCatalogFromPath(resolveCodexModelsCachePath(env, homeDir));
}

export function parseCodexPersonality(
  configToml: string | undefined,
): CodexPersonality | undefined {
  const personality = matchTomlString(configToml ?? "", "personality");
  if (personality === "none" || personality === "friendly" || personality === "pragmatic") {
    return personality;
  }
  return undefined;
}

export function readCodexPersonality(
  env: NodeJS.ProcessEnv = process.env,
  homeDir?: string,
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

export function buildSelectedCodexPrompt(modelId: string | undefined): string {
  const bundledCatalog = readModelsCatalog();
  const fallbackCatalog = readFallbackModelsCatalog();
  const personality = readCodexPersonality();
  return buildCodexPrompt(
    resolveCodexPromptBody(modelId, [bundledCatalog, fallbackCatalog], personality),
  );
}

export function injectCodexPrompt(_systemPrompt: string | undefined, codexPrompt: string): string {
  return buildPromptResult(undefined, replacePromptContribution(codexPrompt))?.systemPrompt ?? "";
}

function buildRuntimeMetadata(ctx: Pick<ExtensionContext, "sessionManager">): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Current date: ${today}`,
    `Current working directory: ${ctx.sessionManager.getCwd()}`,
  ].join("\n");
}

export async function handleCodexSystemPromptBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  deps: CodexSystemPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  if ((await resolveSessionToolSet(ctx.sessionManager)) !== "codex") {
    return undefined;
  }

  return buildPromptResult(
    event.systemPrompt,
    resolvePromptContribution([
      resolveSystemMdPromptContribution(ctx.cwd, settings.systemMdPrompt),
      settings.includePiPromptSection
        ? appendPromptContribution(deps.buildPromptForModel(ctx.model?.id))
        : replacePromptContribution(
            `${deps.buildPromptForModel(ctx.model?.id)}\n\n${buildRuntimeMetadata(ctx)}`,
          ),
    ]),
  );
}

export function registerCodexSystemPrompt(
  pi: ExtensionAPI,
  deps: CodexSystemPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleCodexSystemPromptBeforeAgentStart(event, ctx, deps),
  );
}
