import fs from "node:fs";

import type { DurableChildRecord } from "./types.ts";

type SessionFileEntry = {
  type?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
};

function readSessionFileEntries(sessionFile: string): SessionFileEntry[] {
  return fs
    .readFileSync(sessionFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SessionFileEntry];
      } catch {
        return [];
      }
    });
}

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
  if (
    record.transport !== "rpc" ||
    record.status === "closed" ||
    typeof record.sessionFile !== "string"
  ) {
    return false;
  }

  try {
    const stats = fs.statSync(record.sessionFile);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

export function extractLastAssistantTextFromSessionFile(sessionFile: string): string | undefined {
  const entries = readSessionFileEntries(sessionFile);

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;

    const content = entry.message.content;
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
