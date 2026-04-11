import type { AgentSnapshot, PublicAgentSnapshot } from "./types.ts";

export const MAX_SUBAGENT_REPLY_PREVIEW_LINES = 50;
export const MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS = 220;
export const MAX_TASK_REPLY_PREVIEW_LINES = 10;
export const MAX_TASK_SUMMARY_CHARS = 100;

export function getSubagentDisplayName(
  snapshot: Pick<AgentSnapshot, "agent_type" | "name"> & { agent_id?: string } &
    Partial<Pick<PublicAgentSnapshot, "name" | "agent_type">>,
): string {
  const name = snapshot.name?.trim();
  const agentType = snapshot.agent_type?.trim();
  if (name && agentType) return `${name} [${agentType}]`;
  if (name) return name;
  if (agentType) return `[${agentType}]`;
  return snapshot.agent_id ?? "agent";
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

export function summarizeTaskRequest(
  description: string | undefined,
  prompt: string | undefined,
  maxChars = MAX_TASK_SUMMARY_CHARS,
): string {
  const normalized = (description?.trim() || prompt)
    ?.replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "task";
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
