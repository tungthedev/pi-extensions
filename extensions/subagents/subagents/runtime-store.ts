import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { DurableChildRecord, LiveChildAttachment } from "./types.ts";

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

export type SubagentRuntimeStore = ReturnType<typeof createSubagentRuntimeStore>;

export function createSubagentRuntimeStore() {
  const durableChildrenById = new Map<string, DurableChildRecord>();
  const liveAttachmentsById = new Map<string, LiveChildAttachment>();
  const resumeOperationsByAgentId = new Map<string, Promise<LiveChildAttachment>>();
  const activeWaitsByAgentId = new Map<string, number>();
  const completionVersionByAgentId = new Map<string, number>();
  const completionSignatureByAgentId = new Map<string, string>();
  const consumedCompletionVersionByAgentId = new Map<string, number>();
  const suppressedCompletionVersionByAgentId = new Map<string, number>();
  const subagentActivitiesById = new Map<string, SubagentActivityState>();

  let parentIsStreaming = false;
  let activeSessionFile: string | undefined;
  let subagentActivityVersion = 0;
  let subagentActivityWidget: SubagentActivityWidget | null = null;

  const requestSubagentActivityRender = () => {
    subagentActivityVersion += 1;
    subagentActivityWidget?.requestRender();
  };

  return {
    durableChildrenById,
    liveAttachmentsById,
    resumeOperationsByAgentId,
    subagentActivitiesById,
    getDurableChild(agentId: string) {
      return durableChildrenById.get(agentId);
    },
    hasDurableChild(agentId: string) {
      return durableChildrenById.has(agentId);
    },
    setDurableChild(agentId: string, record: DurableChildRecord) {
      durableChildrenById.set(agentId, record);
    },
    deleteDurableChild(agentId: string) {
      durableChildrenById.delete(agentId);
    },
    replaceDurableChildren(records: Map<string, DurableChildRecord>) {
      durableChildrenById.clear();
      for (const [agentId, record] of records) {
        durableChildrenById.set(agentId, record);
      }
    },
    durableChildValues() {
      return durableChildrenById.values();
    },
    getLiveAttachment(agentId: string) {
      return liveAttachmentsById.get(agentId);
    },
    setLiveAttachment(agentId: string, attachment: LiveChildAttachment) {
      liveAttachmentsById.set(agentId, attachment);
    },
    deleteLiveAttachment(agentId: string) {
      liveAttachmentsById.delete(agentId);
    },
    listLiveAttachments() {
      return [...liveAttachmentsById.values()];
    },
    getResumeOperation(agentId: string) {
      return resumeOperationsByAgentId.get(agentId);
    },
    setResumeOperation(agentId: string, operation: Promise<LiveChildAttachment>) {
      resumeOperationsByAgentId.set(agentId, operation);
    },
    clearResumeOperation(agentId: string, operation?: Promise<LiveChildAttachment>) {
      if (!operation || resumeOperationsByAgentId.get(agentId) === operation) {
        resumeOperationsByAgentId.delete(agentId);
      }
    },
    getActiveWaitCount(agentId: string) {
      return activeWaitsByAgentId.get(agentId) ?? 0;
    },
    incrementActiveWaits(ids: string[]) {
      for (const id of ids) {
        activeWaitsByAgentId.set(id, (activeWaitsByAgentId.get(id) ?? 0) + 1);
      }
    },
    decrementActiveWaits(ids: string[]) {
      for (const id of ids) {
        const nextCount = (activeWaitsByAgentId.get(id) ?? 0) - 1;
        if (nextCount > 0) {
          activeWaitsByAgentId.set(id, nextCount);
        } else {
          activeWaitsByAgentId.delete(id);
        }
      }
    },
    getCompletionVersion(agentId: string) {
      return completionVersionByAgentId.get(agentId) ?? 0;
    },
    setCompletionVersion(agentId: string, version: number) {
      completionVersionByAgentId.set(agentId, version);
    },
    getCompletionSignature(agentId: string) {
      return completionSignatureByAgentId.get(agentId);
    },
    setCompletionSignature(agentId: string, signature: string) {
      completionSignatureByAgentId.set(agentId, signature);
    },
    getConsumedCompletionVersion(agentId: string) {
      return consumedCompletionVersionByAgentId.get(agentId) ?? 0;
    },
    setConsumedCompletionVersion(agentId: string, version: number) {
      consumedCompletionVersionByAgentId.set(agentId, version);
    },
    getSuppressedCompletionVersion(agentId: string) {
      return suppressedCompletionVersionByAgentId.get(agentId);
    },
    setSuppressedCompletionVersion(agentId: string, version: number) {
      suppressedCompletionVersionByAgentId.set(agentId, version);
    },
    clearCompletionTracking(agentId: string) {
      completionSignatureByAgentId.delete(agentId);
      suppressedCompletionVersionByAgentId.delete(agentId);
    },
    clearSuppressedCompletionVersion(agentId: string) {
      suppressedCompletionVersionByAgentId.delete(agentId);
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
      const record = durableChildrenById.get(agentId);
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
