import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";

import { resolveTaskFacingStatus } from "./task-status.ts";

export function childSnapshot(
  record: DurableChildRecord,
  attachment?: LiveChildAttachment,
  statusOverride?: AgentSnapshot["status"],
): AgentSnapshot {
  return {
    agent_id: record.agentId,
    agent_type: record.agentType,
    status: statusOverride ?? resolveTaskFacingStatus(record),
    durable_status: record.status,
    cwd: record.cwd,
    model: record.model,
    name: record.name,
    session_id: record.sessionId,
    session_file: record.sessionFile,
    final_result_text: record.finalResultText,
    last_assistant_text: record.lastAssistantText,
    last_error: record.lastError,
    exit_code: attachment?.exitCode,
  };
}
