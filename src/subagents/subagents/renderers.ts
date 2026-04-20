import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Box, Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";

import type { AgentSnapshot, PublicAgentSnapshot } from "./types.ts";

type RenderableAgentSnapshot = AgentSnapshot | PublicAgentSnapshot;

import {
  expandHintLine,
  titleLine,
  toolCallLine,
} from "../../shared/renderers/common.ts";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import {
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  LEGACY_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  parseSubagentNotificationMessage,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
} from "./notifications.ts";
import {
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  MAX_TASK_REPLY_PREVIEW_LINES,
  summarizeSubagentReply,
  truncateSubagentReply,
} from "./rendering.ts";

export function extractSnapshotDetails(
  details: { status?: RenderableAgentSnapshot } | RenderableAgentSnapshot | undefined,
): RenderableAgentSnapshot | undefined {
  if (!details) return undefined;
  if ("agent_id" in details) return details;
  if ("name" in details) return details;
  if (details.status && typeof details.status === "object" && "agent_id" in details.status) {
    return details.status;
  }
  if (details.status && typeof details.status === "object" && "name" in details.status) {
    return details.status;
  }
  return undefined;
}

export function buildTaskTitle(
  theme: ExtensionContext["ui"]["theme"],
  title: string,
  summary: string,
): string {
  return toolCallLine(theme, title, theme.fg("accent", summary));
}

export function renderTaskCallText(
  theme: ExtensionContext["ui"]["theme"],
  summary: string,
  title = "Task",
): Text {
  return new Text(buildTaskTitle(theme, title, summary), 0, 0);
}

export function normalizeTaskOutput(output: string | undefined): string {
  return output?.replace(/\r\n/g, "\n").trim() ?? "";
}

export function previewTaskText(output: string | undefined, maxLines: number): {
  visibleLines: string[];
  hiddenLineCount: number;
} {
  const normalized = normalizeTaskOutput(output);
  if (!normalized) {
    return { visibleLines: [], hiddenLineCount: 0 };
  }

  const lines = normalized.split("\n");
  return {
    visibleLines: lines.slice(0, maxLines),
    hiddenLineCount: Math.max(0, lines.length - maxLines),
  };
}

export function taskNotificationTitle(status: AgentSnapshot["status"]): string {
  switch (status) {
    case "running":
      return "Task update";
    case "failed":
      return "Task failed";
    case "timeout":
      return "Task timed out";
    case "closed":
      return "Task stopped";
    case "detached":
      return "Task detached";
    default:
      return "Task completed";
  }
}

export function renderTaskOutput(
  output: string | undefined,
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
): Text | Markdown {
  const normalized = normalizeTaskOutput(output);
  if (!normalized) {
    return new Text(theme.fg("muted", "No output"), 0, 0);
  }

  if (expanded) {
    return new Markdown(normalized, 0, 0, getMarkdownTheme());
  }

  const preview = truncateSubagentReply(normalized, MAX_TASK_REPLY_PREVIEW_LINES);
  const lines = preview.text
    .split("\n")
    .map((line) => (line.length > 0 ? theme.fg("toolOutput", line) : ""));

  if (preview.hiddenLineCount > 0) {
    lines.push(expandHintLine(theme, preview.hiddenLineCount, "row"));
  }

  return new Text(lines.join("\n"), 0, 0);
}

export function renderTaskNotificationResult(
  summary: string,
  status: AgentSnapshot["status"],
  output: string | undefined,
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
): Container {
  const container = new Container();
  container.addChild(new Spacer(1));

  const bgFn =
    status === "failed" || status === "closed"
      ? (text: string) => theme.bg("toolErrorBg", text)
      : status === "running" || status === "timeout"
        ? (text: string) => theme.bg("toolPendingBg", text)
        : (text: string) => theme.bg("toolSuccessBg", text);

  const box = new Box(1, 1, bgFn);
  box.addChild(renderTaskCallText(theme, summary, taskNotificationTitle(status)));
  box.addChild(new Spacer(1));
  box.addChild(renderTaskOutput(output, expanded, theme));
  container.addChild(box);
  return container;
}

