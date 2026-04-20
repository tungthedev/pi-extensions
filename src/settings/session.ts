import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readPiModeSettings, type ToolSetPack } from "./config.ts";

export const SESSION_TOOL_SET_ENTRY_TYPE = "pi-mode:tool-set";
export const SESSION_LOAD_SKILLS_ENTRY_TYPE = "pi-mode:load-skills";
export const TOOL_SET_OVERRIDE_ENV = "PI_SESSION_TOOL_SET";

export type SessionToolSetPayload = {
  toolSet: ToolSetPack;
};

export type SessionLoadSkillsPayload = {
  loadSkills: boolean;
};

type SessionEntryLike = {
  type?: unknown;
  customType?: unknown;
  data?: unknown;
};

type SessionManagerLike = {
  getBranch?: () => SessionEntryLike[];
};

function readToolSetFromPayload(value: unknown): ToolSetPack | undefined {
  if (!value || typeof value !== "object") return undefined;
  const toolSet = (value as { toolSet?: unknown }).toolSet;
  if (toolSet === "forge") return "pi";
  return toolSet === "pi" || toolSet === "codex" || toolSet === "droid" ? toolSet : undefined;
}

function readLoadSkillsFromPayload(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const loadSkills = (value as { loadSkills?: unknown }).loadSkills;
  return typeof loadSkills === "boolean" ? loadSkills : undefined;
}

export function readSessionToolSet(entries: SessionEntryLike[]): ToolSetPack | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom") continue;
    if (entry.customType !== SESSION_TOOL_SET_ENTRY_TYPE) continue;

    const toolSet = readToolSetFromPayload(entry.data);
    if (toolSet) return toolSet;
  }

  return undefined;
}

export function readSessionLoadSkills(entries: SessionEntryLike[]): boolean | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom") continue;
    if (entry.customType !== SESSION_LOAD_SKILLS_ENTRY_TYPE) continue;

    const loadSkills = readLoadSkillsFromPayload(entry.data);
    if (loadSkills !== undefined) return loadSkills;
  }

  return undefined;
}

export async function resolveSessionToolSet(
  sessionManager: SessionManagerLike,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ToolSetPack> {
  const envToolSet = env[TOOL_SET_OVERRIDE_ENV];
  if (envToolSet === "pi" || envToolSet === "codex" || envToolSet === "droid") {
    return envToolSet;
  }

  const sessionToolSet = typeof sessionManager.getBranch === "function"
    ? readSessionToolSet(sessionManager.getBranch())
    : undefined;
  if (sessionToolSet) return sessionToolSet;

  const settings = await readPiModeSettings();
  return settings.toolSet;
}

export async function resolveSessionLoadSkills(
  sessionManager: SessionManagerLike,
): Promise<boolean> {
  const sessionLoadSkills = typeof sessionManager.getBranch === "function"
    ? readSessionLoadSkills(sessionManager.getBranch())
    : undefined;
  if (sessionLoadSkills !== undefined) return sessionLoadSkills;

  const settings = await readPiModeSettings();
  return settings.loadSkills;
}

export async function ensureSessionToolSetSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  sessionManager: SessionManagerLike,
): Promise<ToolSetPack> {
  const existingToolSet = typeof sessionManager.getBranch === "function"
    ? readSessionToolSet(sessionManager.getBranch())
    : undefined;
  if (existingToolSet) return existingToolSet;

  const settings = await readPiModeSettings();
  pi.appendEntry(SESSION_TOOL_SET_ENTRY_TYPE, {
    toolSet: settings.toolSet,
  } satisfies SessionToolSetPayload);
  return settings.toolSet;
}

export async function ensureSessionLoadSkillsSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  sessionManager: SessionManagerLike,
): Promise<boolean> {
  const existingLoadSkills = typeof sessionManager.getBranch === "function"
    ? readSessionLoadSkills(sessionManager.getBranch())
    : undefined;
  if (existingLoadSkills !== undefined) return existingLoadSkills;

  const settings = await readPiModeSettings();
  pi.appendEntry(SESSION_LOAD_SKILLS_ENTRY_TYPE, {
    loadSkills: settings.loadSkills,
  } satisfies SessionLoadSkillsPayload);
  return settings.loadSkills;
}

export function writeSessionToolSetSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  toolSet: ToolSetPack,
): void {
  pi.appendEntry(SESSION_TOOL_SET_ENTRY_TYPE, {
    toolSet,
  } satisfies SessionToolSetPayload);
}

export function writeSessionLoadSkillsSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  loadSkills: boolean,
): void {
  pi.appendEntry(SESSION_LOAD_SKILLS_ENTRY_TYPE, {
    loadSkills,
  } satisfies SessionLoadSkillsPayload);
}
