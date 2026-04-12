import type { ExtensionContext, SessionEntry } from "@mariozechner/pi-coding-agent";

import { randomUUID } from "node:crypto";

import type { AppliedSpawnProfile } from "./profiles-apply.ts";
import type {
  AgentSnapshot,
  ChildTransport,
  DurableChildRecord,
  InteractiveLiveChildAttachment,
  LiveChildAttachment,
  RpcLiveChildAttachment,
  SubagentEntryType,
} from "./types.ts";

import { applySpawnAgentProfile } from "./profiles-apply.ts";
import { validateSubagentName } from "./naming.ts";
import { resolveAgentProfiles } from "./profiles.ts";
import { resolveSessionToolSet } from "../../settings/session.ts";

export type SpawnLifecycleRequest = {
  mode: "codex" | "task";
  ctx: ExtensionContext;
  name: string;
  prompt: string;
  requestedAgentType?: string;
  requestedModel?: string;
  requestedReasoningEffort?: string;
  runInBackground?: boolean;
  interactive?: boolean;
  forkContext?: boolean;
  taskSummary?: string;
};

export type SpawnLifecycleResult = {
  agentId: string;
  name: string;
  prompt: string;
  taskSummary?: string;
  record: DurableChildRecord;
  attachment: LiveChildAttachment;
  completedAgent?: AgentSnapshot;
};

export type ResumeLifecycleRequest = {
  mode: "codex" | "task";
  agentId: string;
  input: string;
  interrupt?: boolean;
  taskSummary?: string;
};

export type ResumeLifecycleResult = {
  submissionId: string;
  commandType: "prompt" | "follow_up" | "steer" | "interactive_input";
  input: string;
  taskSummary?: string;
  snapshot: AgentSnapshot;
};

export type WaitLifecycleRequest = {
  ids: string[];
  timeoutMs: number;
};

export type WaitLifecycleResult = {
  snapshots: AgentSnapshot[];
  timedOut: boolean;
};

export type SnapshotLifecycleResult = {
  snapshot: AgentSnapshot;
};

export type StopLifecycleResult = {
  snapshot: AgentSnapshot;
};

export type SubagentLifecycleServiceDeps = {
  resolveParentSpawnDefaults: (options: {
    modelId?: string;
    sessionEntries?: SessionEntry[];
    leafId?: string | null;
  }) => { model?: string; reasoningEffort?: string };
  normalizeReasoningEffortToThinkingLevel: (reasoningEffort: string | undefined) =>
    | "off"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  resolveForkContextSessionFile: (options: {
    sessionFile?: string;
    leafId?: string | null;
    currentCwd: string;
    childCwd: string;
  }) => string;
  findAddressableChildByName: (name: string) => DurableChildRecord | undefined;
  attachChild: (
    record: DurableChildRecord,
    mode: "fresh" | "resume" | "fork",
    toolSet?: "pi" | "codex" | "droid",
  ) => Promise<{ attachment: RpcLiveChildAttachment; record: DurableChildRecord }>;
  launchInteractiveChild: (options: {
    record: DurableChildRecord;
    prompt: string;
    profileBootstrap: AppliedSpawnProfile["bootstrap"];
    toolSet: "pi" | "codex" | "droid";
    forkedSessionFile?: string;
  }) => Promise<{
    attachment: LiveChildAttachment;
    record: DurableChildRecord;
  }>;
  watchInteractiveAttachment: (attachment: InteractiveLiveChildAttachment) => void;
  sendPromptToAttachment: (
    attachment: RpcLiveChildAttachment,
    prompt: string,
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
  ) => Promise<DurableChildRecord>;
  ensureLiveAttachment: (agentId: string) => Promise<LiveChildAttachment>;
  requireDurableChild: (agentId: string) => DurableChildRecord;
  updateDurableChild: (
    agentId: string,
    patch: Partial<DurableChildRecord>,
    options?: { persistAs?: SubagentEntryType; reason?: string },
  ) => DurableChildRecord;
  childSnapshot: (record: DurableChildRecord, attachment?: LiveChildAttachment) => AgentSnapshot;
  queueAgentOperation: <T>(attachment: LiveChildAttachment, operation: () => Promise<T>) => Promise<T>;
  isInteractiveAttachment: (attachment: LiveChildAttachment) => boolean;
  sendInteractiveInput: (attachment: LiveChildAttachment, input: string) => void;
  sendAttachmentMessage: (
    attachment: LiveChildAttachment,
    input: string,
    commandType: "prompt" | "follow_up" | "steer",
  ) => Promise<string>;
  closeLiveAttachment: (
    attachment: LiveChildAttachment,
    disposition: NonNullable<LiveChildAttachment["closingDisposition"]>,
  ) => Promise<void>;
  listWaitableChildIds: () => string[];
  waitForReadySnapshots: (ids: string[], options: { timeoutMs?: number; claim?: boolean }) => Promise<AgentSnapshot[]>;
  incrementActiveWaits: (ids: string[]) => void;
  decrementActiveWaits: (ids: string[]) => void;
  flushSuppressedNotifications: (ids: string[]) => void;
  markActivitySubmitted: (snapshot: AgentSnapshot, prompt: string) => void;
  markActivityRunning: (snapshot: AgentSnapshot) => void;
  persistRegistryEvent: (
    eventType: SubagentEntryType,
    record: DurableChildRecord,
    options?: { reason?: string },
  ) => void;
  entryTypes: {
    create: SubagentEntryType;
    attach: SubagentEntryType;
    update: SubagentEntryType;
    close: SubagentEntryType;
  };
  isMuxAvailable: () => boolean;
  muxUnavailableError: (kind?: string) => Error;
};