export function renderAgentCompletionResult(
  details: {
    agents?: RenderableAgentSnapshot[];
    timed_out?: boolean;
  },
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
  options: { showTitle?: boolean } = {},
) {
  const agentsList = details.agents ?? [];
  const hasRunningUpdate = agentsList.some((agent) => agent.status === "running" && Boolean(agent.update_message));
  const title =
    details.timed_out && agentsList.length === 0
      ? "Timed out"
      : hasRunningUpdate
        ? agentsList.length === 1
          ? "Agent update"
          : "Agent updates"
        : agentsList.length === 1
          ? "Agent finished"
          : "Agents finished";
  if (agentsList.length === 0) {
    return new Text(titleLine(theme, "dim", title), 0, 0);
  }

  const markdownTheme = getMarkdownTheme();
  const getStatusColor = (status: AgentSnapshot["status"]) =>
    status === "idle"
      ? "success"
      : status === "timeout"
        ? "warning"
        : status === "failed"
          ? "error"
          : status === "closed"
            ? "muted"
            : "accent";

  const container = new Container();
  if (options.showTitle !== false) {
    container.addChild(new Text(titleLine(theme, "text", title), 0, 0));
  }

  for (const [index, agent] of agentsList.entries()) {
    if (index > 0) container.addChild(new Spacer(1));

    const displayName = getSubagentDisplayName(agent);
    const statusColor = getStatusColor(agent.status);
    const summary =
      (agent.status === "running"
        ? agent.update_message ?? agent.ping_message ?? agent.last_error
        : agent.ping_message ?? agent.last_error) ??
      summarizeSubagentReply(agent.last_assistant_text, expanded ? 600 : 220);
    const statusLabel = agent.status === "running" && agent.update_message
      ? "update"
      : getSubagentCompletionLabel(agent.status);
    let detail = `${theme.fg("accent", displayName)}${theme.fg("muted", ": ")}${theme.fg(statusColor, statusLabel)}`;
    if (summary) {
      detail += `${theme.fg("muted", " - ")}${theme.fg("toolOutput", summary)}`;
    }
    container.addChild(
      new Text(detail, 0, 0),
    );

    const reply = agent.last_assistant_text?.trim();
    if (expanded && reply) {
      const preview = truncateSubagentReply(reply, MAX_SUBAGENT_REPLY_PREVIEW_LINES);
      if (preview.text) {
        container.addChild(new Spacer(1));
        container.addChild(new Markdown(preview.text, 0, 0, markdownTheme));
      }
      if (preview.hiddenLineCount > 0) {
        container.addChild(new Text(expandHintLine(theme, preview.hiddenLineCount, "row"), 0, 0));
      }
    }
  }

  if (!expanded && agentsList.some((agent) => Boolean(agent.last_assistant_text?.trim()))) {
    const hiddenReplyRows = agentsList.reduce((total, agent) => {
      const reply = agent.last_assistant_text?.trim();
      if (!reply) return total;

      const preview = truncateSubagentReply(reply, MAX_SUBAGENT_REPLY_PREVIEW_LINES);
      if (!preview.text) return total;

      return total + preview.text.split("\n").length + (preview.hiddenLineCount > 0 ? 1 : 0);
    }, 0);
    container.addChild(new Spacer(1));
    container.addChild(new Text(expandHintLine(theme, hiddenReplyRows, "row"), 0, 0));
  }

  return container;
}

function resolvePreferredWaitAgentOutput(agent: RenderableAgentSnapshot): string | undefined {
  if (agent.status === "running") {
    return agent.update_message ?? agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
  }

  return agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
}

