import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildSessionContext,
  getMarkdownTheme,
  SessionManager,
  type ExtensionAPI,
  type SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { appendBounded, createLiveAttachment } from "./attachment.ts";
import { generateUniqueSubagentName, resolveSubagentName } from "./naming.ts";
import {
  buildWaitAgentContent,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  formatSubagentNotificationMessage,
  parseSubagentNotificationMessage,
} from "./notifications.ts";
import { buildSendInputContent, buildSpawnAgentContent } from "./results.ts";
import {
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  formatSubagentModelLabel,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  summarizeSubagentReply,
  truncateSubagentReply,
} from "./rendering.ts";
import { rebuildDurableRegistry } from "./persistence.ts";
import { applySpawnAgentProfile, resolveRequestedAgentType } from "./profiles-apply.ts";
import { buildSpawnAgentTypeDescription, clearResolvedAgentProfilesCache, resolveAgentProfiles } from "./profiles.ts";
import { conciseResult, shorten } from "./render.ts";
import { childSnapshot } from "./registry.ts";
import { parseJsonLines, rejectPendingResponses, respondToUiRequest, sendRpcCommand } from "./rpc.ts";
import { extractLastAssistantText, isResumable } from "./session.ts";
import { deriveDurableStatusFromState } from "./state.ts";
import type {
  AgentSnapshot,
  DurableChildRecord,
  LiveChildAttachment,
  RpcResponse,
  SessionEntryLike,
  SubagentEntryType,
} from "./types.ts";
import {
  CHILD_EXIT_GRACE_MS,
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_RESERVED_TOOL_NAMES,
  CODEX_SUBAGENT_TOOL_NAMES,
  SUBAGENT_ENTRY_TYPES,
} from "./types.ts";

function notifyStateChange(attachment: LiveChildAttachment): void {
  const waiters = attachment.stateWaiters.splice(0, attachment.stateWaiters.length);
  for (const waiter of waiters) waiter();
}

function queueAgentOperation<T>(
  attachment: LiveChildAttachment,
  operation: () => Promise<T>,
): Promise<T> {
  const run = attachment.operationQueue.then(operation, operation);
  attachment.operationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function waitForStateChange(attachment: LiveChildAttachment, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => {
        attachment.stateWaiters = attachment.stateWaiters.filter((waiter) => waiter !== onChange);
        resolve();
      },
      Math.max(1, timeoutMs),
    );

    const onChange = () => {
      clearTimeout(timer);
      resolve();
    };

    attachment.stateWaiters.push(onChange);
  });
}

type CollabInputItem = {
  type?: string;
  text?: string;
  image_url?: string;
  path?: string;
  name?: string;
};

const CollabInputItemSchema = Type.Object({
  type: Type.Optional(
    Type.String({ description: "Input item type: text, image, local_image, skill, or mention." }),
  ),
  text: Type.Optional(Type.String({ description: "Text content when type is text." })),
  image_url: Type.Optional(Type.String({ description: "Image URL when type is image." })),
  path: Type.Optional(
    Type.String({
      description:
        "Path when type is local_image/skill, or structured mention target when type is mention.",
    }),
  ),
  name: Type.Optional(Type.String({ description: "Display name when type is skill or mention." })),
});

function resolveAgentIdAlias(params: { id?: string; agent_id?: string }, fieldName = "id"): string {
  const value = (params.id ?? params.agent_id ?? "").trim();
  if (!value) throw new Error(`${fieldName} is required`);
  return value;
}

