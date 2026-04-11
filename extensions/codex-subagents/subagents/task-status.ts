import type {
  AgentToolStatus,
  DurableChildRecord,
  DurableChildStatus,
  PersistedTaskStatus,
} from "./types.ts";

import { durableStatusToAgentStatus } from "./state.ts";

export function resolveTaskFacingStatus(
  record: Pick<DurableChildRecord, "status" | "taskStatus">,
): AgentToolStatus {
  if (record.status === "failed" || record.status === "closed" || record.status === "detached") {
    return durableStatusToAgentStatus(record.status);
  }

  return record.taskStatus ?? durableStatusToAgentStatus(record.status);
}

export function shouldWaitForTaskCompletion(
  record: Pick<DurableChildRecord, "status" | "taskStatus">,
  hasAttachment: boolean,
): boolean {
  return hasAttachment && resolveTaskFacingStatus(record) === "running";
}

export function shouldNotifyForTaskStatus(
  record: Pick<DurableChildRecord, "status" | "taskStatus">,
): boolean {
  const status = resolveTaskFacingStatus(record);
  return status === "idle" || status === "failed";
}

export function normalizeRecoveredTaskStatus(
  durableStatus: DurableChildStatus,
  taskStatus: PersistedTaskStatus | undefined,
): PersistedTaskStatus | undefined {
  if (durableStatus === "closed") return "closed";
  if (durableStatus === "failed") return "failed";
  if (durableStatus === "detached") return "detached";
  return taskStatus;
}

export function buildCompletionSignature(
  record: Pick<
    DurableChildRecord,
    "status" | "taskStatus" | "lastError" | "lastAssistantText" | "finalResultText"
  >,
): string {
  return JSON.stringify({
    status: record.status,
    taskStatus: record.taskStatus ?? null,
    lastError: record.lastError ?? null,
    lastAssistantText: record.lastAssistantText ?? null,
    finalResultText: record.finalResultText ?? null,
  });
}