export function renderWaitAgentResult(
  details: {
    agents?: RenderableAgentSnapshot[];
    timed_out?: boolean;
  },
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
): Text {
  const agentsList = details.agents ?? [];
  if (details.timed_out && agentsList.length === 0) {
    return new Text(theme.fg("muted", "Timed out"), 0, 0);
  }

  const lines: string[] = [];
  for (const [index, agent] of agentsList.entries()) {
    if (index > 0) {
      lines.push("");
    }

    lines.push(theme.fg("text", getSubagentDisplayName(agent)));

    const output = normalizeTaskOutput(resolvePreferredWaitAgentOutput(agent));
    if (!output) {
      continue;
    }

    lines.push(...output.split("\n").map((line) => theme.fg("muted", line)));
  }

  if (expanded || lines.length <= MAX_TASK_REPLY_PREVIEW_LINES) {
    return new Text(lines.join("\n"), 0, 0);
  }

  const visibleLines = lines.slice(0, MAX_TASK_REPLY_PREVIEW_LINES);
  visibleLines.push(expandHintLine(theme, lines.length - MAX_TASK_REPLY_PREVIEW_LINES, "row"));
  return new Text(visibleLines.join("\n"), 0, 0);
}

export function registerSubagentNotificationRenderers(pi: Pick<ExtensionAPI, "registerMessageRenderer">) {
  const renderNotification = (message: { content?: unknown; details?: unknown }, expanded: boolean, theme: ExtensionContext["ui"]["theme"]) => {
    const messageContent = typeof message.content === "string" ? message.content : undefined;
    const parsed = parseSubagentNotificationMessage(messageContent);
    const details = message.details as
      | (RenderableAgentSnapshot & { task_summary?: string; ping_message?: string; update_message?: string })
      | { status?: RenderableAgentSnapshot; task_summary?: string; ping_message?: string; update_message?: string }
      | undefined;
    const snapshot = extractSnapshotDetails(details) ?? parsed;
    if (!snapshot) {
      return new Text(messageContent ?? "", 0, 0);
    }

    const taskSummary =
      typeof details?.task_summary === "string" ? details.task_summary : parsed?.task_summary;
    if (taskSummary) {
      return renderTaskNotificationResult(
        taskSummary,
        snapshot.status,
        snapshot.update_message ?? snapshot.ping_message ?? snapshot.last_assistant_text ?? snapshot.last_error,
        expanded,
        theme,
      );
    }

    const displayName = getSubagentDisplayName(snapshot);
    const statusColor =
      snapshot.update_message
        ? "accent"
        : snapshot.status === "idle"
          ? "success"
          : snapshot.status === "failed"
            ? "error"
            : snapshot.status === "timeout"
              ? "warning"
              : snapshot.status === "running"
                ? "accent"
                : "muted";
    const summary =
      snapshot.update_message ??
      snapshot.ping_message ??
      snapshot.last_error ??
      summarizeSubagentReply(
        snapshot.last_assistant_text,
        expanded ? 600 : MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
      );
    const statusLabel = snapshot.update_message
      ? "update"
      : snapshot.ping_message
        ? "needs help"
        : getSubagentCompletionLabel(snapshot.status);
    let detail = `${theme.fg("accent", displayName)}${theme.fg("muted", ": ")}${theme.fg(statusColor, statusLabel)}`;
    if (summary) {
      detail += `\n${theme.fg("muted", " - ")}${theme.fg("toolOutput", summary)}`;
    }

    const container = new Container();
    container.addChild(new Spacer(1));

    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(
      new Text(
        `${theme.bold(theme.fg("toolTitle", "Agent"))} ` +
          detail,
        0,
        0,
      ),
    );
    container.addChild(box);
    return container;
  };

  pi.registerMessageRenderer<AgentSnapshot>(
    SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
    (message, { expanded }, theme) => renderNotification(message, expanded, theme),
  );
  pi.registerMessageRenderer<AgentSnapshot>(
    LEGACY_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
    (message, { expanded }, theme) => renderNotification(message, expanded, theme),
  );
  void CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE;
}
