import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings, type ToolSetPack } from "./config.ts";

export const SESSION_TOOL_SET_ENTRY_TYPE = "pi-mode:tool-set";

export type SessionToolSetPayload = {
  toolSet: ToolSetPack;
};

type SessionEntryLike = {
  type: string;
  customType?: unknown;
  data?: unknown;
};

type SessionManagerLike = {
  getBranch(): SessionEntryLike[];
};

function readToolSetFromPayload(value: unknown): ToolSetPack | undefined {
  if (!value || typeof value !== "object") return undefined;
  const toolSet = (value as { toolSet?: unknown }).toolSet;
  return toolSet === "pi" || toolSet === "codex" || toolSet === "forge" ? toolSet : undefined;
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

export async function resolveSessionToolSet(
  sessionManager: SessionManagerLike,
): Promise<ToolSetPack> {
  const sessionToolSet = readSessionToolSet(sessionManager.getBranch());
  if (sessionToolSet) return sessionToolSet;

  const settings = await readTungthedevSettings();
  return settings.toolSet;
}

export async function ensureSessionToolSetSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  sessionManager: SessionManagerLike,
): Promise<ToolSetPack> {
  const existingToolSet = readSessionToolSet(sessionManager.getBranch());
  if (existingToolSet) return existingToolSet;

  const settings = await readTungthedevSettings();
  pi.appendEntry(SESSION_TOOL_SET_ENTRY_TYPE, {
    toolSet: settings.toolSet,
  } satisfies SessionToolSetPayload);
  return settings.toolSet;
}

export function writeSessionToolSetSnapshot(
  pi: Pick<ExtensionAPI, "appendEntry">,
  toolSet: ToolSetPack,
): void {
  pi.appendEntry(SESSION_TOOL_SET_ENTRY_TYPE, {
    toolSet,
  } satisfies SessionToolSetPayload);
}