export function createSubagentLifecycleService(deps: SubagentLifecycleServiceDeps) {
  const resolveAppliedProfile = (request: SpawnLifecycleRequest): AppliedSpawnProfile => {
    const inheritedDefaults = deps.resolveParentSpawnDefaults({
      modelId:
        request.ctx.model?.provider && request.ctx.model?.id
          ? `${request.ctx.model.provider}/${request.ctx.model.id}`
          : request.ctx.model?.id,
      sessionEntries: request.ctx.sessionManager.getEntries() as SessionEntry[],
      leafId: request.ctx.sessionManager.getLeafId(),
    });

    return applySpawnAgentProfile({
      requestedAgentType: request.requestedAgentType,
      profiles: resolveAgentProfiles({ includeHidden: true }).profiles,
      requestedModel: request.requestedModel?.trim() ? request.requestedModel : inheritedDefaults.model,
      requestedReasoningEffort: request.requestedReasoningEffort?.trim()
        ? request.requestedReasoningEffort
        : inheritedDefaults.reasoningEffort,
    });
  };

  const buildBaseRecord = (
    request: SpawnLifecycleRequest,
    agentId: string,
    transport: ChildTransport,
    appliedProfile: AppliedSpawnProfile,
    name: string,
    forkedSessionFile?: string,
  ): DurableChildRecord => ({
    agentId,
    transport,
    agentType: appliedProfile.agentType,
    cwd: request.ctx.cwd,
    model: appliedProfile.effectiveModel,
    name,
    ...(request.taskSummary ? { taskSummary: request.taskSummary } : {}),
    status: "live_running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parentSessionFile: request.ctx.sessionManager.getSessionFile(),
    ...(forkedSessionFile ? { sessionFile: forkedSessionFile } : {}),
  });

  const finalizeForegroundSpawn = async (
    agentId: string,
    attachment: LiveChildAttachment,
  ): Promise<AgentSnapshot> => {
    deps.incrementActiveWaits([agentId]);
    try {
      const agents = await deps.waitForReadySnapshots([agentId], { claim: true });
      return agents[0] ?? deps.childSnapshot(deps.requireDurableChild(agentId), attachment);
    } finally {
      deps.decrementActiveWaits([agentId]);
      deps.flushSuppressedNotifications([agentId]);
    }
  };

  const spawn = async (request: SpawnLifecycleRequest): Promise<SpawnLifecycleResult> => {
      const publicName = validateSubagentName(request.name);
      if (deps.findAddressableChildByName(publicName)) {
        throw new Error(`name is already in use: ${publicName}`);
      }

      const transport: ChildTransport = request.mode === "codex" && request.interactive ? "interactive" : "rpc";
      if (transport === "interactive" && !deps.isMuxAvailable()) {
        throw deps.muxUnavailableError();
      }

      const agentId = randomUUID();
      const appliedProfile = resolveAppliedProfile(request);
      const toolSet = await resolveSessionToolSet(
        request.ctx.sessionManager as {
          getBranch(): Array<{ type?: unknown; customType?: unknown; data?: unknown }>;
        },
        process.env,
      );
      const thinkingLevel = deps.normalizeReasoningEffortToThinkingLevel(
        appliedProfile.effectiveReasoningEffort,
      );
      const forkedSessionFile =
        request.mode === "codex" && request.forkContext
          ? deps.resolveForkContextSessionFile({
              sessionFile: request.ctx.sessionManager.getSessionFile(),
              leafId: request.ctx.sessionManager.getLeafId(),
              currentCwd: request.ctx.cwd,
              childCwd: request.ctx.cwd,
            })
          : undefined;
      const baseRecord = buildBaseRecord(
        request,
        agentId,
        transport,
        appliedProfile,
        publicName,
        forkedSessionFile,
      );

      deps.markActivitySubmitted(deps.childSnapshot(baseRecord), request.prompt);

      const { attachment, record: attachedRecord } =
        transport === "interactive"
          ? await deps.launchInteractiveChild({
              record: baseRecord,
              prompt: request.prompt,
              profileBootstrap: appliedProfile.bootstrap,
              toolSet,
              forkedSessionFile,
            })
          : await deps.attachChild(baseRecord, forkedSessionFile ? "fork" : "fresh", toolSet);

      try {
        let durableRecord: DurableChildRecord;
        if (transport === "rpc") {
          durableRecord = await deps.sendPromptToAttachment(
            attachment as RpcLiveChildAttachment,
            request.prompt,
            thinkingLevel,
          );
        } else {
          durableRecord = {
            ...attachedRecord,
            status: "live_running",
          };
        }

        deps.persistRegistryEvent(deps.entryTypes.create, durableRecord);
        deps.persistRegistryEvent(deps.entryTypes.attach, durableRecord);
        if (transport === "interactive") {
          deps.watchInteractiveAttachment(attachment as InteractiveLiveChildAttachment);
          deps.markActivityRunning(deps.childSnapshot(durableRecord, attachment));
        }

        if (request.runInBackground) {
          return {
            agentId,
            name: publicName,
            prompt: request.prompt,
            taskSummary: request.taskSummary,
            record: durableRecord,
            attachment,
          };
        }

        const completedAgent = await finalizeForegroundSpawn(agentId, attachment);
        return {
          agentId,
          name: publicName,
          prompt: request.prompt,
          taskSummary: request.taskSummary,
          record: durableRecord,
          attachment,
          completedAgent,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedRecord: DurableChildRecord = {
          ...baseRecord,
          status: "closed",
          lastError: message,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        deps.persistRegistryEvent(deps.entryTypes.create, failedRecord);
        deps.persistRegistryEvent(deps.entryTypes.close, failedRecord, { reason: "spawn_failed" });
        await deps.closeLiveAttachment(attachment, "discard").catch(() => undefined);
        throw error;
      }
    };

  const resume = async (request: ResumeLifecycleRequest): Promise<ResumeLifecycleResult> => {
      const attachment = await deps.ensureLiveAttachment(request.agentId);
      return await deps.queueAgentOperation(attachment, async () => {
        const record = deps.requireDurableChild(request.agentId);
        const agentName = record.name ?? request.agentId;
        if (record.status === "closed") {
          throw new Error(`Agent ${agentName} is already closed`);
        }
        if (record.status === "failed" && request.mode === "codex" && !deps.isInteractiveAttachment(attachment)) {
          throw new Error(record.lastError ?? `Agent ${agentName} is in a failed state`);
        }

        let commandType: "prompt" | "follow_up" | "steer" | "interactive_input";
        let submissionId: string;
        if (deps.isInteractiveAttachment(attachment)) {
          commandType = "interactive_input";
          deps.sendInteractiveInput(attachment, request.input);
          submissionId = `${request.agentId}:${Date.now()}`;
        } else {
          commandType =
            record.status === "live_running"
              ? request.mode === "codex"
                ? request.interrupt
                  ? "steer"
                  : "follow_up"
                : "follow_up"
              : "prompt";
          submissionId = await deps.sendAttachmentMessage(attachment, request.input, commandType);
        }

        const nextRecord = deps.updateDurableChild(
          request.agentId,
          {
            status: "live_running",
            lastError: undefined,
            ...(request.taskSummary ? { taskSummary: request.taskSummary } : {}),
          },
          { persistAs: deps.entryTypes.update },
        );
        const snapshot = deps.childSnapshot(nextRecord, attachment);
        deps.markActivitySubmitted(snapshot, request.input);

        return {
          submissionId,
          commandType,
          input: request.input,
          taskSummary: request.taskSummary,
          snapshot,
        };
      });
    };

  const wait = async (request: WaitLifecycleRequest): Promise<WaitLifecycleResult> => {
      deps.incrementActiveWaits(request.ids);
      let snapshots: AgentSnapshot[] = [];
      try {
        snapshots = await deps.waitForReadySnapshots(request.ids, {
          timeoutMs: request.timeoutMs,
          claim: true,
        });
      } finally {
        deps.decrementActiveWaits(request.ids);
        deps.flushSuppressedNotifications(request.ids);
      }

      return {
        snapshots,
        timedOut: snapshots.length === 0,
      };
    };

  const waitAny = async (request: { timeoutMs: number }): Promise<WaitLifecycleResult> => {
    const ids = deps.listWaitableChildIds();
    if (ids.length === 0) {
      throw new Error("No child agents are available to wait on");
    }
    return await wait({ ids, timeoutMs: request.timeoutMs });
  };

  const getSnapshot = (agentId: string): SnapshotLifecycleResult => {
    const record = deps.requireDurableChild(agentId);
    return {
      snapshot: deps.childSnapshot(record),
    };
  };

  const stop = async (agentId: string): Promise<StopLifecycleResult> => {
      const record = deps.requireDurableChild(agentId);
      const attachment = await deps.ensureLiveAttachment(agentId).catch(() => undefined);

      if (attachment) {
        return await deps.queueAgentOperation(attachment, async () => {
          await deps.closeLiveAttachment(attachment, "close");
          const nextRecord = deps.updateDurableChild(
            agentId,
            { status: "closed", closedAt: new Date().toISOString() },
            { persistAs: deps.entryTypes.close },
          );
          return {
            snapshot: deps.childSnapshot(nextRecord, attachment),
          };
        });
      }

      const closedRecord =
        record.status === "closed"
          ? record
          : deps.updateDurableChild(
              agentId,
              { status: "closed", closedAt: new Date().toISOString() },
              { persistAs: deps.entryTypes.close },
            );

      return {
        snapshot: deps.childSnapshot(closedRecord),
      };
    };

  const resolveAgentIdByName = (name: string, fieldName = "name"): string => {
    const publicName = validateSubagentName(name, fieldName);
    const record = deps.findAddressableChildByName(publicName);
    if (!record) {
      throw new Error(`Unknown ${fieldName}: ${publicName}`);
    }
    return record.agentId;
  };

  const resumeByName = async (
    request: Omit<ResumeLifecycleRequest, "agentId"> & { name: string },
  ): Promise<ResumeLifecycleResult> => {
    return await resume({
      ...request,
      agentId: resolveAgentIdByName(request.name),
    });
  };

  const waitByNames = async (request: {
    names: string[];
    timeoutMs: number;
  }): Promise<WaitLifecycleResult> => {
    const ids = [...new Set(request.names.map((name) => resolveAgentIdByName(name)))];
    return await wait({ ids, timeoutMs: request.timeoutMs });
  };

  const getSnapshotByName = (name: string): SnapshotLifecycleResult => {
    return getSnapshot(resolveAgentIdByName(name));
  };

  const stopByName = async (name: string): Promise<StopLifecycleResult> => {
    return await stop(resolveAgentIdByName(name));
  };

  return {
    spawn,
    resume,
    wait,
    waitAny,
    getSnapshot,
    stop,
    resolveAgentIdByName,
    resumeByName,
    waitByNames,
    getSnapshotByName,
    stopByName,
  };
}
