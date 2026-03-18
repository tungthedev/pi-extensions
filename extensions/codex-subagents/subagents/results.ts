export function buildSpawnAgentContent(agentId: string, nickname?: string): string {
  return JSON.stringify({
    agent_id: agentId,
    nickname: nickname ?? null,
  });
}

export function buildSendInputContent(submissionId: string): string {
  return JSON.stringify({
    submission_id: submissionId,
  });
}
