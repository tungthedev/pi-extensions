import {
  buildSessionContext,
  SessionManager,
  type ExtensionAPI,
  type SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import fs from "node:fs";
import path from "node:path";

import type {
  AgentSnapshot,
  DurableChildRecord,
  InteractiveLiveChildAttachment,
  LiveChildAttachment,
  RpcLiveChildAttachment,
  RpcResponse,
  SessionEntryLike,
  SubagentEntryType,
} from "./types.ts";

import { appendBounded, createLiveAttachment, resolveChildSessionDir } from "./attachment.ts";
import {
  closeSurface,
  createSurface,
  isMuxAvailable,
  pollForExit,
  sendInteractiveInput,
  sendShellCommand,
  selectPreservedInteractiveEnv,
  shellDoneSentinelCommand,
  shellExternalCommand,
} from "./interactive.ts";
import { validateSubagentName } from "./naming.ts";
import {
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  formatSubagentNotificationMessage,
  getSubagentNotificationDeliveryOptions,
  parseSubagentNotificationMessage,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
} from "./notifications.ts";
import { rebuildDurableRegistry } from "./persistence.ts";
import {
  resolveAgentProfiles,
} from "./profiles.ts";
import { childSnapshot } from "./registry.ts";
import {
  wrapInteractiveSpawnPrompt,
} from "./request-utils.ts";
import { shorten } from "./render.ts";
import {
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  summarizeSubagentReply,
  summarizeTaskRequest,
  truncateSubagentReply,
} from "./rendering.ts";
import {
  toPublicAgentSnapshot,
} from "./results.ts";
import {
  parseJsonLines,
  rejectPendingResponses,
  respondToUiRequest,
  sendRpcCommand,
} from "./rpc.ts";
import {
  extractLastAssistantText,
  extractLastAssistantTextFromSessionFile,
  isResumable,
} from "./session.ts";
import { createSubagentLifecycleService } from "./lifecycle-service.ts";
import { createSubagentRuntimeStore, isWaitableChild } from "./runtime-store.ts";
import { createReadySnapshotCoordinator } from "./ready-snapshot-coordinator.ts";
import { registerSubagentNotificationRenderers } from "./renderers.ts";
import { registerSubagentSessionEvents } from "./session-events.ts";
import { deriveDurableStatusFromState, resolvePostPromptDurableStatus } from "./state.ts";
import {
  isInteractiveAttachment,
  notifyStateChange,
  queueAgentOperation,
  waitForAnyStateChange,
  waitForStateChange,
} from "./live-attachment-utils.ts";
import { registerCodexToolAdapters } from "./tool-adapters-codex.ts";
import { registerTaskToolAdapters } from "./tool-adapters-task.ts";
import {
  AGENT_PROFILE_JSON_ENV,
  AGENT_PROFILE_NAME_ENV,
  CHILD_EXIT_GRACE_MS,
  CODEX_SUBAGENT_CHILD_ENV,
  SUBAGENT_CWD_ENV,
  CODEX_SUBAGENT_RESERVED_TOOL_NAMES,
  CODEX_SUBAGENT_TOOL_NAMES,
  INTERACTIVE_EXTENSION_ENTRY,
  INTERACTIVE_LAUNCHER_ENTRY,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_RESERVED_TOOL_NAMES,
  SUBAGENT_TOOL_NAMES,
  SUBAGENT_ENTRY_TYPES,
  TOOL_SET_OVERRIDE_ENV,
} from "./types.ts";
import {
  getWaitAgentResultTitle,
  MAX_WAIT_AGENT_TIMEOUT_MS,
  muxUnavailableError,
  normalizeWaitAgentTimeoutMs,
} from "./wait-utils.ts";

export function normalizeReasoningEffortToThinkingLevel(
  reasoningEffort: string | undefined,
): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const value = reasoningEffort?.trim().toLowerCase();
  if (!value) return undefined;

  switch (value) {
    case "none":
    case "off":
      return "off";
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      throw new Error(
        `Unsupported reasoning_effort: ${reasoningEffort}. Expected one of none, minimal, low, medium, high, xhigh, or off`,
      );
  }
}

export function normalizeThinkingLevelToReasoningEffort(
  thinkingLevel: string | undefined,
): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const value = thinkingLevel?.trim().toLowerCase();
  if (!value) return undefined;

  switch (value) {
    case "off":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      return undefined;
  }
}

