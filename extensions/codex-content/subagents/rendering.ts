import type { AgentSnapshot } from "./types.ts";

export const MAX_SUBAGENT_REPLY_PREVIEW_LINES = 50;
export const MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS = 220;

export function getSubagentDisplayName(snapshot: Pick<AgentSnapshot, "agent_id" | "name">): string {
  return snapshot.name?.trim() || snapshot.agent_id;
}

export function truncateSubagentReply(
  text: string | undefined,
  maxLines = MAX_SUBAGENT_REPLY_PREVIEW_LINES,
): { text: string; hiddenLineCount: number } {
  const normalized = text?.replace(/\r\n/g, "\n").trim() ?? "";
  if (!normalized) {
    return { text: "", hiddenLineCount: 0 };
  }

  const lines = normalized.split("\n");
  if (lines.length <= maxLines) {
    return { text: normalized, hiddenLineCount: 0 };
  }

  return {
    text: lines.slice(0, maxLines).join("\n").trimEnd(),
    hiddenLineCount: lines.length - maxLines,
  };
}

export function summarizeSubagentReply(
  text: string | undefined,
  maxChars = MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
): string | undefined {
  const normalized = text
    ?.replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

export function getSubagentCompletionLabel(status: AgentSnapshot["status"]): string {
  switch (status) {
    case "idle":
      return "Completed";
    case "failed":
      return "Error";
    case "timeout":
      return "Timed out";
    case "closed":
      return "Closed";
    case "detached":
      return "Detached";
    case "running":
      return "Running";
  }
}

export function formatSubagentModelLabel(
  model: string | undefined,
  reasoningEffort: string | undefined,
): string | undefined {
  const trimmedModel = model?.trim();
  const trimmedReasoningEffort = reasoningEffort?.trim();
  if (!trimmedModel) {
    return undefined;
  }
  return trimmedReasoningEffort ? `${trimmedModel} ${trimmedReasoningEffort}` : trimmedModel;
}
