import type { AgentSnapshot, DurableChildRecord, LiveChildAttachment } from "./types.ts";
import type { SubagentRuntimeStore } from "./runtime-store.ts";

function completionSignature(record: DurableChildRecord): string {
  return JSON.stringify({
    status: record.status,
    lastError: record.lastError ?? null,
    lastAssistantText: record.lastAssistantText ?? null,
    lastPingMessage: record.lastPingMessage ?? null,
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

  const shouldNotifyParent = (record: DurableChildRecord): boolean => {
    if (record.status !== "live_running" && record.status !== "live_idle" && record.status !== "failed") {
      return false;
    }

    const activeSessionFile = deps.store.getActiveSessionFile();
    return !activeSessionFile || !record.parentSessionFile
      ? true
      : activeSessionFile === record.parentSessionFile;
  };

  const snapshotFromRecord = (
    record: DurableChildRecord,
    attachment: LiveChildAttachment | undefined,
    updateMessage?: string,
  ): AgentSnapshot => deps.childSnapshot({ ...record, lastUpdateMessage: updateMessage }, attachment);

  const getPendingCompletionVersion = (
    record: DurableChildRecord,
    attachment: LiveChildAttachment | undefined,
  ): number | undefined => {
    if (attachment && record.status === "live_running") {
      return undefined;
    }

    const completionVersion = getCompletionVersion(record);
    if (deps.store.getConsumedCompletionVersion(record.agentId) >= completionVersion) {
      deps.store.clearSuppressedCompletionVersion(record.agentId);
      return undefined;
    }

    return completionVersion;
  };

  const getPendingUpdateVersion = (record: DurableChildRecord): number | undefined => {
    if (record.status !== "live_running") {
      deps.store.clearSuppressedUpdateVersion(record.agentId);
      return undefined;
    }

    const message = deps.store.getLatestUpdateMessage(record.agentId);
    const updateVersion = deps.store.getUpdateVersion(record.agentId);
    if (message === undefined || updateVersion === 0) {
      return undefined;
    }

    if (deps.store.getConsumedUpdateVersion(record.agentId) >= updateVersion) {
      deps.store.clearSuppressedUpdateVersion(record.agentId);
      return undefined;
    }

    return updateVersion;
  };

  const claimReadySnapshot = (
    agentId: string,
    options: { requireNotificationEligibility?: boolean } = {},
  ): AgentSnapshot | undefined => {
    const record = deps.store.getDurableChild(agentId);
    if (!record) return undefined;

    const attachment = deps.store.getLiveAttachment(agentId);
    if (options.requireNotificationEligibility && !shouldNotifyParent(record)) {
      return undefined;
    }

    const completionVersion = getPendingCompletionVersion(record, attachment);
    if (completionVersion !== undefined) {
      deps.store.setConsumedCompletionVersion(agentId, completionVersion);
      deps.store.clearSuppressedCompletionVersion(agentId);
      deps.store.clearSuppressedUpdateVersion(agentId);
      return snapshotFromRecord(record, attachment, undefined);
    }

    const updateVersion = getPendingUpdateVersion(record);
    if (updateVersion === undefined) {
      return undefined;
    }

    deps.store.setConsumedUpdateVersion(agentId, updateVersion);
    deps.store.clearSuppressedUpdateVersion(agentId);
    return snapshotFromRecord(record, attachment, deps.store.getLatestUpdateMessage(agentId));
  };

  const peekReadySnapshot = (agentId: string): AgentSnapshot | undefined => {
    const record = deps.store.getDurableChild(agentId);
    if (!record) return undefined;

    const attachment = deps.store.getLiveAttachment(agentId);
    if (getPendingCompletionVersion(record, attachment) !== undefined) {
      return snapshotFromRecord(record, attachment, undefined);
    }

    if (getPendingUpdateVersion(record) !== undefined) {
      return snapshotFromRecord(record, attachment, deps.store.getLatestUpdateMessage(agentId));
    }

    return undefined;
  };

  const collectReadySnapshots = (
    ids: string[],
    options: { claim?: boolean } = {},
  ): { snapshots: AgentSnapshot[]; pendingCount: number } => {
    const snapshots: AgentSnapshot[] = [];
    let pendingCount = 0;

    for (const id of ids) {
      const record = deps.requireDurableChild(id);
      const snapshot = options.claim ? claimReadySnapshot(id) : peekReadySnapshot(id);
      if (snapshot) {
        snapshots.push(snapshot);
        continue;
      }

      if (record.status === "live_running" && deps.store.getLiveAttachment(id)) {
        pendingCount += 1;
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

    const completionVersion = getPendingCompletionVersion(record, deps.store.getLiveAttachment(record.agentId));
    const updateVersion = completionVersion === undefined ? getPendingUpdateVersion(record) : undefined;
    if (completionVersion === undefined && updateVersion === undefined) {
      return;
    }

    if (deps.store.getActiveWaitCount(record.agentId) > 0) {
      if (completionVersion !== undefined) {
        deps.store.setSuppressedCompletionVersion(record.agentId, completionVersion);
        deps.store.clearSuppressedUpdateVersion(record.agentId);
      } else if (updateVersion !== undefined) {
        deps.store.setSuppressedUpdateVersion(record.agentId, updateVersion);
      }
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
      if (!record || !shouldNotifyParent(record)) continue;

      const suppressedCompletionVersion = deps.store.getSuppressedCompletionVersion(id);
      if (suppressedCompletionVersion !== undefined) {
        if (deps.store.getConsumedCompletionVersion(id) >= suppressedCompletionVersion) {
          deps.store.clearSuppressedCompletionVersion(id);
        } else if (getCompletionVersion(record) === suppressedCompletionVersion) {
          notifyParentOfChildStatus(record);
          continue;
        }
      }

      const suppressedUpdateVersion = deps.store.getSuppressedUpdateVersion(id);
      if (suppressedUpdateVersion === undefined) continue;
      if (deps.store.getConsumedUpdateVersion(id) >= suppressedUpdateVersion) {
        deps.store.clearSuppressedUpdateVersion(id);
        continue;
      }
      if (getPendingUpdateVersion(record) !== suppressedUpdateVersion) {
        deps.store.clearSuppressedUpdateVersion(id);
        continue;
      }
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
