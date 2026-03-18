import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";
import { durableStatusToAgentStatus } from "./state.ts";

export function childSnapshot(
  record: DurableChildRecord,
  attachment?: LiveChildAttachment,
  statusOverride?: AgentSnapshot["status"],
): AgentSnapshot {
  return {
    agent_id: record.agentId,
    agent_type: record.agentType,
    status: statusOverride ?? durableStatusToAgentStatus(record.status),
    durable_status: record.status,
    cwd: record.cwd,
    model: record.model,
    name: record.name,
    session_id: record.sessionId,
    session_file: record.sessionFile,
    last_assistant_text: record.lastAssistantText,
    last_error: record.lastError,
    exit_code: attachment?.exitCode,
  };
}
