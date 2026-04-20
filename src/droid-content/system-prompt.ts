import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import fs from "node:fs";

import { readSettings, type PiModeSettings } from "../settings/config.ts";
import { resolveSessionToolSet } from "../settings/session.ts";
import {
  composeCustomPromptWithPiSections,
} from "../shared/custom-prompt.ts";
import { resolveSystemMdPrompt } from "../system-md/state.ts";

const DROID_IDENTITY_PATH = new URL("./assets/identity.txt", import.meta.url);
const DROID_BASE_PATH = new URL("./assets/base.txt", import.meta.url);
const DROID_OPENAI_MARKDOWN_PATH = new URL("./assets/openai-markdown.md", import.meta.url);
const DROID_OPENAI_PERSISTENCE_PATH = new URL(
  "./assets/openai-persistence.md",
  import.meta.url,
);
const DROID_GOOGLE_EXECUTE_RISK_PATH = new URL(
  "./assets/google-execute-risk.txt",
  import.meta.url,
);
const DROID_GOOGLE_SPEC_MODE_PATH = new URL("./assets/google-spec-mode.md", import.meta.url);
const DROID_GOOGLE_TOOL_USAGE_PATH = new URL(
  "./assets/google-tool-usage.md",
  import.meta.url,
);
const DROID_GOOGLE_TODO_GUIDELINES_PATH = new URL(
  "./assets/google-todo-guidelines.md",
  import.meta.url,
);

export type DroidSystemPromptDeps = {
  readSettings: () => Promise<PiModeSettings>;
  buildPromptForModel: (modelId: string | undefined) => string;
};

function createDefaultDeps(): DroidSystemPromptDeps {
  return {
    readSettings: () => readSettings(),
    buildPromptForModel: (modelId) => buildSelectedDroidPrompt(modelId),
  };
}

function readPromptAsset(assetPath: string | URL): string {
  return fs.readFileSync(assetPath, "utf-8").trim();
}

export function readDroidIdentity(): string {
  return readPromptAsset(DROID_IDENTITY_PATH);
}

export function readDroidBasePrompt(): string {
  return readPromptAsset(DROID_BASE_PATH);
}

export function readDroidOpenAiMarkdownPrompt(): string {
  return readPromptAsset(DROID_OPENAI_MARKDOWN_PATH);
}

export function readDroidOpenAiPersistencePrompt(): string {
  return readPromptAsset(DROID_OPENAI_PERSISTENCE_PATH);
}

export function readDroidGoogleExecuteRiskPrompt(): string {
  return readPromptAsset(DROID_GOOGLE_EXECUTE_RISK_PATH);
}

export function readDroidGoogleSpecModePrompt(): string {
  return readPromptAsset(DROID_GOOGLE_SPEC_MODE_PATH);
}

export function readDroidGoogleToolUsagePrompt(): string {
  return readPromptAsset(DROID_GOOGLE_TOOL_USAGE_PATH);
}

export function readDroidGoogleTodoGuidelinesPrompt(): string {
  return readPromptAsset(DROID_GOOGLE_TODO_GUIDELINES_PATH);
}

function isGoogleModel(modelId: string | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase();
  return normalized?.includes("gemini") ?? false;
}

function isOpenAiLikeModel(modelId: string | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase() ?? "";
  return ["gpt", "o1", "o3", "o4", "grok", "codex"].some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function buildSelectedDroidPrompt(modelId: string | undefined): string {
  const sections = [readDroidIdentity(), readDroidBasePrompt()];

  if (isGoogleModel(modelId)) {
    sections.push(
      readDroidGoogleExecuteRiskPrompt(),
      readDroidGoogleToolUsagePrompt(),
      readDroidGoogleSpecModePrompt(),
      readDroidGoogleTodoGuidelinesPrompt(),
    );
  } else if (isOpenAiLikeModel(modelId)) {
    sections.push(readDroidOpenAiMarkdownPrompt(), readDroidOpenAiPersistencePrompt());
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

export function composeDroidPromptWithPiSections(
  basePrompt: string | undefined,
  droidPrompt: string | undefined,
): string | undefined {
  return composeCustomPromptWithPiSections(basePrompt, droidPrompt);
}

export async function handleDroidSystemPromptBeforeAgentStart(
  _event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  deps: DroidSystemPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  if ((await resolveSessionToolSet(ctx.sessionManager)) !== "droid") {
    return undefined;
  }

  if (resolveSystemMdPrompt(ctx.cwd, settings.systemMdPrompt)) {
    return undefined;
  }

  const systemPrompt = composeDroidPromptWithPiSections(
    _event.systemPrompt,
    deps.buildPromptForModel(ctx.model?.id),
  );
  return systemPrompt ? { systemPrompt } : undefined;
}

export function registerDroidSystemPrompt(
  pi: ExtensionAPI,
  deps: DroidSystemPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleDroidSystemPromptBeforeAgentStart(event, ctx, deps),
  );
}
