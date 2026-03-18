import fs from "node:fs";

import type { DurableChildRecord } from "./types.ts";

export function extractLastAssistantText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const role = (message as { role?: unknown }).role;
    if (role !== "assistant") continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    const textBlocks = content
      .filter(
        (item): item is { type: string; text?: string } =>
          Boolean(item) && typeof item === "object",
      )
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "")
      .filter(Boolean);

    if (textBlocks.length > 0) {
      return textBlocks.join("\n").trim();
    }
  }

  return undefined;
}

export function isResumable(record: DurableChildRecord): boolean {
  if (record.status === "closed" || typeof record.sessionFile !== "string") {
    return false;
  }

  try {
    const stats = fs.statSync(record.sessionFile);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}
