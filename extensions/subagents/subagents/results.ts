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
    name,
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
