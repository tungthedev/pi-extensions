import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { DurableChildRecord, LiveChildAttachment } from "./types.ts";
import type { RuntimeCompletionState, RuntimeUpdateState } from "./runtime-types.ts";

import {
  markSubagentActivityRunning,
  markSubagentActivitySubmitted,
  markSubagentToolExecutionEnd,
  markSubagentToolExecutionStart,
  removeSubagentActivity,
  snapshotSubagentActivities,
  type SubagentActivityState,
  type SubagentActivityWidget,
} from "./activity-widget.ts";
import { childSnapshot } from "./registry.ts";
import { createAttachmentRegistry } from "./attachment-registry.ts";
import { createCompletionTracker } from "./completion-tracker.ts";
import { isResumable } from "./session.ts";
import { isDescendantTaskPath, normalizeTaskPath, resolveTaskTarget } from "./task-paths.ts";

function normalizePublicName(name: string): string {
  return name.trim();
}

export function isPubliclyAddressableChild(record: DurableChildRecord): boolean {
  switch (record.status) {
    case "live_running":
    case "live_idle":
    case "failed":
      return true;
    case "detached":
      return record.transport === "rpc" && isResumable(record);
    case "closed":
      return false;
  }
}

export function isWaitableChild(
  record: DurableChildRecord,
  options: { hasUnconsumedCompletion?: boolean } = {},
): boolean {
  switch (record.status) {
    case "live_running":
      return true;
    case "live_idle":
    case "failed":
      return options.hasUnconsumedCompletion === true;
    case "detached":
    case "closed":
      return false;
  }
}

export type SubagentRuntimeStore = ReturnType<typeof createSubagentRuntimeStore>;

