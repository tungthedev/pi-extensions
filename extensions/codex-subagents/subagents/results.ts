import type { AgentSnapshot } from "./types.ts";

export function buildSpawnAgentContent(
  agentId: string,
  nickname?: string,
  completedAgent?: AgentSnapshot,
): string {
  return JSON.stringify({
    agent_id: agentId,
    nickname: nickname ?? null,
    ...(completedAgent
      ? {
          status: {
            [agentId]: completedAgent.status,
          },
          timed_out: false,
          agent: completedAgent,
          agents: [completedAgent],
        }
      : {}),
  });
}

export function buildSendInputContent(submissionId: string): string {
  return JSON.stringify({
    submission_id: submissionId,
  });
}