export function resolveParentSpawnDefaults(options: {
  modelId?: string;
  sessionEntries?: SessionEntry[];
  leafId?: string | null;
}): { model?: string; reasoningEffort?: string } {
  const sessionContext = buildSessionContext(options.sessionEntries ?? [], options.leafId ?? null);
  const sessionModel =
    sessionContext.model?.provider && sessionContext.model?.modelId
      ? `${sessionContext.model.provider}/${sessionContext.model.modelId}`
      : sessionContext.model?.modelId;
  const model = options.modelId?.trim() || sessionModel || undefined;
  const reasoningEffort = normalizeThinkingLevelToReasoningEffort(sessionContext.thinkingLevel);

  return {
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

export function resolveForkContextSessionFile(options: {
  sessionFile?: string;
  leafId?: string | null;
  currentCwd: string;
  childCwd: string;
}): string {
  const sessionFile = options.sessionFile?.trim();
  if (!sessionFile) {
    throw new Error("fork_context requires a persisted current session file");
  }

  if (!fs.existsSync(sessionFile)) {
    throw new Error(
      "fork_context requires the current session to be flushed to disk; no session file exists yet",
    );
  }

  const leafId = options.leafId?.trim();
  if (!leafId) {
    throw new Error("fork_context requires a current session leaf");
  }

  const currentCwd = path.resolve(options.currentCwd);
  const childCwd = path.resolve(options.childCwd);
  if (childCwd !== currentCwd) {
    throw new Error(
      `fork_context is only supported when workdir matches the current cwd (${currentCwd})`,
    );
  }

  const sessionManager = SessionManager.open(sessionFile);
  const sessionCwd = path.resolve(sessionManager.getCwd());
  if (sessionCwd !== childCwd) {
    throw new Error(
      `fork_context is only supported when workdir matches the current session cwd (${sessionCwd})`,
    );
  }

  if (!sessionManager.getEntry(leafId)) {
    throw new Error(
      "fork_context requires the current leaf to exist in the persisted session file",
    );
  }

  const forkedSessionFile = sessionManager.createBranchedSession(leafId);
  if (!forkedSessionFile || !fs.existsSync(forkedSessionFile)) {
    throw new Error(
      "fork_context could not create a durable branched session file for the current leaf",
    );
  }

  return forkedSessionFile;
}

export function registerCodexSubagentTools(pi: ExtensionAPI) {
  const store = createSubagentRuntimeStore();

  const incrementActiveWaits = (ids: string[]) => {
    store.incrementActiveWaits(ids);
  };

  const decrementActiveWaits = (ids: string[]) => {
    store.decrementActiveWaits(ids);
  };

  const readySnapshots = createReadySnapshotCoordinator({
    store,
    childSnapshot,
    requireDurableChild: (agentId) => {
      const record = store.getDurableChild(agentId);
      if (!record) {
        throw new Error(`Unknown agent_id: ${agentId}`);
      }
      return record;
    },
    waitForAnyStateChange,
    maxWaitTimeoutMs: MAX_WAIT_AGENT_TIMEOUT_MS,
    sendNotification: (snapshot, taskSummary) => {
      const publicSnapshot = toPublicAgentSnapshot(snapshot);
      pi.sendMessage(
        {
          customType: SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
          content: formatSubagentNotificationMessage(snapshot, {
            taskSummary,
          }),
          display: true,
          details: taskSummary ? { ...publicSnapshot, task_summary: taskSummary } : publicSnapshot,
        },
        getSubagentNotificationDeliveryOptions(store.getParentIsStreaming()),
      );
    },
  });

  const resetCompletionTracking = (agentId: string) => {
    readySnapshots.resetCompletionTracking(agentId);
  };

  const waitForReadySnapshots = (
    ids: string[],
    options: { timeoutMs?: number; claim?: boolean } = {},
  ): Promise<AgentSnapshot[]> => readySnapshots.waitForReadySnapshots(ids, options);

  const persistRegistryEvent = (
    eventType: SubagentEntryType,
    record: DurableChildRecord,
    options: { reason?: string } = {},
  ) => {
    pi.appendEntry(eventType, {
      record,
      ...(options.reason ? { reason: options.reason } : {}),
    });
  };

  const replaceDurableRegistry = (records: Map<string, DurableChildRecord>) => {
    store.replaceDurableChildren(records);
  };

  const reconstructDurableRegistry = (entries: SessionEntryLike[]) => {
    replaceDurableRegistry(rebuildDurableRegistry(entries));
  };

  const requireDurableChild = (agentId: string): DurableChildRecord => {
    const record = store.getDurableChild(agentId);
    if (!record) {
      throw new Error(`Unknown agent_id: ${agentId}`);
    }
    return record;
  };

  const formatAgentErrorSubject = (
    agentId: string,
    record: DurableChildRecord | undefined = store.getDurableChild(agentId),
  ): string => {
    if (!record) {
      return `Agent ${agentId}`;
    }

    return `Agent ${getSubagentDisplayName({
      agent_id: agentId,
      agent_type: record.agentType,
      name: record.name,
    })}`;
  };

  const notifyParentOfChildStatus = (record: DurableChildRecord): void => {
    readySnapshots.notifyParentOfChildStatus(record);
  };

  const flushSuppressedNotifications = (ids: string[]) => {
    readySnapshots.flushSuppressedNotifications(ids);
  };
  registerSubagentNotificationRenderers(pi);

  const updateDurableChild = (
    agentId: string,
    patch: Partial<DurableChildRecord>,
    options: { persistAs?: SubagentEntryType; reason?: string } = {},
  ): DurableChildRecord => {
    const current = requireDurableChild(agentId);
    const next =
      patch.status === "live_running"
        ? store.markRunning(agentId, patch)
        : patch.status === "live_idle"
          ? store.markCompleted(agentId, patch)
          : patch.status === "failed"
            ? store.markFailed(agentId, patch)
            : patch.status === "closed"
              ? store.markClosed(agentId, patch)
              : (() => {
                  const updatedRecord: DurableChildRecord = {
                    ...current,
                    ...patch,
                    updatedAt: patch.updatedAt ?? new Date().toISOString(),
                  };
                  store.setDurableChild(agentId, updatedRecord);
                  return updatedRecord;
                })();
    if (!next) {
      return current;
    }
    if (next.status === "live_running") {
      resetCompletionTracking(agentId);
    }
    if (options.persistAs) {
      persistRegistryEvent(options.persistAs, next, { reason: options.reason });
    }
    if (next.status === "live_running") {
      store.syncActivityIdentity(next);
    } else {
      store.removeActivity(agentId);
    }
    return next;
  };

  const readChildState = async (
    attachment: RpcLiveChildAttachment,
  ): Promise<Record<string, unknown>> => {
    const response = await sendRpcCommand(attachment, { type: "get_state" });
    if (!response.success || !response.data) {
      throw new Error(response.error ?? `Failed to fetch state for agent ${attachment.agentId}`);
    }
    return response.data;
  };

  const maybeReadLastAssistantText = async (
    attachment: RpcLiveChildAttachment,
  ): Promise<string | undefined> => {
    const response = await sendRpcCommand(attachment, {
      type: "get_last_assistant_text",
    });
    if (!response.success) {
      return undefined;
    }
    const text = response.data?.text;
    return typeof text === "string" && text.trim().length > 0 ? text : undefined;
  };

  const updateFromGetState = (
    agentId: string,
    data: Record<string, unknown> | undefined,
    persistAs: SubagentEntryType = SUBAGENT_ENTRY_TYPES.update,
  ) => {
    if (!data) return requireDurableChild(agentId);

    const patch: Partial<DurableChildRecord> = {
      status: deriveDurableStatusFromState(data),
      lastError: undefined,
    };
    if (typeof data.sessionId === "string") {
      patch.sessionId = data.sessionId;
    }
    if (typeof data.sessionFile === "string") {
      patch.sessionFile = data.sessionFile;
    }
    return updateDurableChild(agentId, patch, { persistAs });
  };

  const bindAttachment = (attachment: RpcLiveChildAttachment) => {
    const handleDurablePatch = (
      patch: Partial<DurableChildRecord>,
      options: { persistAs?: SubagentEntryType; reason?: string } = {},
    ) => {
      if (!store.hasDurableChild(attachment.agentId)) return;
      updateDurableChild(attachment.agentId, patch, options);
    };

    const handleRpcMessage = (rawMessage: string): void => {
      if (!rawMessage.trim()) return;

      let message: Record<string, unknown>;
      try {
        message = JSON.parse(rawMessage) as Record<string, unknown>;
      } catch (error) {
        handleDurablePatch(
          {
            status: "failed",
            lastError: `Failed to parse RPC output: ${String(error)}`,
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );
        notifyStateChange(attachment);
        return;
      }

      const type = typeof message.type === "string" ? message.type : undefined;

      if (type === "response") {
        const response = message as RpcResponse;
        const responseId = response.id;
        if (responseId) {
          const pending = attachment.pendingResponses.get(responseId);
          if (pending) {
            attachment.pendingResponses.delete(responseId);
            pending.resolve(response);
          }
        }
        return;
      }

      if (type === "extension_ui_request") {
        respondToUiRequest(attachment, message);
        return;
      }

      attachment.lastLiveAt = Date.now();

      if (type === "agent_start") {
        store.markActivityRunning(store.getActivityIdentity(attachment.agentId));
        handleDurablePatch(
          {
            status: "live_running",
            lastError: undefined,
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );
        notifyStateChange(attachment);
        return;
      }

      if (type === "tool_execution_start") {
        const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
        const toolName = typeof message.toolName === "string" ? message.toolName : undefined;
        if (toolCallId && toolName) {
          store.markToolExecutionStart(
            store.getActivityIdentity(attachment.agentId),
            toolCallId,
            toolName,
          );
        }
        return;
      }

      if (type === "tool_execution_end") {
        const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
        const toolName = typeof message.toolName === "string" ? message.toolName : undefined;
        if (toolCallId) {
          store.markToolExecutionEnd(attachment.agentId, toolCallId, toolName);
        }
        return;
      }

      if (type === "agent_end") {
        const assistantText = extractLastAssistantText(message.messages);
        const nextRecord = updateDurableChild(
          attachment.agentId,
          {
            status: "live_idle",
            ...(assistantText ? { lastAssistantText: assistantText } : {}),
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );
        notifyParentOfChildStatus(nextRecord);
        notifyStateChange(attachment);
        return;
      }

      if (type === "extension_error") {
        const eventName = typeof message.event === "string" ? message.event : "extension";
        const errorText =
          typeof message.error === "string" ? message.error : "Unknown extension error";
        handleDurablePatch(
          {
            lastError: `${eventName}: ${errorText}`,
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );
        notifyStateChange(attachment);
        return;
      }

      if (type === "message_end") {
        const assistantText = extractLastAssistantText([message.message]);
        if (assistantText) {
          handleDurablePatch(
            {
              lastAssistantText: assistantText,
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.update },
          );
          notifyStateChange(attachment);
        }
      }
    };

    attachment.stdoutBuffer = "";

    attachment.process.stdout.on("data", (chunk) => {
      attachment.stdoutBuffer += attachment.stdoutDecoder.write(chunk);
      const parsed = parseJsonLines(attachment.stdoutBuffer);
      attachment.stdoutBuffer = parsed.rest;
      for (const line of parsed.lines) {
        handleRpcMessage(line);
      }
    });

    attachment.process.stderr.on("data", (chunk) => {
      attachment.stderr = appendBounded(attachment.stderr, chunk.toString());
    });

    attachment.process.on("error", (error) => {
      attachment.lastLiveAt = Date.now();
      rejectPendingResponses(attachment, error);
      if (attachment.closingDisposition !== "discard") {
        const nextRecord = updateDurableChild(
          attachment.agentId,
          {
            status:
              attachment.closingDisposition === "close"
                ? "closed"
                : attachment.closingDisposition === "detach"
                  ? "detached"
                  : "failed",
            lastError: error.message,
          },
          {
            persistAs:
              attachment.closingDisposition === "close"
                ? SUBAGENT_ENTRY_TYPES.close
                : SUBAGENT_ENTRY_TYPES.update,
          },
        );
        notifyParentOfChildStatus(nextRecord);
      }
      store.deleteLiveAttachment(attachment.agentId);
      store.removeActivity(attachment.agentId);
      notifyStateChange(attachment);
    });

    attachment.process.on("exit", (code, signal) => {
      const tail = attachment.stdoutDecoder.end();
      if (tail) {
        attachment.stdoutBuffer += tail;
      }
      if (attachment.stdoutBuffer.trim()) {
        handleRpcMessage(attachment.stdoutBuffer);
        attachment.stdoutBuffer = "";
      }

      attachment.exitCode = code ?? null;
      attachment.lastLiveAt = Date.now();
      rejectPendingResponses(attachment, new Error(`Agent ${attachment.agentId} exited`));
      store.deleteLiveAttachment(attachment.agentId);

      const record = store.getDurableChild(attachment.agentId);
      if (record) {
        if (attachment.closingDisposition === "close") {
          store.setDurableChild(attachment.agentId, {
            ...record,
            status: "closed",
            closedAt: record.closedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else if (attachment.closingDisposition === "detach") {
          store.setDurableChild(attachment.agentId, {
            ...record,
            status: "detached",
            updatedAt: new Date().toISOString(),
          });
        } else if (attachment.closingDisposition !== "discard") {
          const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
          const nextRecord = updateDurableChild(
            attachment.agentId,
            {
              status: code === 0 ? "detached" : "failed",
              lastError:
                code === 0 && !record.lastError
                  ? record.lastError
                  : (record.lastError ?? `Child agent exited with ${reason}`),
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.update },
          );
          notifyParentOfChildStatus(nextRecord);
        }
      }

      store.removeActivity(attachment.agentId);
      notifyStateChange(attachment);
    });
  };

  const launchInteractiveChild = async (options: {
    record: DurableChildRecord;
    prompt: string;
    profileBootstrap: {
      name: string;
      developerInstructions?: string;
      model?: string;
      reasoningEffort?: string;
      source: string;
    };
    toolSet: "pi" | "codex" | "droid";
    forkedSessionFile?: string;
  }): Promise<{
    attachment: InteractiveLiveChildAttachment;
    record: DurableChildRecord;
  }> => {
    if (!isMuxAvailable()) {
      throw muxUnavailableError();
    }

    const childSessionDir = resolveChildSessionDir();
    const sessionFile =
      options.forkedSessionFile ??
      path.join(childSessionDir, `${options.record.agentId}-${Date.now().toString(36)}.jsonl`);
    const promptDir = path.join(childSessionDir, "prompts");
    const configDir = path.join(childSessionDir, "launchers");
    const promptFile = path.join(promptDir, `${options.record.agentId}-${Date.now()}.md`);
    const configFile = path.join(configDir, `${options.record.agentId}-${Date.now()}.json`);
    const wrappedPrompt = wrapInteractiveSpawnPrompt(options.prompt);
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(promptDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(promptFile, wrappedPrompt, "utf8");

    const surface = createSurface(options.record.name ?? options.record.agentId);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    const piArgs = [
      "--session",
      sessionFile,
      "--session-dir",
      childSessionDir,
      "--no-extensions",
      "-e",
      INTERACTIVE_EXTENSION_ENTRY,
    ];

    if (options.record.model && !options.forkedSessionFile) {
      piArgs.push("--model", options.record.model);
    }

    const developerInstructions = options.profileBootstrap.developerInstructions?.trim();
    if (developerInstructions) {
      piArgs.push("--append-system-prompt", developerInstructions);
    }

    piArgs.push(`@${promptFile}`);

    const launcherConfig = {
      binary: process.env.PI_BINARY || "pi",
      args: piArgs,
      cwd: options.record.cwd,
      extraEnv: {
        ...selectPreservedInteractiveEnv(),
        FORCE_COLOR: "0",
        PI_SUBAGENT_PROJECT_ROOT: process.env.PI_SUBAGENT_PROJECT_ROOT ?? process.cwd(),
        PI_CODEX_PROJECT_ROOT: process.env.PI_CODEX_PROJECT_ROOT ?? process.cwd(),
        [SUBAGENT_CWD_ENV]: options.record.cwd,
        [SUBAGENT_CHILD_ENV]: "1",
        [CODEX_SUBAGENT_CHILD_ENV]: "1",
        [AGENT_PROFILE_NAME_ENV]: options.profileBootstrap.name,
        PI_CODEX_AGENT_PROFILE_NAME: options.profileBootstrap.name,
        [AGENT_PROFILE_JSON_ENV]: JSON.stringify(options.profileBootstrap),
        PI_CODEX_AGENT_PROFILE_JSON: JSON.stringify(options.profileBootstrap),
        [TOOL_SET_OVERRIDE_ENV]: options.toolSet,
      },
      cleanupPaths: [promptFile],
    };
    fs.writeFileSync(configFile, JSON.stringify(launcherConfig), "utf8");

    const command =
      `${shellExternalCommand(process.execPath, [INTERACTIVE_LAUNCHER_ENTRY, configFile])}; ` +
      shellDoneSentinelCommand();
    sendShellCommand(surface, command);

    const attachment: InteractiveLiveChildAttachment = {
      agentId: options.record.agentId,
      transport: "interactive",
      surface,
      sessionFile,
      abortController: new AbortController(),
      stateWaiters: [],
      operationQueue: Promise.resolve(),
      lastLiveAt: Date.now(),
    };

    const nextRecord = {
      ...options.record,
      sessionFile,
      updatedAt: new Date().toISOString(),
    };

    store.attach(nextRecord, attachment);

    return {
      attachment,
      record: nextRecord,
    };
  };

  const watchInteractiveAttachment = (attachment: InteractiveLiveChildAttachment): void => {
    void pollForExit(attachment.surface, attachment.abortController.signal, {
      interval: 1_000,
      onTick() {
        attachment.lastLiveAt = Date.now();
      },
    })
      .then((exitCode) => {
        attachment.exitCode = exitCode;
        attachment.lastLiveAt = Date.now();

        let nextRecord: DurableChildRecord | undefined;
        const record = store.getDurableChild(attachment.agentId);
        const lastAssistantText = fs.existsSync(attachment.sessionFile)
          ? extractLastAssistantTextFromSessionFile(attachment.sessionFile)
          : undefined;

        if (record) {
          nextRecord = updateDurableChild(
            attachment.agentId,
            {
              status: exitCode === 0 ? "live_idle" : "failed",
              lastError: exitCode === 0 ? undefined : `Interactive child exited with code ${exitCode}`,
              ...(lastAssistantText ? { lastAssistantText } : {}),
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.update },
          );
        }

        store.deleteLiveAttachment(attachment.agentId);
        try {
          closeSurface(attachment.surface);
        } catch {
          // Optional.
        }
        if (nextRecord) {
          notifyParentOfChildStatus(nextRecord);
        }
      })
      .catch((error) => {
        attachment.lastLiveAt = Date.now();
        const record = store.getDurableChild(attachment.agentId);
        if (!record) {
          store.deleteLiveAttachment(attachment.agentId);
          notifyStateChange(attachment);
          return;
        }

        if (attachment.closingDisposition === "close") {
          updateDurableChild(
            attachment.agentId,
            {
              status: "closed",
              closedAt: record.closedAt ?? new Date().toISOString(),
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.close },
          );
        } else if (attachment.closingDisposition === "detach") {
          if (!attachment.detachPersisted) {
            updateDurableChild(
              attachment.agentId,
              {
                status: "detached",
              },
              { persistAs: SUBAGENT_ENTRY_TYPES.detach },
            );
          }
        } else if (attachment.closingDisposition !== "discard") {
          const nextRecord = updateDurableChild(
            attachment.agentId,
            {
              status: "failed",
              lastError: error instanceof Error ? error.message : String(error),
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.update },
          );
          notifyParentOfChildStatus(nextRecord);
        }

        store.deleteLiveAttachment(attachment.agentId);
      })
      .finally(() => {
        store.removeActivity(attachment.agentId);
        notifyStateChange(attachment);
      });
  };

  const persistInteractiveDetach = (attachment: InteractiveLiveChildAttachment): void => {
    if (attachment.detachPersisted) {
      return;
    }

    const record = store.getDurableChild(attachment.agentId);
    if (record && record.status !== "detached") {
      updateDurableChild(
        attachment.agentId,
        {
          status: "detached",
          lastError: undefined,
        },
        { persistAs: SUBAGENT_ENTRY_TYPES.detach },
      );
    }
    attachment.detachPersisted = true;
  };

  const attachChild = async (
    record: DurableChildRecord,
    mode: "fresh" | "resume" | "fork",
    toolSet?: "pi" | "codex" | "droid",
  ): Promise<{
    attachment: RpcLiveChildAttachment;
    record: DurableChildRecord;
  }> => {
    const resolvedProfiles = resolveAgentProfiles({ includeHidden: true });
    const profile = record.agentType ? resolvedProfiles.profiles.get(record.agentType) : undefined;
    const attachment = createLiveAttachment({
      agentId: record.agentId,
      cwd: record.cwd,
      model: mode === "fresh" ? record.model : undefined,
      profileBootstrap: profile
        ? {
            name: profile.name,
            developerInstructions: profile.developerInstructions,
            model: profile.model,
            reasoningEffort: profile.reasoningEffort,
            source: profile.source,
          }
        : undefined,
      sessionFile: mode === "fresh" ? undefined : record.sessionFile,
      toolSet,
    });
    store.attach(record, attachment);
    bindAttachment(attachment);

    try {
      const state = await readChildState(attachment);
      const sessionFile = state.sessionFile;
      if (typeof sessionFile !== "string" || sessionFile.trim().length === 0) {
        throw new Error(`Agent ${record.name ?? "subagent"} did not expose a durable session file`);
      }

      const nextRecord = store.hasDurableChild(record.agentId)
        ? updateFromGetState(
            record.agentId,
            state,
            mode === "resume" ? SUBAGENT_ENTRY_TYPES.attach : SUBAGENT_ENTRY_TYPES.update,
          )
        : {
            ...record,
            status: deriveDurableStatusFromState(state),
            sessionId: typeof state.sessionId === "string" ? state.sessionId : undefined,
            sessionFile,
            updatedAt: new Date().toISOString(),
          };

      if (!store.hasDurableChild(record.agentId)) {
        store.setDurableChild(record.agentId, nextRecord);
      }

      return { attachment, record: nextRecord };
    } catch (error) {
      await closeLiveAttachment(attachment, "discard").catch(() => undefined);
      store.deleteLiveAttachment(record.agentId);
      throw error;
    }
  };

  const ensureLiveAttachment = async (agentId: string): Promise<LiveChildAttachment> => {
    const existingAttachment = store.getLiveAttachment(agentId);
    if (existingAttachment) {
      return existingAttachment;
    }

    const record = requireDurableChild(agentId);
    if (record.transport === "interactive") {
      throw new Error(
        `${formatAgentErrorSubject(agentId, record)} is not currently attached. Interactive children can only be controlled while their parent session is still watching them.`,
      );
    }

    const inFlightResume = store.getResumeOperation(agentId);
    if (inFlightResume) {
      return await inFlightResume;
    }

    const resumeOperation = (async () => {
      const currentRecord = requireDurableChild(agentId);
      const agentSubject = formatAgentErrorSubject(agentId, currentRecord);
      if (currentRecord.status === "closed") {
        throw new Error(`${agentSubject} is already closed`);
      }
      if (!currentRecord.sessionFile) {
        throw new Error(`${agentSubject} is not live and has no durable session_file`);
      }
      if (!isResumable(currentRecord)) {
        if (currentRecord.status === "failed") {
          throw new Error(currentRecord.lastError ?? `${agentSubject} is in a failed state`);
        }
        throw new Error(
          `${agentSubject} cannot be resumed because its durable session_file is missing or not yet persisted to disk`,
        );
      }

      const expectedSessionId = currentRecord.sessionId;
      const { attachment } = await attachChild(currentRecord, "resume");
      const attachedRecord = requireDurableChild(agentId);
      if (
        expectedSessionId &&
        attachedRecord.sessionId &&
        attachedRecord.sessionId !== expectedSessionId
      ) {
        const mismatchError =
          `${agentSubject} resumed with unexpected session_id ${attachedRecord.sessionId} ` +
          `(expected ${expectedSessionId}); refusing to attach a fresh child session`;
        await closeLiveAttachment(attachment, "discard").catch(() => undefined);
        store.deleteLiveAttachment(agentId);
        updateDurableChild(
          agentId,
          {
            status: "failed",
            lastError: mismatchError,
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );
        throw new Error(mismatchError);
      }

      const lastAssistantText = await maybeReadLastAssistantText(attachment);
      const resumedRecord = lastAssistantText
        ? updateDurableChild(
            agentId,
            { lastAssistantText, lastError: undefined },
            { persistAs: SUBAGENT_ENTRY_TYPES.update },
          )
        : requireDurableChild(agentId);
      const resumedSnapshot = childSnapshot(resumedRecord, attachment);
      if (resumedSnapshot.status === "running") {
        store.markActivityRunning(resumedSnapshot);
      }

      return attachment;
    })();

    store.setResumeOperation(agentId, resumeOperation);
    try {
      return await resumeOperation;
    } finally {
      store.clearResumeOperation(agentId, resumeOperation);
    }
  };

  const closeLiveAttachment = async (
    attachment: LiveChildAttachment,
    disposition: NonNullable<LiveChildAttachment["closingDisposition"]>,
  ): Promise<void> => {
    if (attachment.exitCode !== undefined) return;

    attachment.closingDisposition = disposition;
    attachment.lastLiveAt = Date.now();

    if (isInteractiveAttachment(attachment)) {
      if (disposition === "detach") {
        persistInteractiveDetach(attachment);
      }
      attachment.abortController.abort();
      if (disposition === "close") {
        try {
          closeSurface(attachment.surface);
        } catch {
          // Ignore shutdown errors.
        }
      }
      await waitForStateChange(attachment, CHILD_EXIT_GRACE_MS);
      return;
    }

    try {
      await sendRpcCommand(attachment, { type: "abort" }, 1_000).catch(() => undefined);
    } catch {
      // Ignore shutdown errors.
    }

    attachment.process.kill("SIGTERM");
    await waitForStateChange(attachment, CHILD_EXIT_GRACE_MS);

    if (attachment.exitCode === undefined) {
      attachment.process.kill("SIGKILL");
      await waitForStateChange(attachment, 250);
    }
  };

  const closeAllLiveAttachments = async (reason: "session_change" | "shutdown") => {
    const activeAttachments = store.listLiveAttachments();
    for (const attachment of activeAttachments) {
      const disposition = isInteractiveAttachment(attachment)
        ? "detach"
        : reason === "session_change"
          ? "close"
          : "discard";
      await closeLiveAttachment(attachment, disposition);

      if (!isInteractiveAttachment(attachment)) {
        store.deleteLiveAttachment(attachment.agentId);
        store.removeActivity(attachment.agentId);

        const record = store.getDurableChild(attachment.agentId);
        if (record && record.status !== "closed") {
          store.setDurableChild(attachment.agentId, {
            ...record,
            status: reason === "session_change" ? "closed" : record.status,
            closedAt:
              reason === "session_change"
                ? (record.closedAt ?? new Date().toISOString())
                : record.closedAt,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  };

  const sendPromptToAttachment = async (
    attachment: RpcLiveChildAttachment,
    prompt: string,
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
  ): Promise<DurableChildRecord> => {
    if (thinkingLevel) {
      const thinkingResponse = await sendRpcCommand(attachment, {
        type: "set_thinking_level",
        level: thinkingLevel,
      });
      if (!thinkingResponse.success) {
        throw new Error(
          thinkingResponse.error ?? `Failed to set child reasoning level to ${thinkingLevel}`,
        );
      }
    }

    const response = await sendRpcCommand(attachment, {
      type: "prompt",
      message: prompt,
    });
    if (!response.success) {
      throw new Error(response.error ?? "Failed to start child agent");
    }

    // A fresh child often still reports an idle state for a moment after the
    // prompt RPC succeeds. Mark it running immediately so foreground spawns do
    // not consume that stale idle snapshot as if the task had already finished.
    const runningRecord = updateDurableChild(attachment.agentId, {
      status: "live_running",
      lastError: undefined,
    });
    store.markActivityRunning(childSnapshot(runningRecord, attachment));

    const state = await readChildState(attachment);
    const lastAssistantText = await maybeReadLastAssistantText(attachment);
    const currentRecord = requireDurableChild(attachment.agentId);
    const durableRecord: DurableChildRecord = {
      ...currentRecord,
      status: resolvePostPromptDurableStatus({
        currentStatus: currentRecord.status,
        state,
      }),
      sessionId: typeof state.sessionId === "string" ? state.sessionId : undefined,
      sessionFile: typeof state.sessionFile === "string" ? state.sessionFile : undefined,
      ...(lastAssistantText ? { lastAssistantText } : {}),
      updatedAt: new Date().toISOString(),
    };

    if (!durableRecord.sessionFile) {
      throw new Error(
        `Spawned agent ${durableRecord.name ?? "subagent"} did not produce a session_file`,
      );
    }

    store.setDurableChild(attachment.agentId, durableRecord);
    store.setLiveAttachment(attachment.agentId, attachment);
    return durableRecord;
  };

  const sendAttachmentMessage = async (
    attachment: LiveChildAttachment,
    input: string,
    commandType: "prompt" | "follow_up" | "steer",
  ): Promise<string> => {
    const response = await sendRpcCommand(attachment as RpcLiveChildAttachment, {
      type: commandType,
      message: input,
    });
    if (!response.success) {
      throw new Error(response.error ?? `Failed to ${commandType} child agent`);
    }
    return response.id ?? `${attachment.agentId}:${Date.now()}`;
  };

  const lifecycle = createSubagentLifecycleService({
    resolveParentSpawnDefaults,
    normalizeReasoningEffortToThinkingLevel,
    resolveForkContextSessionFile,
    findAddressableChildByName: (name) => store.findChildByPublicName(name),
    attachChild,
    launchInteractiveChild,
    watchInteractiveAttachment,
    sendPromptToAttachment,
    ensureLiveAttachment,
    requireDurableChild,
    updateDurableChild,
    childSnapshot,
    queueAgentOperation,
    isInteractiveAttachment,
    sendInteractiveInput: (attachment, input) => sendInteractiveInput((attachment as InteractiveLiveChildAttachment).surface, input),
    sendAttachmentMessage,
    closeLiveAttachment,
    listWaitableChildIds: () =>
      Array.from(store.durableChildValues())
        .filter((record) =>
          isWaitableChild(record, {
            hasUnconsumedCompletion:
              store.getCompletionVersion(record.agentId) >
              store.getConsumedCompletionVersion(record.agentId),
          }),
        )
        .map((record) => record.agentId),
    waitForReadySnapshots,
    incrementActiveWaits,
    decrementActiveWaits,
    flushSuppressedNotifications,
    markActivitySubmitted: (snapshot, prompt) => store.markActivitySubmitted(snapshot, prompt),
    markActivityRunning: (snapshot) => store.markActivityRunning(snapshot),
    persistRegistryEvent,
    entryTypes: SUBAGENT_ENTRY_TYPES,
    isMuxAvailable,
    muxUnavailableError,
  });
  registerSubagentSessionEvents(pi, {
    store,
    closeAllLiveAttachments,
    reconstructDurableRegistry,
  });

  registerCodexToolAdapters(pi, {
    lifecycle,
    renderSpawnPromptPreview: (prompt, theme) => new Text(theme.fg("dim", shorten(prompt, 140)), 0, 0),
    normalizeWaitAgentTimeoutMs,
  });

  void SUBAGENT_RESERVED_TOOL_NAMES;
  void CODEX_SUBAGENT_RESERVED_TOOL_NAMES;

  registerTaskToolAdapters(pi, {
    lifecycle,
    normalizeWaitAgentTimeoutMs,
  });
}

export {
  childSnapshot,
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  parseSubagentNotificationMessage,
  rebuildDurableRegistry,
  isResumable,
  parseJsonLines,
  extractLastAssistantText,
  deriveDurableStatusFromState,
  wrapInteractiveSpawnPrompt,
  summarizeSubagentReply,
  summarizeTaskRequest,
  truncateSubagentReply,
  getWaitAgentResultTitle,
  normalizeWaitAgentTimeoutMs,
  validateSubagentName,
};
export {
  AGENT_PROFILE_JSON_ENV,
  AGENT_PROFILE_NAME_ENV,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  SUBAGENT_RESERVED_TOOL_NAMES,
  SUBAGENT_TOOL_NAMES,
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  CODEX_SUBAGENT_RESERVED_TOOL_NAMES,
  CODEX_SUBAGENT_TOOL_NAMES,
  formatSubagentNotificationMessage,
};
export { buildSendMessageContent, buildSpawnAgentContent } from "./results.ts";
export { buildWaitAgentContent } from "./notifications.ts";
export type { AgentSnapshot, DurableChildRecord, LiveChildAttachment };
export type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles.ts";
export type { AppliedSpawnProfile, ChildProfileBootstrap } from "./profiles-apply.ts";
export {
  buildSpawnAgentTypeDescription,
  clearResolvedAgentProfilesCache,
  loadCustomAgentProfiles,
  parseCodexRoleDeclarations,
  parseCodexRoleFile,
  parseBundledRoleAsset,
  resolveAgentProfiles,
  resolveBuiltInAgentProfiles,
  resolveCodexConfigPath,
} from "./profiles.ts";
export { applySpawnAgentProfile, resolveRequestedAgentType } from "./profiles-apply.ts";

export const registerSubagentTools = registerCodexSubagentTools;