export function createSubagentRuntimeStore() {
  const attachments = createAttachmentRegistry();
  const completion = createCompletionTracker();
  const resumeOperationsByAgentId = new Map<
    string,
    Promise<{ attachment: LiveChildAttachment; deliveredInputAtAttach?: boolean }>
  >();
  const subagentActivitiesById = new Map<string, SubagentActivityState>();
  const latestUpdateMessageByAgentId = new Map<string, string>();
  const updateVersionByAgentId = new Map<string, number>();
  const consumedUpdateVersionByAgentId = new Map<string, number>();
  const suppressedUpdateVersionByAgentId = new Map<string, number>();

  let parentIsStreaming = false;
  let activeSessionFile: string | undefined;
  let subagentActivityVersion = 0;
  let subagentActivityWidget: SubagentActivityWidget | null = null;

  const requestSubagentActivityRender = () => {
    subagentActivityVersion += 1;
    subagentActivityWidget?.requestRender();
  };

  const resetUpdateTracking = (agentId: string, options: { consume?: boolean } = {}) => {
    const version = updateVersionByAgentId.get(agentId) ?? 0;
    latestUpdateMessageByAgentId.delete(agentId);
    suppressedUpdateVersionByAgentId.delete(agentId);
    if (options.consume && version > 0) {
      consumedUpdateVersionByAgentId.set(agentId, version);
    }
  };

  return {
    durableChildrenById: attachments.durableChildrenById,
    liveAttachmentsById: attachments.liveAttachmentsById,
    resumeOperationsByAgentId,
    subagentActivitiesById,
    getDurableChild(agentId: string) {
      return attachments.getDurable(agentId);
    },
    hasDurableChild(agentId: string) {
      return attachments.hasDurable(agentId);
    },
    setDurableChild(agentId: string, record: DurableChildRecord) {
      attachments.setDurable(agentId, record);
    },
    attach(record: DurableChildRecord, attachment?: LiveChildAttachment) {
      attachments.attach(record, attachment);
    },
    deleteDurableChild(agentId: string) {
      attachments.deleteDurable(agentId);
    },
    replaceDurableChildren(records: Map<string, DurableChildRecord>) {
      attachments.replaceDurable(records);
    },
    durableChildValues() {
      return attachments.durableValues();
    },
    findChildByPublicName(name: string, options: { addressableOnly?: boolean } = {}) {
      const normalizedName = normalizePublicName(name);
      for (const record of attachments.durableValues()) {
        if (record.name !== normalizedName) continue;
        if (options.addressableOnly !== false && !isPubliclyAddressableChild(record)) continue;
        return record;
      }
      return undefined;
    },
    findChildByTaskPath(taskPath: string, options: { addressableOnly?: boolean } = {}) {
      const normalizedPath = normalizeTaskPath(taskPath);
      for (const record of attachments.durableValues()) {
        if (record.taskPath !== normalizedPath) continue;
        if (options.addressableOnly !== false && !isPubliclyAddressableChild(record)) continue;
        return record;
      }
      return undefined;
    },
    findChildByTarget(target: string, currentTaskPath: string, options: { addressableOnly?: boolean } = {}) {
      const records = Array.from(attachments.durableValues()).filter((record) =>
        options.addressableOnly === false ? true : isPubliclyAddressableChild(record),
      );
      return resolveTaskTarget(records, currentTaskPath, target);
    },
    listChildrenByParentTaskPath(parentTaskPath: string, options: { addressableOnly?: boolean } = {}) {
      const normalizedPath = normalizeTaskPath(parentTaskPath);
      return Array.from(attachments.durableValues())
        .filter((record) => record.parentTaskPath === normalizedPath)
        .filter((record) => options.addressableOnly === false || isPubliclyAddressableChild(record))
        .sort((a, b) => (a.taskPath ?? a.name ?? a.agentId).localeCompare(b.taskPath ?? b.name ?? b.agentId));
    },
    listDescendantsByTaskPath(taskPath: string, options: { addressableOnly?: boolean } = {}) {
      const normalizedPath = normalizeTaskPath(taskPath);
      return Array.from(attachments.durableValues())
        .filter((record) => record.taskPath && isDescendantTaskPath(normalizedPath, record.taskPath))
        .filter((record) => options.addressableOnly === false || isPubliclyAddressableChild(record))
        .sort((a, b) => (a.taskPath ?? a.name ?? a.agentId).localeCompare(b.taskPath ?? b.name ?? b.agentId));
    },
    listAddressableChildren() {
      return Array.from(attachments.durableValues())
        .filter(isPubliclyAddressableChild)
        .sort((a, b) => (a.taskPath ?? a.name ?? a.agentId).localeCompare(b.taskPath ?? b.name ?? b.agentId));
    },
    hasAddressableChildName(name: string) {
      return Boolean(this.findChildByPublicName(name, { addressableOnly: true }));
    },
    getLiveAttachment(agentId: string) {
      return attachments.getLive(agentId);
    },
    setLiveAttachment(agentId: string, attachment: LiveChildAttachment) {
      attachments.setLive(agentId, attachment);
    },
    deleteLiveAttachment(agentId: string) {
      attachments.deleteLive(agentId);
    },
    listLiveAttachments() {
      return attachments.listLive();
    },
    getResumeOperation(agentId: string) {
      return resumeOperationsByAgentId.get(agentId);
    },
    setResumeOperation(
      agentId: string,
      operation: Promise<{ attachment: LiveChildAttachment; deliveredInputAtAttach?: boolean }>,
    ) {
      resumeOperationsByAgentId.set(agentId, operation);
    },
    clearResumeOperation(
      agentId: string,
      operation?: Promise<{ attachment: LiveChildAttachment; deliveredInputAtAttach?: boolean }>,
    ) {
      if (!operation || resumeOperationsByAgentId.get(agentId) === operation) {
        resumeOperationsByAgentId.delete(agentId);
      }
    },
    getActiveWaitCount(agentId: string) {
      return completion.getActiveWaitCount(agentId);
    },
    beginWait(ids: string[]) {
      completion.beginWait(ids);
    },
    endWait(ids: string[]) {
      completion.endWait(ids);
    },
    incrementActiveWaits(ids: string[]) {
      this.beginWait(ids);
    },
    decrementActiveWaits(ids: string[]) {
      this.endWait(ids);
    },
    getCompletionVersion(agentId: string) {
      return completion.getVersion(agentId);
    },
    setCompletionVersion(agentId: string, version: number) {
      completion.setVersion(agentId, version);
    },
    getCompletionSignature(agentId: string) {
      return completion.getSignature(agentId);
    },
    setCompletionSignature(agentId: string, signature: string) {
      completion.setSignature(agentId, signature);
    },
    getConsumedCompletionVersion(agentId: string) {
      return completion.getConsumedVersion(agentId);
    },
    setConsumedCompletionVersion(agentId: string, version: number) {
      completion.setConsumedVersion(agentId, version);
    },
    getSuppressedCompletionVersion(agentId: string) {
      return completion.getSuppressedVersion(agentId);
    },
    setSuppressedCompletionVersion(agentId: string, version: number) {
      completion.setSuppressedVersion(agentId, version);
    },
    completionState(agentId: string): RuntimeCompletionState {
      return completion.get(agentId);
    },
    clearCompletionTracking(agentId: string) {
      completion.clear(agentId);
    },
    clearSuppressedCompletionVersion(agentId: string) {
      completion.clearSuppressed(agentId);
    },
    getUpdateVersion(agentId: string) {
      return updateVersionByAgentId.get(agentId) ?? 0;
    },
    setUpdateVersion(agentId: string, version: number) {
      updateVersionByAgentId.set(agentId, version);
    },
    getLatestUpdateMessage(agentId: string) {
      return latestUpdateMessageByAgentId.get(agentId);
    },
    setLatestUpdateMessage(agentId: string, message: string | undefined) {
      if (message === undefined) {
        latestUpdateMessageByAgentId.delete(agentId);
        return;
      }
      latestUpdateMessageByAgentId.set(agentId, message);
    },
    getConsumedUpdateVersion(agentId: string) {
      return consumedUpdateVersionByAgentId.get(agentId) ?? 0;
    },
    setConsumedUpdateVersion(agentId: string, version: number) {
      consumedUpdateVersionByAgentId.set(agentId, version);
    },
    getSuppressedUpdateVersion(agentId: string) {
      return suppressedUpdateVersionByAgentId.get(agentId);
    },
    setSuppressedUpdateVersion(agentId: string, version: number) {
      suppressedUpdateVersionByAgentId.set(agentId, version);
    },
    updateState(agentId: string): RuntimeUpdateState {
      return {
        message: latestUpdateMessageByAgentId.get(agentId),
        version: updateVersionByAgentId.get(agentId) ?? 0,
        consumedVersion: consumedUpdateVersionByAgentId.get(agentId) ?? 0,
        suppressedVersion: suppressedUpdateVersionByAgentId.get(agentId),
      };
    },
    clearUpdateTracking(agentId: string) {
      resetUpdateTracking(agentId);
    },
    clearSuppressedUpdateVersion(agentId: string) {
      suppressedUpdateVersionByAgentId.delete(agentId);
    },
    recordUpdate(agentId: string, message: string) {
      latestUpdateMessageByAgentId.set(agentId, message);
      suppressedUpdateVersionByAgentId.delete(agentId);
      updateVersionByAgentId.set(agentId, (updateVersionByAgentId.get(agentId) ?? 0) + 1);
    },
    markRunning(agentId: string, patch: Partial<DurableChildRecord> = {}) {
      const current = attachments.getDurable(agentId);
      if (!current) return undefined;

      const next: DurableChildRecord = {
        ...current,
        ...patch,
        status: "live_running",
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      attachments.setDurable(agentId, next);
      completion.clear(agentId);
      return next;
    },
    markCompleted(agentId: string, patch: Partial<DurableChildRecord> = {}) {
      const current = attachments.getDurable(agentId);
      if (!current) return undefined;

      const next: DurableChildRecord = {
        ...current,
        ...patch,
        status: "live_idle",
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      attachments.setDurable(agentId, next);
      completion.recordTerminal(agentId, next);
      resetUpdateTracking(agentId, { consume: true });

      return next;
    },
    markFailed(agentId: string, patch: Partial<DurableChildRecord> = {}) {
      const current = attachments.getDurable(agentId);
      if (!current) return undefined;

      const next: DurableChildRecord = {
        ...current,
        ...patch,
        status: "failed",
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      attachments.setDurable(agentId, next);
      completion.recordTerminal(agentId, next);
      resetUpdateTracking(agentId, { consume: true });

      return next;
    },
    markClosed(agentId: string, patch: Partial<DurableChildRecord> = {}) {
      const current = attachments.getDurable(agentId);
      if (!current) return undefined;

      const next: DurableChildRecord = {
        ...current,
        ...patch,
        status: "closed",
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
        closedAt: patch.closedAt ?? current.closedAt ?? new Date().toISOString(),
      };
      attachments.setDurable(agentId, next);
      completion.recordTerminal(agentId, next);
      resetUpdateTracking(agentId, { consume: true });

      return next;
    },
    snapshotActivities() {
      return snapshotSubagentActivities(subagentActivitiesById);
    },
    clearActivities() {
      if (subagentActivitiesById.size === 0) {
        return false;
      }
      subagentActivitiesById.clear();
      requestSubagentActivityRender();
      return true;
    },
    removeActivity(agentId: string) {
      if (!removeSubagentActivity(subagentActivitiesById, agentId)) {
        return false;
      }
      requestSubagentActivityRender();
      return true;
    },
    markActivitySubmitted(
      snapshot: Parameters<typeof markSubagentActivitySubmitted>[1],
      prompt: string,
    ) {
      markSubagentActivitySubmitted(subagentActivitiesById, snapshot, prompt);
      requestSubagentActivityRender();
    },
    markActivityRunning(snapshot: Parameters<typeof markSubagentActivityRunning>[1]) {
      markSubagentActivityRunning(subagentActivitiesById, snapshot);
      requestSubagentActivityRender();
    },
    markToolExecutionStart(
      snapshot: Parameters<typeof markSubagentToolExecutionStart>[1],
      toolCallId: string,
      toolName: string,
    ) {
      markSubagentToolExecutionStart(subagentActivitiesById, snapshot, toolCallId, toolName);
      requestSubagentActivityRender();
    },
    markToolExecutionEnd(agentId: string, toolCallId: string, toolName?: string) {
      markSubagentToolExecutionEnd(subagentActivitiesById, agentId, toolCallId, toolName);
      requestSubagentActivityRender();
    },
    syncActivityIdentity(record: DurableChildRecord) {
      const current = subagentActivitiesById.get(record.agentId);
      if (!current) {
        return;
      }

      if (
        current.name === record.name &&
        current.agent_type === record.agentType &&
        current.transport === record.transport
      ) {
        return;
      }

      current.name = record.name;
      current.agent_type = record.agentType;
      current.transport = record.transport;
      requestSubagentActivityRender();
    },
    getActivityIdentity(agentId: string) {
      const record = attachments.getDurable(agentId);
      if (record) {
        return childSnapshot(record);
      }

      const activity = subagentActivitiesById.get(agentId);
      if (activity) {
        return {
          agent_id: activity.agent_id,
          transport: activity.transport,
          name: activity.name,
          agent_type: activity.agent_type,
        };
      }

      return { agent_id: agentId, transport: "rpc" as const };
    },
    setActivityWidget(widget: SubagentActivityWidget | null) {
      subagentActivityWidget = widget;
    },
    getActivityVersion() {
      return subagentActivityVersion;
    },
    requestSubagentActivityRender,
    setParentIsStreaming(value: boolean) {
      parentIsStreaming = value;
    },
    getParentIsStreaming() {
      return parentIsStreaming;
    },
    setActiveSessionFile(value: string | undefined) {
      activeSessionFile = value;
    },
    getActiveSessionFile() {
      return activeSessionFile;
    },
    mountActivityWidget(
      ctx: Pick<ExtensionContext, "ui">,
      key: string,
      createWidget: (
        requestRender: { requestRender(): void },
        theme: ExtensionContext["ui"]["theme"],
      ) => SubagentActivityWidget,
    ) {
      ctx.ui.setWidget(
        key,
        (tui: { requestRender(): void }, theme: ExtensionContext["ui"]["theme"]) => {
          const widget = createWidget(tui, theme);
          subagentActivityWidget = widget;
          return widget;
        },
        { placement: "aboveEditor" },
      );
    },
  };
}
