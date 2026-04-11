import type { DurableChildRecord } from "./types.ts";

export type CompletionState = {
  signature?: string;
  version: number;
  consumedVersion: number;
  suppressedVersion?: number;
  activeWaitCount: number;
};

function completionSignature(record: DurableChildRecord): string {
  return JSON.stringify({
    status: record.status,
    lastError: record.lastError ?? null,
    lastAssistantText: record.lastAssistantText ?? null,
  });
}

export function createCompletionTracker() {
  const activeWaitsByAgentId = new Map<string, number>();
  const completionVersionByAgentId = new Map<string, number>();
  const completionSignatureByAgentId = new Map<string, string>();
  const consumedCompletionVersionByAgentId = new Map<string, number>();
  const suppressedCompletionVersionByAgentId = new Map<string, number>();

  return {
    get(agentId: string): CompletionState {
      return {
        signature: completionSignatureByAgentId.get(agentId),
        version: completionVersionByAgentId.get(agentId) ?? 0,
        consumedVersion: consumedCompletionVersionByAgentId.get(agentId) ?? 0,
        suppressedVersion: suppressedCompletionVersionByAgentId.get(agentId),
        activeWaitCount: activeWaitsByAgentId.get(agentId) ?? 0,
      };
    },
    beginWait(ids: string[]) {
      for (const id of ids) {
        activeWaitsByAgentId.set(id, (activeWaitsByAgentId.get(id) ?? 0) + 1);
      }
    },
    endWait(ids: string[]) {
      for (const id of ids) {
        const nextCount = (activeWaitsByAgentId.get(id) ?? 0) - 1;
        if (nextCount > 0) {
          activeWaitsByAgentId.set(id, nextCount);
        } else {
          activeWaitsByAgentId.delete(id);
        }
      }
    },
    recordTerminal(agentId: string, record: DurableChildRecord) {
      activeWaitsByAgentId.delete(agentId);
      const signature = completionSignature(record);
      if (completionSignatureByAgentId.get(agentId) !== signature) {
        completionSignatureByAgentId.set(agentId, signature);
        completionVersionByAgentId.set(agentId, (completionVersionByAgentId.get(agentId) ?? 0) + 1);
      }
    },
    clear(agentId: string) {
      completionSignatureByAgentId.delete(agentId);
      suppressedCompletionVersionByAgentId.delete(agentId);
    },
    clearSuppressed(agentId: string) {
      suppressedCompletionVersionByAgentId.delete(agentId);
    },
    getVersion(agentId: string) {
      return completionVersionByAgentId.get(agentId) ?? 0;
    },
    setVersion(agentId: string, version: number) {
      completionVersionByAgentId.set(agentId, version);
    },
    getSignature(agentId: string) {
      return completionSignatureByAgentId.get(agentId);
    },
    setSignature(agentId: string, signature: string) {
      completionSignatureByAgentId.set(agentId, signature);
    },
    getConsumedVersion(agentId: string) {
      return consumedCompletionVersionByAgentId.get(agentId) ?? 0;
    },
    setConsumedVersion(agentId: string, version: number) {
      consumedCompletionVersionByAgentId.set(agentId, version);
    },
    getSuppressedVersion(agentId: string) {
      return suppressedCompletionVersionByAgentId.get(agentId);
    },
    setSuppressedVersion(agentId: string, version: number) {
      suppressedCompletionVersionByAgentId.set(agentId, version);
    },
    getActiveWaitCount(agentId: string) {
      return activeWaitsByAgentId.get(agentId) ?? 0;
    },
  };
}