function resolveAgentIdsAlias(params: {
  id?: string;
  agent_id?: string;
  ids?: string[];
  agent_ids?: string[];
}): string[] {
  return [
    ...new Set(
      [params.id, params.agent_id, ...(params.ids ?? []), ...(params.agent_ids ?? [])]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function flattenCollabItems(items: CollabInputItem[] | undefined): string | undefined {
  if (!items?.length) return undefined;

  const lines = items
    .map((item) => {
      if (item.type === "text" && item.text?.trim()) return item.text.trim();
      if (item.type === "image" && item.image_url?.trim()) return `image: ${item.image_url.trim()}`;
      if (item.type === "local_image" && item.path?.trim()) return `local_image: ${item.path.trim()}`;
      if (item.type === "skill") return `skill: ${item.name?.trim() || item.path?.trim() || "skill"}`;
      if (item.type === "mention") {
        return `mention: ${item.name?.trim() || item.path?.trim() || "mention"}`;
      }

      return [item.text, item.name, item.path, item.image_url]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
        .join(" ");
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function resolveSpawnPrompt(params: {
  task?: string;
  context?: string;
  message?: string;
  items?: CollabInputItem[];
}): string {
  const prompt = [
    params.context?.trim(),
    params.task?.trim(),
    params.message?.trim(),
    flattenCollabItems(params.items),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();

  if (!prompt) {
    throw new Error("task, message, or items is required");
  }

  return prompt;
}

function spawnNameSeed(params: {
  task?: string;
  context?: string;
  message?: string;
  items?: CollabInputItem[];
  agent_type?: string;
  model?: string;
  reasoning_effort?: string;
  workdir?: string;
}): string {
  return JSON.stringify({
    task: params.task ?? null,
    context: params.context ?? null,
    message: params.message ?? null,
    items: params.items ?? null,
    agent_type: params.agent_type ?? null,
    model: params.model ?? null,
    reasoning_effort: params.reasoning_effort ?? null,
    workdir: params.workdir ?? null,
  });
}

function extractSnapshotDetails(
  details: { status?: AgentSnapshot } | AgentSnapshot | undefined,
): AgentSnapshot | undefined {
  if (!details) return undefined;
  if ("agent_id" in details) return details;
  if (details.status && typeof details.status === "object" && "agent_id" in details.status) {
    return details.status;
  }
  return undefined;
}

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
  const model = options.modelId?.trim() || sessionContext.model?.modelId || undefined;
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
  const durableChildrenById = new Map<string, DurableChildRecord>();
  const liveAttachmentsById = new Map<string, LiveChildAttachment>();
  let parentIsStreaming = false;
  let activeSessionFile: string | undefined;

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
    durableChildrenById.clear();
    for (const [agentId, record] of records) {
      durableChildrenById.set(agentId, record);
    }
  };

  const reconstructDurableRegistry = (entries: SessionEntryLike[]) => {
    replaceDurableRegistry(rebuildDurableRegistry(entries));
  };

  const requireDurableChild = (agentId: string): DurableChildRecord => {
    const record = durableChildrenById.get(agentId);
    if (!record) {
      throw new Error(`Unknown agent_id: ${agentId}`);
    }
    return record;
  };

  const requireLiveAttachment = (agentId: string): LiveChildAttachment => {
    const attachment = liveAttachmentsById.get(agentId);
    if (!attachment) {
      const record = requireDurableChild(agentId);
      if (record.status === "closed") {
        throw new Error(`Agent ${agentId} is already closed`);
      }
      if (record.status === "detached") {
        throw new Error(`Agent ${agentId} is detached; call resume_agent first`);
      }
      if (record.status === "failed") {
        if (isResumable(record)) {
          throw new Error(`Agent ${agentId} is failed/detached; call resume_agent first`);
        }
        throw new Error(record.lastError ?? `Agent ${agentId} is in a failed state`);
      }
      throw new Error(`Agent ${agentId} is not live`);
    }
    return attachment;
  };

  const shouldNotifyParent = (record: DurableChildRecord): boolean => {
    if (record.status !== "live_idle" && record.status !== "failed") {
      return false;
    }

    return !activeSessionFile || !record.parentSessionFile
      ? true
      : activeSessionFile === record.parentSessionFile;
  };

  const notifyParentOfChildStatus = (record: DurableChildRecord): void => {
    if (!shouldNotifyParent(record)) return;

    const snapshot = childSnapshot(record);
    pi.sendMessage(
      {
        customType: CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
        content: formatSubagentNotificationMessage(snapshot),
        display: true,
        details: snapshot,
      },
      parentIsStreaming ? { deliverAs: "nextTurn" } : undefined,
    );
  };

  pi.registerMessageRenderer<AgentSnapshot>(
    CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
    (message, { expanded }, theme) => {
      const messageContent = typeof message.content === "string" ? message.content : undefined;
      const snapshot =
        extractSnapshotDetails(message.details as AgentSnapshot | { status?: AgentSnapshot } | undefined) ??
        parseSubagentNotificationMessage(messageContent);
      if (!snapshot) {
        return new Text(messageContent ?? "", 0, 0);
      }

      const displayName = getSubagentDisplayName(snapshot);
      const statusColor =
        snapshot.status === "idle"
          ? "success"
          : snapshot.status === "failed"
            ? "error"
            : snapshot.status === "timeout"
              ? "warning"
              : "muted";
      const summary =
        snapshot.last_error ??
        summarizeSubagentReply(
          snapshot.last_assistant_text,
          expanded ? 600 : MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
        );
      let detail = `${theme.fg("accent", displayName)}${theme.fg("muted", ": ")}${theme.fg(statusColor, getSubagentCompletionLabel(snapshot.status))}`;
      if (summary) {
        detail += `${theme.fg("muted", " - ")}${theme.fg("toolOutput", summary)}`;
      }
      if (expanded && displayName !== snapshot.agent_id) {
        detail += `${theme.fg("dim", ` (${snapshot.agent_id})`)}`;
      }

      return new Text(
        `${theme.fg("muted", "• ")}${theme.fg("toolTitle", "Finished waiting")}` +
          `\n  ${theme.fg("muted", "└ ")}${detail}`,
        0,
        0,
      );
    },
  );

  const updateDurableChild = (
    agentId: string,
    patch: Partial<DurableChildRecord>,
    options: { persistAs?: SubagentEntryType; reason?: string } = {},
  ): DurableChildRecord => {
    const current = requireDurableChild(agentId);
    const next: DurableChildRecord = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    durableChildrenById.set(agentId, next);
    if (options.persistAs) {
      persistRegistryEvent(options.persistAs, next, { reason: options.reason });
    }
    return next;
  };

  const readChildState = async (
    attachment: LiveChildAttachment,
  ): Promise<Record<string, unknown>> => {
    const response = await sendRpcCommand(attachment, { type: "get_state" });
    if (!response.success || !response.data) {
      throw new Error(response.error ?? `Failed to fetch state for agent ${attachment.agentId}`);
    }
    return response.data;
  };

  const maybeReadLastAssistantText = async (
    attachment: LiveChildAttachment,
  ): Promise<string | undefined> => {
    const response = await sendRpcCommand(attachment, { type: "get_last_assistant_text" });
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

  const bindAttachment = (attachment: LiveChildAttachment) => {
    const handleDurablePatch = (
      patch: Partial<DurableChildRecord>,
      options: { persistAs?: SubagentEntryType; reason?: string } = {},
    ) => {
      if (!durableChildrenById.has(attachment.agentId)) return;
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
        liveAttachmentsById.delete(attachment.agentId);
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
      liveAttachmentsById.delete(attachment.agentId);

      const record = durableChildrenById.get(attachment.agentId);
      if (record) {
        if (attachment.closingDisposition === "close") {
          durableChildrenById.set(attachment.agentId, {
            ...record,
            status: "closed",
            closedAt: record.closedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else if (attachment.closingDisposition === "detach") {
          durableChildrenById.set(attachment.agentId, {
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

      notifyStateChange(attachment);
    });
  };

  const attachChild = async (
    record: DurableChildRecord,
    mode: "fresh" | "resume" | "fork",
  ): Promise<{ attachment: LiveChildAttachment; record: DurableChildRecord }> => {
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
    });
    liveAttachmentsById.set(record.agentId, attachment);
    bindAttachment(attachment);

    try {
      const state = await readChildState(attachment);
      const sessionFile = state.sessionFile;
      if (typeof sessionFile !== "string" || sessionFile.trim().length === 0) {
        throw new Error(`Agent ${record.agentId} did not expose a durable session file`);
      }

        const nextRecord = durableChildrenById.has(record.agentId)
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

      return { attachment, record: nextRecord };
    } catch (error) {
      await closeLiveAttachment(attachment, "discard").catch(() => undefined);
      liveAttachmentsById.delete(record.agentId);
      throw error;
    }
  };

  const closeLiveAttachment = async (
    attachment: LiveChildAttachment,
    disposition: NonNullable<LiveChildAttachment["closingDisposition"]>,
  ): Promise<void> => {
    if (attachment.exitCode !== undefined) return;

    attachment.closingDisposition = disposition;
    attachment.lastLiveAt = Date.now();

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

  const closeAllLiveAttachments = async (reason: "detach" | "shutdown") => {
    const activeAttachments = [...liveAttachmentsById.values()];
    for (const attachment of activeAttachments) {
      await closeLiveAttachment(attachment, reason === "detach" ? "detach" : "discard");
      liveAttachmentsById.delete(attachment.agentId);

      const record = durableChildrenById.get(attachment.agentId);
      if (record && record.status !== "closed") {
        durableChildrenById.set(attachment.agentId, {
          ...record,
          status: reason === "detach" ? "detached" : record.status,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  };

  const waitForAgentIdle = async (
    record: DurableChildRecord,
    attachment: LiveChildAttachment,
    timeoutMs: number,
  ): Promise<AgentSnapshot> => {
    const deadline = Date.now() + Math.max(0, timeoutMs);

    while (true) {
      const latestRecord = requireDurableChild(record.agentId);
      if (latestRecord.status === "closed" || latestRecord.status === "failed") {
        return childSnapshot(latestRecord, attachment);
      }

      const remainingBeforePoll = deadline - Date.now();
      if (remainingBeforePoll <= 0) {
        return childSnapshot(latestRecord, attachment, "timeout");
      }

      let response: RpcResponse;
      try {
        response = await sendRpcCommand(
          attachment,
          { type: "get_state" },
          Math.min(5_000, Math.max(1, remainingBeforePoll)),
        );
      } catch {
        if (Date.now() >= deadline) {
          return childSnapshot(requireDurableChild(record.agentId), attachment, "timeout");
        }

        const maybeLiveRecord = durableChildrenById.get(record.agentId);
        if (
          !maybeLiveRecord ||
          maybeLiveRecord.status === "closed" ||
          maybeLiveRecord.status === "failed"
        ) {
          return childSnapshot(maybeLiveRecord ?? record, attachment);
        }

        await waitForStateChange(attachment, Math.min(300, Math.max(1, deadline - Date.now())));
        continue;
      }

      if (response.success && response.data) {
        const nextRecord = updateFromGetState(record.agentId, response.data);
        if (nextRecord.status === "live_idle") {
          return childSnapshot(nextRecord, attachment);
        }
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return childSnapshot(requireDurableChild(record.agentId), attachment, "timeout");
      }

      await waitForStateChange(attachment, Math.min(300, remaining));
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    activeSessionFile = ctx.sessionManager.getSessionFile();
    clearResolvedAgentProfilesCache();
    await closeAllLiveAttachments("detach");
    reconstructDurableRegistry(ctx.sessionManager.getEntries() as SessionEntryLike[]);
  });

  pi.on("session_switch", async (_event, ctx) => {
    activeSessionFile = ctx.sessionManager.getSessionFile();
    clearResolvedAgentProfilesCache();
    await closeAllLiveAttachments("detach");
    reconstructDurableRegistry(ctx.sessionManager.getEntries() as SessionEntryLike[]);
  });

  pi.on("agent_start", async () => {
    parentIsStreaming = true;
  });

  pi.on("agent_end", async () => {
    parentIsStreaming = false;
  });

  pi.on("session_shutdown", async () => {
    await closeAllLiveAttachments("shutdown");
  });

  pi.registerTool({
    name: "spawn_agent",
    label: "spawn_agent",
    description:
      "Spawn a persistent local child pi agent in RPC mode and immediately start it on a delegated task.",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "Legacy task field for the child agent." })),
      context: Type.Optional(
        Type.String({
          description: "Optional extra context summary prepended to the delegated task.",
        }),
      ),
      message: Type.Optional(
        Type.String({ description: "Initial plain-text task for the new agent. Use either message or items." }),
      ),
      items: Type.Optional(
        Type.Array(CollabInputItemSchema, {
          description: "Structured input items. Use this to pass explicit mentions or local-image references.",
        }),
      ),
      agent_type: Type.Optional(
        Type.String({ description: buildSpawnAgentTypeDescription(resolveAgentProfiles()) }),
      ),
      fork_context: Type.Optional(
        Type.Boolean({
          description:
            "Clone the current persisted session branch into the child before sending the initial task.",
        }),
      ),
      workdir: Type.Optional(
        Type.String({
          description:
            "Optional working directory for the child agent. Defaults to the current cwd.",
        }),
      ),
      model: Type.Optional(
        Type.String({ description: "Optional model override for the child agent." }),
      ),
      reasoning_effort: Type.Optional(
        Type.String({ description: "Optional reasoning effort override for the child agent." }),
      ),
      name: Type.Optional(
        Type.String({ description: "Optional descriptive label for the child agent." }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workdir = params.workdir ? path.resolve(ctx.cwd, params.workdir) : ctx.cwd;
      const agentId = randomUUID();
      const inheritedDefaults = resolveParentSpawnDefaults({
        modelId: ctx.model?.id,
        sessionEntries: ctx.sessionManager.getEntries() as SessionEntry[],
        leafId: ctx.sessionManager.getLeafId(),
      });
      const appliedProfile = applySpawnAgentProfile({
        requestedAgentType: params.agent_type,
        profiles: resolveAgentProfiles({ includeHidden: true }).profiles,
        requestedModel: params.model?.trim() ? params.model : inheritedDefaults.model,
        requestedReasoningEffort: params.reasoning_effort?.trim()
          ? params.reasoning_effort
          : inheritedDefaults.reasoningEffort,
      });
      const thinkingLevel = normalizeReasoningEffortToThinkingLevel(appliedProfile.effectiveReasoningEffort);
      const forkedSessionFile = params.fork_context
        ? resolveForkContextSessionFile({
            sessionFile: ctx.sessionManager.getSessionFile(),
            leafId: ctx.sessionManager.getLeafId(),
            currentCwd: ctx.cwd,
            childCwd: workdir,
          })
        : undefined;
      const subagentName = resolveSubagentName(
        durableChildrenById.values(),
        params.name,
        spawnNameSeed(params),
      );
      const baseRecord: DurableChildRecord = {
        agentId,
        agentType: appliedProfile.agentType,
        cwd: workdir,
        model: appliedProfile.effectiveModel,
        name: subagentName,
        status: "live_running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentSessionFile: ctx.sessionManager.getSessionFile(),
        sessionFile: forkedSessionFile,
      };

      const { attachment } = await attachChild(baseRecord, forkedSessionFile ? "fork" : "fresh");

      try {
        if (thinkingLevel) {
          const thinkingResponse = await sendRpcCommand(attachment, {
            type: "set_thinking_level",
            level: thinkingLevel,
          });

          if (!thinkingResponse.success) {
            throw new Error(
              thinkingResponse.error ??
                `Failed to set child reasoning level to ${appliedProfile.effectiveReasoningEffort ?? thinkingLevel}`,
            );
          }
        }

        const prompt = resolveSpawnPrompt(params);
        const response = await sendRpcCommand(attachment, {
          type: "prompt",
          message: prompt,
        });

        if (!response.success) {
          throw new Error(response.error ?? "Failed to start child agent");
        }

        const state = await readChildState(attachment);
        const lastAssistantText = await maybeReadLastAssistantText(attachment);
        const durableRecord: DurableChildRecord = {
          ...baseRecord,
          status: deriveDurableStatusFromState(state),
          sessionId: typeof state.sessionId === "string" ? state.sessionId : undefined,
          sessionFile: typeof state.sessionFile === "string" ? state.sessionFile : undefined,
          ...(lastAssistantText ? { lastAssistantText } : {}),
          updatedAt: new Date().toISOString(),
        };

        if (!durableRecord.sessionFile) {
          throw new Error(`Spawned agent ${agentId} did not produce a session_file`);
        }

        durableChildrenById.set(agentId, durableRecord);
        persistRegistryEvent(SUBAGENT_ENTRY_TYPES.create, durableRecord);
        persistRegistryEvent(SUBAGENT_ENTRY_TYPES.attach, durableRecord);

        return {
          content: [{ type: "text", text: buildSpawnAgentContent(agentId, durableRecord.name) }],
          details: {
            ...childSnapshot(durableRecord, attachment),
            nickname: durableRecord.name ?? null,
            model_label: formatSubagentModelLabel(
              appliedProfile.effectiveModel,
              appliedProfile.effectiveReasoningEffort,
            ),
            prompt,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const closedRecord: DurableChildRecord = {
          ...baseRecord,
          status: "closed",
          lastError: message,
          sessionId: durableChildrenById.get(agentId)?.sessionId,
          sessionFile: durableChildrenById.get(agentId)?.sessionFile,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        durableChildrenById.set(agentId, closedRecord);
        persistRegistryEvent(SUBAGENT_ENTRY_TYPES.create, closedRecord);
        persistRegistryEvent(SUBAGENT_ENTRY_TYPES.close, closedRecord, { reason: "spawn_failed" });
        await closeLiveAttachment(attachment, "discard").catch(() => undefined);
        liveAttachmentsById.delete(agentId);
        durableChildrenById.delete(agentId);
        if (forkedSessionFile && fs.existsSync(forkedSessionFile)) {
          fs.rmSync(forkedSessionFile, { force: true });
        }
        throw error;
      }
    },
    renderCall(args, theme) {
      const predictedName = resolveSubagentName(durableChildrenById.values(), args.name, spawnNameSeed(args));
      const agentType = resolveRequestedAgentType(args.agent_type);
      const roleLabel = agentType !== "default" ? ` [${agentType}]` : "";
      const modelLabel = formatSubagentModelLabel(args.model, args.reasoning_effort);
      const title = `${theme.fg("muted", "• ")}${theme.fg("toolTitle", "Spawned ")}${theme.fg("accent", `${predictedName}${roleLabel}`)}${modelLabel ? theme.fg("muted", ` (${modelLabel})`) : ""}`;
      return new Text(title, 0, 0);
    },
    renderResult(result, _options, theme) {
      const details =
        (result.details as
          | (AgentSnapshot & { model_label?: string; prompt?: string })
          | undefined) ?? undefined;
      if (!details?.prompt) {
        return undefined;
      }
      return new Text(`  ${theme.fg("muted", "└ ")}${theme.fg("dim", shorten(details.prompt, 140))}`, 0, 0);
    },
  });

  pi.registerTool({
    name: "resume_agent",
    label: "resume_agent",
    description:
      "Reattach a detached durable child agent by agent_id and restore its persisted child session.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Agent id to resume." })),
      agent_id: Type.Optional(Type.String({ description: "Identifier returned by spawn_agent." })),
    }),
    async execute(_toolCallId, params) {
      const agentId = resolveAgentIdAlias(params);
      const existingAttachment = liveAttachmentsById.get(agentId);
      if (existingAttachment) {
        return {
          content: [{ type: "text", text: `Agent ${agentId} is already live` }],
          details: {
            status: childSnapshot(requireDurableChild(agentId), existingAttachment),
          },
        };
      }

      const record = requireDurableChild(agentId);
      if (record.status === "closed") {
        throw new Error(`Agent ${agentId} is already closed`);
      }
      if (!record.sessionFile) {
        throw new Error(
          `Agent ${agentId} cannot be resumed because no durable session_file is recorded`,
        );
      }
      if (!isResumable(record)) {
        throw new Error(
          `Agent ${agentId} cannot be resumed because its durable session_file is missing or not yet persisted to disk`,
        );
      }

      const expectedSessionId = record.sessionId;
      const { attachment } = await attachChild(record, "resume");
      const attachedRecord = requireDurableChild(agentId);
      if (
        expectedSessionId &&
        attachedRecord.sessionId &&
        attachedRecord.sessionId !== expectedSessionId
      ) {
        const mismatchError =
          `Agent ${agentId} resumed with unexpected session_id ${attachedRecord.sessionId} ` +
          `(expected ${expectedSessionId}); refusing to attach a fresh child session`;
        await closeLiveAttachment(attachment, "discard").catch(() => undefined);
        liveAttachmentsById.delete(agentId);
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

      return {
        content: [{ type: "text", text: `Resumed agent ${agentId}` }],
        details: {
          status: childSnapshot(resumedRecord, attachment),
        },
      };
    },
    renderCall(args) {
      return conciseResult("resume_agent", args.id ?? args.agent_id);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { status?: AgentSnapshot } | AgentSnapshot | undefined;
      const snapshot = extractSnapshotDetails(details);
      const displayName = snapshot ? getSubagentDisplayName(snapshot) : "";
      return new Text(
        `${theme.fg("success", "✓ ")}${theme.fg("muted", "resumed ")}${theme.fg("accent", displayName)}`,
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "send_input",
    label: "send_input",
    description:
      "Send more work to a persistent child agent. Uses queued follow-up semantics by default and steering when interrupt is true.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Agent id to message (from spawn_agent)." })),
      agent_id: Type.Optional(Type.String({ description: "Identifier returned by spawn_agent." })),
      input: Type.Optional(Type.String({ description: "Legacy instruction field for the child agent." })),
      message: Type.Optional(
        Type.String({ description: "Plain-text message to send to the agent. Use either message or items." }),
      ),
      items: Type.Optional(
        Type.Array(CollabInputItemSchema, {
          description: "Structured input items. Use this to pass explicit mentions or local-image references.",
        }),
      ),
      interrupt: Type.Optional(
        Type.Boolean({ description: "Use steering semantics when the child is already running." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const agentId = resolveAgentIdAlias(params);
      const input = [params.input?.trim(), params.message?.trim(), flattenCollabItems(params.items)]
        .filter((value): value is string => Boolean(value))
        .join("\n\n")
        .trim();
      if (!input) {
        throw new Error("input, message, or items is required");
      }

      const attachment = requireLiveAttachment(agentId);
      return await queueAgentOperation(attachment, async () => {
        const record = requireDurableChild(agentId);
        if (record.status === "closed") {
          throw new Error(`Agent ${agentId} is already closed`);
        }
        if (record.status === "failed") {
          throw new Error(record.lastError ?? `Agent ${agentId} is in a failed state`);
        }

        const commandType =
          record.status === "live_running" ? (params.interrupt ? "steer" : "follow_up") : "prompt";
        const response = await sendRpcCommand(attachment, {
          type: commandType,
          message: input,
        });

        if (!response.success) {
          throw new Error(response.error ?? `Failed to ${commandType} child agent`);
        }

        const submissionId = response.id ?? `${agentId}:${Date.now()}`;

        const nextRecord = updateDurableChild(
          agentId,
          {
            status: "live_running",
            lastError: undefined,
          },
          { persistAs: SUBAGENT_ENTRY_TYPES.update },
        );

        return {
          content: [{ type: "text", text: buildSendInputContent(submissionId) }],
          details: {
            submission_id: submissionId,
            ...childSnapshot(nextRecord, attachment),
            command: commandType,
          },
        };
      });
    },
    renderCall(args) {
      return conciseResult(
        "send_input",
        shorten((args.message ?? args.input ?? flattenCollabItems(args.items) ?? "") as string),
      );
    },
    renderResult(result, _options, theme) {
      const details = (result.details ?? {}) as AgentSnapshot & { command?: string };
      const command = details.command ? `${details.command} ` : "";
      const displayName = details.agent_id ? getSubagentDisplayName(details) : "";
      return new Text(
        `${theme.fg("success", "✓ ")}${theme.fg("muted", command)}${theme.fg("accent", displayName)}`,
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "wait_agent",
    label: "wait_agent",
    description: "Wait for one or more child agents to go idle, fail, close, or hit a timeout.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Single child agent id to wait on." })),
      ids: Type.Optional(
        Type.Array(Type.String(), { description: "Agent ids to wait on. Pass multiple ids to wait for whichever finishes first." }),
      ),
      agent_id: Type.Optional(Type.String({ description: "Single child agent id to wait on." })),
      agent_ids: Type.Optional(
        Type.Array(Type.String(), { description: "Multiple child agent ids to wait on." }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({ description: "Maximum time to wait before returning." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const ids = resolveAgentIdsAlias(params);
      if (ids.length === 0) {
        throw new Error("id, ids, agent_id, or agent_ids is required");
      }

      const timeoutMs = params.timeout_ms ?? 30_000;
      const snapshots = await Promise.all(
        ids.map(async (id) => {
          const record = requireDurableChild(id);
          const attachment = liveAttachmentsById.get(id);
          if (!attachment) {
            return childSnapshot(record);
          }
          return await queueAgentOperation(attachment, async () =>
            waitForAgentIdle(requireDurableChild(id), attachment, timeoutMs),
          );
        }),
      );
      const status = Object.fromEntries(snapshots.map((snapshot) => [snapshot.agent_id, snapshot.status]));
      const timedOut = snapshots.length > 0 && snapshots.every((snapshot) => snapshot.status === "timeout");

      return {
        content: [{ type: "text", text: buildWaitAgentContent(snapshots, timedOut) }],
        details: {
          agents: snapshots,
          status,
          timed_out: timedOut,
        },
      };
    },
    renderCall(args, theme) {
      const ids = resolveAgentIdsAlias(args);
      const names = ids.map((id) => {
        const record = durableChildrenById.get(id);
        return record ? getSubagentDisplayName(childSnapshot(record)) : id;
      });
      const title =
        names.length === 1
          ? `Waiting for ${names[0]}`
          : `Waiting for ${names.length} agents`;
      return new Text(`${theme.fg("muted", "• ")}${theme.fg("toolTitle", title)}`, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = (result.details ?? {}) as { agents?: AgentSnapshot[]; timed_out?: boolean };
      const agentsList = details.agents ?? [];
      if (agentsList.length === 0) {
        return new Text(
          `${theme.fg("muted", "• ")}${theme.fg("toolTitle", "Finished waiting")}`,
          0,
          0,
        );
      }

      const markdownTheme = getMarkdownTheme();
      const getStatusColor = (status: AgentSnapshot["status"]) =>
        status === "idle"
          ? "success"
          : status === "timeout"
            ? "warning"
            : status === "failed"
              ? "error"
              : status === "closed"
                ? "muted"
                : "accent";
      const getStatusIcon = (status: AgentSnapshot["status"]) =>
        status === "idle"
          ? "✓"
          : status === "timeout"
            ? "⏱"
            : status === "failed"
              ? "✗"
              : status === "closed"
                ? "•"
                : status === "detached"
                  ? "◌"
                  : "⏳";

      const container = new Container();
      container.addChild(new Text(`${theme.fg("muted", "• ")}${theme.fg("toolTitle", "Finished waiting")}`, 0, 0));

      for (const [index, agent] of agentsList.entries()) {
        if (index > 0) container.addChild(new Spacer(1));

        const displayName = getSubagentDisplayName(agent);
        const statusColor = getStatusColor(agent.status);
        const summary = agent.last_error ?? summarizeSubagentReply(agent.last_assistant_text, expanded ? 600 : 220);
        let detail = `${theme.fg("accent", displayName)}${theme.fg("muted", ": ")}${theme.fg(statusColor, getSubagentCompletionLabel(agent.status))}`;
        if (summary) {
          detail += `${theme.fg("muted", " - ")}${theme.fg("toolOutput", summary)}`;
        }
        container.addChild(new Text(`  ${theme.fg("muted", index === 0 ? "└ " : "  ")}${detail}`, 0, 0));

        const reply = agent.last_assistant_text?.trim();
        if (expanded && reply) {
          const preview = truncateSubagentReply(reply, MAX_SUBAGENT_REPLY_PREVIEW_LINES);
          if (preview.text) {
            container.addChild(new Spacer(1));
            container.addChild(new Markdown(preview.text, 0, 0, markdownTheme));
          }
          if (preview.hiddenLineCount > 0) {
            container.addChild(
              new Text(
                theme.fg("muted", `... +${preview.hiddenLineCount} more rows (Ctrl+O to expand)`),
                0,
                0,
              ),
            );
          }
        }
      }

      if (!expanded && agentsList.some((agent) => Boolean(agent.last_assistant_text?.trim()))) {
        const hiddenReplyRows = agentsList.reduce((total, agent) => {
          const reply = agent.last_assistant_text?.trim();
          if (!reply) return total;

          const preview = truncateSubagentReply(reply, MAX_SUBAGENT_REPLY_PREVIEW_LINES);
          if (!preview.text) return total;

          return total + preview.text.split("\n").length + (preview.hiddenLineCount > 0 ? 1 : 0);
        }, 0);
        container.addChild(new Spacer(1));
        container.addChild(
          new Text(theme.fg("muted", `... +${hiddenReplyRows} more rows (Ctrl+O to expand)`), 0, 0),
        );
      }

      return container;
    },
  });

  pi.registerTool({
    name: "close_agent",
    label: "close_agent",
    description: "Close a persistent child agent and retain a durable closed registry record.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Agent id to close (from spawn_agent)." })),
      agent_id: Type.Optional(Type.String({ description: "Identifier returned by spawn_agent." })),
    }),
    async execute(_toolCallId, params) {
      const agentId = resolveAgentIdAlias(params);
      const record = requireDurableChild(agentId);
      const attachment = liveAttachmentsById.get(agentId);

      if (attachment) {
        return await queueAgentOperation(attachment, async () => {
          await closeLiveAttachment(attachment, "close");
          const nextRecord = updateDurableChild(
            agentId,
            {
              status: "closed",
              closedAt: new Date().toISOString(),
            },
            { persistAs: SUBAGENT_ENTRY_TYPES.close },
          );

          return {
            content: [{ type: "text", text: `Closed agent ${agentId}` }],
            details: {
              status: childSnapshot(nextRecord, attachment),
            },
          };
        });
      }

      const closedRecord =
        record.status === "closed"
          ? record
          : updateDurableChild(
              agentId,
              {
                status: "closed",
                closedAt: new Date().toISOString(),
              },
              { persistAs: SUBAGENT_ENTRY_TYPES.close },
            );

      return {
        content: [{ type: "text", text: `Closed agent ${agentId}` }],
        details: {
          status: childSnapshot(closedRecord),
        },
      };
    },
    renderCall(args) {
      return conciseResult("close_agent", args.id ?? args.agent_id);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { status?: AgentSnapshot } | AgentSnapshot | undefined;
      const snapshot = extractSnapshotDetails(details);
      const displayName = snapshot ? getSubagentDisplayName(snapshot) : "";
      return new Text(
        `${theme.fg("muted", "closed ")}${theme.fg("accent", displayName)}`,
        0,
        0,
      );
    },
  });

  void CODEX_SUBAGENT_RESERVED_TOOL_NAMES;
}

export {
  childSnapshot,
  generateUniqueSubagentName,
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
  resolveAgentIdAlias,
  resolveAgentIdsAlias,
  resolveSubagentName,
  resolveSpawnPrompt,
  summarizeSubagentReply,
  truncateSubagentReply,
  flattenCollabItems,
};
export {
  buildSendInputContent,
  buildSpawnAgentContent,
  buildWaitAgentContent,
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  CODEX_SUBAGENT_RESERVED_TOOL_NAMES,
  CODEX_SUBAGENT_TOOL_NAMES,
  formatSubagentNotificationMessage,
};
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
