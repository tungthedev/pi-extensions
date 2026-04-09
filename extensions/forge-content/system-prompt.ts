import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import fs from "node:fs";

import { readTungthedevSettings, type TungthedevSettings } from "../settings/config.ts";
import { resolveSessionToolSet } from "../settings/session.ts";
import { resolveRegisteredToolInfos, resolveToolsetEntries } from "../shared/toolset-resolver.ts";
import { isSystemMdPromptEnabled } from "../system-md/state.ts";

const FORGE_SYSTEM_PROMPT_PATH = new URL("./assets/forge-system.md", import.meta.url);

export type ForgePromptOptions = {
  baseSystemPrompt?: string;
  cwd: string;
  activeTools: Array<{ name: string; description: string }>;
  shell?: string;
  homeDir?: string;
  currentDate?: string;
};

export type ForgeSystemPromptDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  buildPromptForContext: (pi: ExtensionAPI, ctx: ExtensionContext) => string;
};

function createDefaultDeps(): ForgeSystemPromptDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    buildPromptForContext: (pi, ctx) => buildSelectedForgePrompt(pi, ctx),
  };
}

export function readForgeSystemPrompt(assetPath: string | URL = FORGE_SYSTEM_PROMPT_PATH): string {
  return fs.readFileSync(assetPath, "utf-8").trim();
}

const FORGE_TOOL_PLACEHOLDERS = {
  todos_write: {
    toolName: "todos_write",
    fallback: "your task-planning tool",
  },
  shell: {
    toolName: "shell",
    fallback: "your shell tool",
  },
  patch: {
    toolName: "patch",
    fallback: "your patch tool",
  },
  fs_search: {
    toolName: "fs_search",
    fallback: "your file-search tool",
  },
  WebSummary: {
    toolName: "WebSummary",
    fallback: "an optional web summarization tool",
  },
} as const;

function resolveForgeToolPlaceholder(
  placeholder: keyof typeof FORGE_TOOL_PLACEHOLDERS,
  activeToolNames: Set<string>,
): string {
  const definition = FORGE_TOOL_PLACEHOLDERS[placeholder];
  return activeToolNames.has(definition.toolName) ? definition.toolName : definition.fallback;
}

export function renderForgePromptTemplate(
  template: string,
  options: Pick<ForgePromptOptions, "activeTools">,
): string {
  const activeToolNames = new Set(options.activeTools.map((tool) => tool.name));

  return template
    .replaceAll("{{tool_names.todos_write}}", resolveForgeToolPlaceholder("todos_write", activeToolNames))
    .replaceAll("{{tool_names.shell}}", resolveForgeToolPlaceholder("shell", activeToolNames))
    .replaceAll("{{tool_names.patch}}", resolveForgeToolPlaceholder("patch", activeToolNames))
    .replaceAll("{{tool_names.fs_search}}", resolveForgeToolPlaceholder("fs_search", activeToolNames))
    .replaceAll("{{tool_names.WebSummary}}", resolveForgeToolPlaceholder("WebSummary", activeToolNames))
    .trim();
}

export function buildForgePrompt(options: ForgePromptOptions): string {
  const sections = [
    options.baseSystemPrompt?.trim(),
    renderForgePromptTemplate(readForgeSystemPrompt(), options),
  ];

  return sections
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
}

export function resolveForgeToolInfos(pi: Pick<ExtensionAPI, "getAllTools">): Array<{
  name: string;
  description: string;
}> {
  return resolveToolsetEntries("forge", resolveRegisteredToolInfos(pi.getAllTools()));
}

export function buildSelectedForgePrompt(pi: ExtensionAPI, ctx: ExtensionContext): string {
  return buildForgePrompt({
    cwd: ctx.cwd,
    activeTools: resolveForgeToolInfos(pi),
    shell: process.env.SHELL,
    homeDir: process.env.HOME,
  });
}

export function injectForgePrompt(_systemPrompt: string | undefined, forgePrompt: string): string {
  return forgePrompt.trim();
}

export async function handleForgeSystemPromptBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  deps: ForgeSystemPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  if (isSystemMdPromptEnabled() && settings.systemMdPrompt) {
    return undefined;
  }

  if ((await resolveSessionToolSet(ctx.sessionManager)) !== "forge") {
    return undefined;
  }

  return {
    systemPrompt: injectForgePrompt(event.systemPrompt, deps.buildPromptForContext(pi, ctx)),
  };
}

export function registerForgeSystemPrompt(
  pi: ExtensionAPI,
  deps: ForgeSystemPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleForgeSystemPromptBeforeAgentStart(event, ctx, pi, deps),
  );
}
