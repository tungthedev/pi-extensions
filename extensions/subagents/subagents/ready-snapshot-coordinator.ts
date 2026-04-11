import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";
import type { SubagentRuntimeStore } from "./runtime-store.ts";

function completionSignature(record: DurableChildRecord): string {
  return JSON.stringify({
    status: record.status,
    lastError: record.lastError ?? null,
    lastAssistantText: record.lastAssistantText ?? null,
  });
}

export function createReadySnapshotCoordinator(deps: {
  store: SubagentRuntimeStore;
  childSnapshot: (record: DurableChildRecord, attachment?: LiveChildAttachment) => AgentSnapshot;
  requireDurableChild: (agentId: string) => DurableChildRecord;
  waitForAnyStateChange: (attachments: LiveChildAttachment[], timeoutMs: number) => Promise<boolean>;
  maxWaitTimeoutMs: number;
  sendNotification: (snapshot: AgentSnapshot, taskSummary?: string) => void;
}) {
  const getCompletionVersion = (record: DurableChildRecord): number => {
    const signature = completionSignature(record);
    if (deps.store.getCompletionSignature(record.agentId) !== signature) {
      deps.store.setCompletionSignature(record.agentId, signature);
      deps.store.setCompletionVersion(record.agentId, deps.store.getCompletionVersion(record.agentId) + 1);
    }
    return deps.store.getCompletionVersion(record.agentId);
  };

  const isReadySnapshot = (
    record: DurableChildRecord,
    attachment: LiveChildAttachment | undefined,
  ): boolean => !attachment || record.status !== "live_running";

  const shouldNotifyParent = (record: DurableChildRecord): boolean => {
    if (record.status !== "live_idle" && record.status !== "failed") {
      return false;
    }

    const activeSessionFile = deps.store.getActiveSessionFile();
    return !activeSessionFile || !record.parentSessionFile
      ? true
      : activeSessionFile === record.parentSessionFile;
  };

  const claimReadySnapshot = (
    agentId: string,
    options: { requireNotificationEligibility?: boolean } = {},
  ): AgentSnapshot | undefined => {
    const record = deps.store.getDurableChild(agentId);
    if (!record) return undefined;

    const attachment = deps.store.getLiveAttachment(agentId);
    if (!isReadySnapshot(record, attachment)) {
      return undefined;
    }

    if (options.requireNotificationEligibility && !shouldNotifyParent(record)) {
      return undefined;
    }

    const completionVersion = getCompletionVersion(record);
    if (deps.store.getConsumedCompletionVersion(agentId) >= completionVersion) {
      deps.store.clearSuppressedCompletionVersion(agentId);
      return undefined;
    }

    deps.store.setConsumedCompletionVersion(agentId, completionVersion);
    deps.store.clearSuppressedCompletionVersion(agentId);
    return deps.childSnapshot(record, attachment);
  };

  const collectReadySnapshots = (
    ids: string[],
    options: { claim?: boolean } = {},
  ): { snapshots: AgentSnapshot[]; pendingCount: number } => {
    const snapshots: AgentSnapshot[] = [];
    let pendingCount = 0;

    for (const id of ids) {
      const record = deps.requireDurableChild(id);
      const attachment = deps.store.getLiveAttachment(id);
      if (!isReadySnapshot(record, attachment)) {
        pendingCount += 1;
        continue;
      }

      if (!options.claim) {
        snapshots.push(deps.childSnapshot(record, attachment));
        continue;
      }

      const claimedSnapshot = claimReadySnapshot(id);
      if (claimedSnapshot) {
        snapshots.push(claimedSnapshot);
      }
    }

    return { snapshots, pendingCount };
  };

  const waitForReadySnapshots = async (
    ids: string[],
    options: { timeoutMs?: number; claim?: boolean } = {},
  ): Promise<AgentSnapshot[]> => {
    const claim = options.claim ?? false;
    const deadline = options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs;

    let { snapshots, pendingCount } = collectReadySnapshots(ids, { claim });
    while (snapshots.length === 0 && pendingCount > 0) {
      const liveAttachments = ids.flatMap((id) => {
        const attachment = deps.store.getLiveAttachment(id);
        return attachment ? [attachment] : [];
      });
      if (liveAttachments.length === 0) {
        break;
      }

      const waitTimeoutMs =
        deadline === undefined ? deps.maxWaitTimeoutMs : Math.max(1, deadline - Date.now());
      if (deadline !== undefined && waitTimeoutMs <= 0) {
        break;
      }

      const changed = await deps.waitForAnyStateChange(liveAttachments, waitTimeoutMs);
      if (!changed && deadline !== undefined && Date.now() >= deadline) {
        break;
      }

      ({ snapshots, pendingCount } = collectReadySnapshots(ids, { claim }));
    }

    return snapshots;
  };

  const notifyParentOfChildStatus = (record: DurableChildRecord): void => {
    if (!shouldNotifyParent(record)) return;

    const completionVersion = getCompletionVersion(record);
    if (deps.store.getActiveWaitCount(record.agentId) > 0) {
      deps.store.setSuppressedCompletionVersion(record.agentId, completionVersion);
      return;
    }

    const snapshot = claimReadySnapshot(record.agentId, { requireNotificationEligibility: true });
    if (!snapshot) return;
    deps.sendNotification(snapshot, record.taskSummary);
  };

  const flushSuppressedNotifications = (ids: string[]) => {
    for (const id of ids) {
      if (deps.store.getActiveWaitCount(id) > 0) continue;
      const record = deps.store.getDurableChild(id);
      const suppressedVersion = deps.store.getSuppressedCompletionVersion(id);
      if (!record || suppressedVersion === undefined || !shouldNotifyParent(record)) continue;
      if (deps.store.getConsumedCompletionVersion(id) >= suppressedVersion) {
        deps.store.clearSuppressedCompletionVersion(id);
        continue;
      }
      if (getCompletionVersion(record) !== suppressedVersion) continue;
      notifyParentOfChildStatus(record);
    }
  };

  return {
    claimReadySnapshot,
    collectReadySnapshots,
    flushSuppressedNotifications,
    getCompletionVersion,
    notifyParentOfChildStatus,
    resetCompletionTracking(agentId: string) {
      deps.store.clearCompletionTracking(agentId);
    },
    shouldNotifyParent,
    waitForReadySnapshots,
  };
}
