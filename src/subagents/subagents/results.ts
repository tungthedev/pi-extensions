import type { AgentSnapshot, PublicAgentSnapshot } from "./types.ts";

export function toPublicAgentSnapshot(snapshot: AgentSnapshot): PublicAgentSnapshot {
  const name = snapshot.name?.trim();
  if (!name) {
    throw new Error("public agent snapshot is missing name");
  }

  return {
    name,
    transport: snapshot.transport,
    agent_type: snapshot.agent_type,
    status: snapshot.status,
    durable_status: snapshot.durable_status,
    cwd: snapshot.cwd,
    model: snapshot.model,
    task_path: snapshot.task_path,
    parent_task_path: snapshot.parent_task_path,
    session_id: snapshot.session_id,
    session_file: snapshot.session_file,
    last_assistant_text: snapshot.last_assistant_text,
    last_error: snapshot.last_error,
    ping_message: snapshot.ping_message,
    update_message: snapshot.update_message,
    exit_code: snapshot.exit_code,
  };
}

export function buildSpawnAgentContent(
  name: string,
  completedAgent?: PublicAgentSnapshot,
): string {
  return JSON.stringify({
    task_name: name,
    ...(completedAgent
      ? {
          status: {
            [name]: completedAgent.status,
          },
          timed_out: false,
          agent: completedAgent,
          agents: [completedAgent],
        }
      : {}),
  });
}

export function buildSendMessageContent(submissionId: string): string {
  return JSON.stringify({
    submission_id: submissionId,
  });
}
