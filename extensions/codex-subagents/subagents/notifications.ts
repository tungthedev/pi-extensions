import type { AgentSnapshot, DurableChildRecord } from "./types.ts";

export const CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE = "codex-subagent-notification";

export function getSubagentNotificationDeliveryOptions(parentIsStreaming: boolean):
  | { deliverAs: "steer" }
  | { triggerTurn: true } {
  return parentIsStreaming ? { deliverAs: "steer" } : { triggerTurn: true };
}

const SUBAGENT_NOTIFICATION_OPEN_TAG = "<subagent_notification>";
const SUBAGENT_NOTIFICATION_CLOSE_TAG = "</subagent_notification>";

type NotificationPayload = {
  agent_id: string;
  status: AgentSnapshot["status"];
  durable_status: AgentSnapshot["durable_status"];
  completion_version?: number;
  final_result_text?: string;
  name?: string;
  last_assistant_text?: string;
  last_error?: string;
};

export function formatSubagentNotificationMessage(
  snapshot: Pick<
    AgentSnapshot,
    | "agent_id"
    | "status"
    | "durable_status"
    | "completion_version"
    | "final_result_text"
    | "name"
    | "last_assistant_text"
    | "last_error"
  >,
): string {
  const payload: NotificationPayload = {
    agent_id: snapshot.agent_id,
    status: snapshot.status,
    durable_status: snapshot.durable_status,
    ...(snapshot.completion_version != null
      ? { completion_version: snapshot.completion_version }
      : {}),
    ...(snapshot.final_result_text ? { final_result_text: snapshot.final_result_text } : {}),
    ...(snapshot.name ? { name: snapshot.name } : {}),
    ...(snapshot.last_assistant_text ? { last_assistant_text: snapshot.last_assistant_text } : {}),
    ...(snapshot.last_error ? { last_error: snapshot.last_error } : {}),
  };

  return [
    SUBAGENT_NOTIFICATION_OPEN_TAG,
    JSON.stringify(payload),
    SUBAGENT_NOTIFICATION_CLOSE_TAG,
  ].join("\n");
}

export function parseSubagentNotificationMessage(
  content: string | undefined,
): NotificationPayload | undefined {
  const trimmed = content?.trim();
  if (!trimmed) return undefined;

  const prefix = `${SUBAGENT_NOTIFICATION_OPEN_TAG}\n`;
  const suffix = `\n${SUBAGENT_NOTIFICATION_CLOSE_TAG}`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(suffix)) {
    return undefined;
  }

  try {
    return JSON.parse(
      trimmed.slice(prefix.length, trimmed.length - suffix.length),
    ) as NotificationPayload;
  } catch {
    return undefined;
  }
}

export function shouldRenderSubagentNotification(
  payload: Pick<NotificationPayload, "completion_version"> & Partial<NotificationPayload>,
  currentRecord: DurableChildRecord | undefined,
  currentCompletionVersion: number | undefined,
): boolean {
  if (currentRecord?.status === "closed") return false;
  if (payload.completion_version == null || currentCompletionVersion == null) return true;
  return payload.completion_version >= currentCompletionVersion;
}

export function buildWaitAgentContent(snapshots: AgentSnapshot[], timedOut: boolean): string {
  return JSON.stringify({
    status: Object.fromEntries(snapshots.map((snapshot) => [snapshot.agent_id, snapshot.status])),
    timed_out: timedOut,
    agents: snapshots,
  });
}
