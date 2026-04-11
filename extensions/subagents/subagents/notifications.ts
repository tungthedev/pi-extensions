import type { AgentSnapshot, PublicAgentSnapshot } from "./types.ts";
import { toPublicAgentSnapshot } from "./results.ts";

export const SUBAGENT_NOTIFICATION_CUSTOM_TYPE = "subagent-notification";
export const LEGACY_SUBAGENT_NOTIFICATION_CUSTOM_TYPE = "codex-subagent-notification";
export const CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE = LEGACY_SUBAGENT_NOTIFICATION_CUSTOM_TYPE;

export function getSubagentNotificationDeliveryOptions(parentIsStreaming: boolean):
  | { deliverAs: "steer" }
  | { triggerTurn: true } {
  return parentIsStreaming ? { deliverAs: "steer" } : { triggerTurn: true };
}

const SUBAGENT_NOTIFICATION_OPEN_TAG = "<subagent_notification>";
const SUBAGENT_NOTIFICATION_CLOSE_TAG = "</subagent_notification>";

type NotificationPayload = {
  name: string;
  status: AgentSnapshot["status"];
  durable_status: AgentSnapshot["durable_status"];
  last_assistant_text?: string;
  last_error?: string;
  task_summary?: string;
};

export function formatSubagentNotificationMessage(
  snapshot: Pick<
    AgentSnapshot,
    "agent_id" | "status" | "durable_status" | "name" | "last_assistant_text" | "last_error"
  >,
  options: { taskSummary?: string } = {},
): string {
  const publicSnapshot = toPublicAgentSnapshot(snapshot as AgentSnapshot);
  const payload: NotificationPayload = {
    name: publicSnapshot.name,
    status: publicSnapshot.status,
    durable_status: publicSnapshot.durable_status,
    ...(publicSnapshot.last_assistant_text
      ? { last_assistant_text: publicSnapshot.last_assistant_text }
      : {}),
    ...(publicSnapshot.last_error ? { last_error: publicSnapshot.last_error } : {}),
    ...(options.taskSummary ? { task_summary: options.taskSummary } : {}),
  };

  return [
    SUBAGENT_NOTIFICATION_OPEN_TAG,
    JSON.stringify(payload),
    SUBAGENT_NOTIFICATION_CLOSE_TAG,
  ].join("\n");
}

export function parseSubagentNotificationMessage(
  content: string | undefined,
): (PublicAgentSnapshot & { task_summary?: string }) | undefined {
  const trimmed = content?.trim();
  if (!trimmed) return undefined;

  const prefix = `${SUBAGENT_NOTIFICATION_OPEN_TAG}\n`;
  const suffix = `\n${SUBAGENT_NOTIFICATION_CLOSE_TAG}`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(suffix)) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.slice(prefix.length, trimmed.length - suffix.length)) as PublicAgentSnapshot & {
      task_summary?: string;
    };
  } catch {
    return undefined;
  }
}

export function buildWaitAgentContent(snapshots: PublicAgentSnapshot[], timedOut: boolean): string {
  return JSON.stringify({
    status: Object.fromEntries(snapshots.map((snapshot) => [snapshot.name, snapshot.status])),
    timed_out: timedOut,
    agents: snapshots,
  });
}
