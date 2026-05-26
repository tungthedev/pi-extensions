import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "../editor/events.js";
import { registerGoalCommand } from "./commands.js";
import { syncGoalWidget } from "./goal-widget.js";
import { budgetLimitNotice, continuationGoalIdFromPrompt, continuationPrompt } from "./prompts.js";
import {
  applyUsage,
  clearEntry,
  goalWithLiveUsage,
  reconstructGoal,
  setEntry,
  updateGoalStatus,
} from "./state.js";
import { registerGoalTools } from "./tools.js";
import {
  CUSTOM_ENTRY_TYPE,
  type GoalBridgeProjectionUpdate,
  type GoalBridgeTransition,
  type GoalBridgeTransitionKind,
  type GoalEntrySource,
  type GoalExtensionBridge,
  type GoalResult,
  type ThreadGoal,
} from "./types.js";

interface AccountingState {
  activeGoalId: string | null;
  lastAccountedAt: number | null;
  budgetWarningSentFor: string | null;
}

interface AssistantUsage {
  input: number;
  output: number;
}

interface QueuedGoalMessageDetails {
  kind?: unknown;
  goalId?: unknown;
}

function usageChannelTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function assistantTurnTokens(message: { role: string; usage?: AssistantUsage }): number {
  if (message.role !== "assistant" || !message.usage) {
    return 0;
  }
  return usageChannelTokens(message.usage.input) + usageChannelTokens(message.usage.output);
}

function isAbortedAssistantMessage(message: { role: string; stopReason?: string }): boolean {
  return message.role === "assistant" && message.stopReason === "aborted";
}

function isToolUseAssistantMessage(message: { role: string; stopReason?: string }): boolean {
  return message.role === "assistant" && message.stopReason === "toolUse";
}

function isQueuedGoalWorkKind(kind: unknown): boolean {
  return kind === "continuation" || kind === "command_start" || kind === "command_resume";
}

function isQueuedGoalMessageDetails(details: unknown): details is QueuedGoalMessageDetails {
  return details !== null && typeof details === "object";
}

function staleGoalContinuationMessage(
  queuedGoalId: string,
  currentGoal: ThreadGoal | null,
): string {
  const currentState = currentGoal
    ? `Current goal id: ${currentGoal.goalId}; current status: ${currentGoal.status}.`
    : "There is no current goal.";
  return [
    "A queued hidden goal continuation is stale because the referenced goal is no longer active.",
    `Queued goal id: ${queuedGoalId}.`,
    currentState,
    "Do not perform task work. Do not call tools. Reply briefly that the queued goal continuation is no longer active.",
  ].join("\n");
}

function queuedGoalWorkMessageId(message: {
  role: string;
  customType?: string;
  details?: unknown;
  content?: unknown;
}): string | null {
  if (message.role !== "custom" || message.customType !== CUSTOM_ENTRY_TYPE) {
    return null;
  }

  if (isQueuedGoalMessageDetails(message.details)) {
    const { kind, goalId } = message.details;
    if (isQueuedGoalWorkKind(kind) && typeof goalId === "string") {
      return goalId;
    }
  }

  if (typeof message.content === "string") {
    return continuationGoalIdFromPrompt(message.content);
  }

  return null;
}

const CONTINUATION_RETRY_MS = 50;
const GOAL_EDITOR_STATUS_KEY = "goal";
const GOAL_EDITOR_STATUS_TEXT = String.fromCodePoint(0x1f3af);

export interface GoalExtensionOptions {
  bridge?: GoalExtensionBridge;
}

function newGoalEventId(kind: GoalBridgeTransitionKind): string {
  return `goal-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneBridgeGoal(goal: ThreadGoal | null): ThreadGoal | null {
  return goal
    ? {
        ...goal,
        usage: { ...goal.usage },
      }
    : null;
}

function transitionKind(
  previousGoal: ThreadGoal | null,
  nextGoal: ThreadGoal | null,
): GoalBridgeTransitionKind {
  if (!nextGoal) {
    return "cleared";
  }
  if (!previousGoal || previousGoal.goalId !== nextGoal.goalId) {
    return "created";
  }
  if (previousGoal.status !== nextGoal.status) {
    if (nextGoal.status === "active") return "resumed";
    if (nextGoal.status === "paused") return "paused";
    if (nextGoal.status === "budgetLimited") return "budget_limited";
    if (nextGoal.status === "complete") return "completed";
    if (nextGoal.status === "blocked") return "blocked";
  }
  if (previousGoal.tokenBudget !== nextGoal.tokenBudget) {
    return "budget_changed";
  }
  return "updated";
}

function buildGoalTransition(
  previousGoal: ThreadGoal | null,
  nextGoal: ThreadGoal | null,
  source: GoalEntrySource,
): GoalBridgeTransition {
  const kind = transitionKind(previousGoal, nextGoal);
  return {
    version: 1,
    eventId: newGoalEventId(kind),
    kind,
    source,
    goalId: nextGoal?.goalId ?? previousGoal?.goalId ?? null,
    previousStatus: previousGoal?.status ?? null,
    nextStatus: nextGoal?.status ?? null,
    tokenBudget: nextGoal?.tokenBudget ?? null,
    at: Date.now(),
  };
}

export function registerGoalExtension(pi: ExtensionAPI, options: GoalExtensionOptions = {}): void {
  let goal: ThreadGoal | null = null;
  let currentUiCtx: ExtensionContext | null = null;
  let continuationQueuedFor: string | null = null;
  let continuationScheduledFor: string | null = null;
  let continuationTimer: ReturnType<typeof setTimeout> | null = null;
  const accounting: AccountingState = {
    activeGoalId: null,
    lastAccountedAt: null,
    budgetWarningSentFor: null,
  };

  const goalForDisplay = (): ThreadGoal | null =>
    goalWithLiveUsage(goal, accounting.activeGoalId, accounting.lastAccountedAt);

  const emitGoalUpdate = async (transition?: GoalBridgeTransition): Promise<void> => {
    if (!options.bridge?.onGoalUpdate) {
      return;
    }

    const update: GoalBridgeProjectionUpdate = {
      version: 1,
      state: {
        version: 1,
        goal: cloneBridgeGoal(goalForDisplay()),
        observedAt: Date.now(),
        sourceSdkSessionId: currentUiCtx?.sessionManager.getSessionId(),
      },
      ...(transition ? { transition } : {}),
    };
    await options.bridge.onGoalUpdate(update);
  };

  const clearContinuationTimer = (): void => {
    if (continuationTimer) {
      clearTimeout(continuationTimer);
      continuationTimer = null;
    }
    continuationScheduledFor = null;
  };

  const clearContinuationState = (): void => {
    clearContinuationTimer();
    continuationQueuedFor = null;
  };

  const clearActiveAccounting = (): void => {
    accounting.activeGoalId = null;
    accounting.lastAccountedAt = null;
  };

  const clearStoppedRuntimeState = (): void => {
    clearContinuationState();
    clearActiveAccounting();
  };

  const refreshUi = (ctx = currentUiCtx): void => {
    const displayGoal = goalForDisplay();
    if (ctx) {
      syncGoalWidget(ctx, displayGoal);
    }

    if (!displayGoal) {
      pi.events.emit(EDITOR_REMOVE_STATUS_SEGMENT_EVENT, { key: GOAL_EDITOR_STATUS_KEY });
      return;
    }

    pi.events.emit(EDITOR_SET_STATUS_SEGMENT_EVENT, {
      key: GOAL_EDITOR_STATUS_KEY,
      text: GOAL_EDITOR_STATUS_TEXT,
      align: "right",
      priority: -2,
    });
  };

  const persistGoal = async (
    nextGoal: ThreadGoal,
    source: GoalEntrySource,
    emitTransition: boolean | "auto" = true,
  ): Promise<void> => {
    const previousGoal = cloneBridgeGoal(goal);
    const previousGoalId = previousGoal?.goalId ?? null;
    goal = nextGoal;
    if (previousGoalId !== nextGoal.goalId) {
      accounting.budgetWarningSentFor = null;
      clearStoppedRuntimeState();
    }
    if (nextGoal.status === "paused" || nextGoal.status === "complete") {
      clearStoppedRuntimeState();
    } else if (nextGoal.status === "budgetLimited") {
      clearContinuationState();
    }
    if (nextGoal.status !== "budgetLimited") {
      accounting.budgetWarningSentFor = null;
    }
    pi.appendEntry(CUSTOM_ENTRY_TYPE, setEntry(nextGoal, source));
    const shouldEmitTransition =
      emitTransition === true ||
      (emitTransition === "auto" && previousGoal?.status !== nextGoal.status);
    await emitGoalUpdate(
      shouldEmitTransition ? buildGoalTransition(previousGoal, nextGoal, source) : undefined,
    );
  };

  const persistClear = async (source: GoalEntrySource): Promise<void> => {
    const previousGoal = cloneBridgeGoal(goal);
    const clearedGoalId = previousGoal?.goalId ?? null;
    goal = null;
    clearStoppedRuntimeState();
    pi.appendEntry(CUSTOM_ENTRY_TYPE, clearEntry(clearedGoalId, source));
    await emitGoalUpdate(buildGoalTransition(previousGoal, null, source));
  };

  const pauseForAbort = async (ctx: ExtensionContext): Promise<void> => {
    if (!goal || goal.status !== "active") {
      return;
    }

    const result = updateGoalStatus(goal, "paused");
    if (!result.ok || !result.goal) {
      return;
    }

    clearStoppedRuntimeState();
    await persistGoal(result.goal, "runtime");
    refreshUi(ctx);
  };

  const resumePausedGoal = async (ctx: ExtensionContext): Promise<void> => {
    if (!goal || goal.status !== "paused") {
      return;
    }

    const result = updateGoalStatus(goal, "active");
    if (!result.ok || !result.goal) {
      return;
    }

    clearContinuationState();
    await persistGoal(result.goal, "runtime");
    refreshUi(ctx);
  };

  const reloadFromSession = async (ctx: ExtensionContext): Promise<void> => {
    currentUiCtx = ctx;
    goal = reconstructGoal(ctx.sessionManager.getBranch()).goal;
    clearContinuationState();
    if (goal?.status !== "active") {
      clearActiveAccounting();
    }
    refreshUi(ctx);
    await emitGoalUpdate();
  };

  const beginAccounting = (): void => {
    if (!goal || goal.status !== "active") {
      accounting.activeGoalId = null;
      accounting.lastAccountedAt = null;
      return;
    }

    accounting.activeGoalId = goal.goalId;
    accounting.lastAccountedAt = Date.now();
  };

  const accountProgress = async (
    ctx: ExtensionContext,
    allowBudgetAbort: boolean,
    completedTurnTokens = 0,
    accountBudgetLimited = false,
  ): Promise<void> => {
    const canAccount =
      goal?.status === "active" || (accountBudgetLimited && goal?.status === "budgetLimited");
    if (!goal || accounting.activeGoalId !== goal.goalId || !canAccount) {
      beginAccounting();
      return;
    }

    const now = Date.now();
    const elapsed =
      accounting.lastAccountedAt === null
        ? 0
        : Math.floor((now - accounting.lastAccountedAt) / 1000);
    accounting.lastAccountedAt = now;

    const result = applyUsage(goal, completedTurnTokens, elapsed, {
      expectedGoalId: accounting.activeGoalId,
      accountBudgetLimited,
    });
    if (!result.changed || !result.goal) {
      return;
    }

    await persistGoal(result.goal, "runtime", "auto");
    refreshUi(ctx);

    if (
      allowBudgetAbort &&
      result.crossedBudget &&
      accounting.budgetWarningSentFor !== result.goal.goalId
    ) {
      accounting.budgetWarningSentFor = result.goal.goalId;
      ctx.abort();
      ctx.ui.notify(budgetLimitNotice(result.goal), "warning");
    }
  };

  const updateGoal = async (
    status: "complete" | "blocked",
    source: GoalEntrySource,
    ctx: ExtensionContext,
  ): Promise<GoalResult> => {
    await accountProgress(ctx, false, 0, true);
    const result = updateGoalStatus(goal, status);
    if (!result.ok || !result.goal) {
      return result;
    }
    await persistGoal(result.goal, source);
    refreshUi(ctx);
    return result;
  };

  const sendContinuation = (goalToContinue: ThreadGoal): void => {
    continuationQueuedFor = goalToContinue.goalId;
    pi.sendMessage(
      {
        customType: CUSTOM_ENTRY_TYPE,
        content: continuationPrompt(goalToContinue),
        display: false,
        details: { kind: "continuation", goalId: goalToContinue.goalId },
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  };

  const maybeContinue = (ctx: ExtensionContext): void => {
    if (!goal || goal.status !== "active" || continuationQueuedFor === goal.goalId) {
      return;
    }

    const goalId = goal.goalId;
    if (!ctx.isIdle() || ctx.hasPendingMessages()) {
      if (continuationScheduledFor === goalId) {
        return;
      }
      continuationScheduledFor = goalId;
      continuationTimer = setTimeout(() => {
        continuationTimer = null;
        continuationScheduledFor = null;
        maybeContinue(ctx);
      }, CONTINUATION_RETRY_MS);
      continuationTimer.unref?.();
      return;
    }

    clearContinuationTimer();
    if (!goal || goal.status !== "active" || goal.goalId !== goalId) {
      return;
    }
    sendContinuation(goal);
  };

  registerGoalTools(pi, {
    getGoal: () => goalForDisplay(),
    async setGoal(nextGoal, source, _ctx) {
      await persistGoal(nextGoal, source);
      refreshUi(_ctx);
    },
    updateGoal,
  });

  registerGoalCommand(pi, {
    getGoal: () => goalForDisplay(),
    async setGoal(nextGoal, source, _ctx) {
      await persistGoal(nextGoal, source);
      if (source === "command" && nextGoal.status === "active") {
        continuationQueuedFor = nextGoal.goalId;
      }
      refreshUi(_ctx);
    },
    async clearGoal(source, _ctx) {
      await persistClear(source);
      refreshUi(_ctx);
    },
  });

  pi.on("context", async (event): Promise<{ messages: typeof event.messages } | undefined> => {
    let changed = false;
    const messages: typeof event.messages = event.messages.map((message) => {
      const queuedGoalId = queuedGoalWorkMessageId(message);
      if (queuedGoalId === null || (goal?.goalId === queuedGoalId && goal.status === "active")) {
        return message;
      }

      changed = true;
      return {
        ...message,
        content: staleGoalContinuationMessage(queuedGoalId, goal),
        display: false,
        details: {
          kind: "stale_continuation",
          goalId: queuedGoalId,
          currentGoalId: goal?.goalId ?? null,
          currentStatus: goal?.status ?? null,
        },
      } as typeof message;
    });

    return changed ? { messages } : undefined;
  });

  pi.on("session_start", async (event, ctx) => {
    await reloadFromSession(ctx);
    beginAccounting();
    if (event.reason === "resume" && goal?.status === "paused" && ctx.hasUI) {
      const shouldResume = await ctx.ui.confirm("Resume paused goal?", `Goal: ${goal.objective}`);
      if (shouldResume) {
        await resumePausedGoal(ctx);
        beginAccounting();
      }
    }
    maybeContinue(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await reloadFromSession(ctx);
    beginAccounting();
    maybeContinue(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const continuationGoalId = continuationGoalIdFromPrompt(_event.prompt);
    if (continuationGoalId !== null) {
      continuationQueuedFor = null;
      clearContinuationTimer();
      if (!goal || goal.goalId !== continuationGoalId || goal.status !== "active") {
        ctx.abort();
        refreshUi(ctx);
        return {
          systemPrompt: [
            _event.systemPrompt,
            "",
            staleGoalContinuationMessage(continuationGoalId, goal),
          ].join("\n"),
        };
      }
    } else {
      clearContinuationState();
    }
  });

  pi.on("turn_start", async (_event, _ctx) => {
    currentUiCtx = _ctx;
    clearContinuationState();
    beginAccounting();
    refreshUi(_ctx);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    await accountProgress(ctx, true, 0, true);
  });

  pi.on("turn_end", async (_event, ctx) => {
    const completedTurnTokens = assistantTurnTokens(_event.message);
    await accountProgress(ctx, true, completedTurnTokens);
    if (isAbortedAssistantMessage(_event.message)) {
      await pauseForAbort(ctx);
      return;
    }
    if (!isToolUseAssistantMessage(_event.message)) {
      maybeContinue(ctx);
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const abortedMessages = event.messages.filter(isAbortedAssistantMessage);
    const abortedTurnTokens = abortedMessages.reduce((sum, message) => {
      return sum + assistantTurnTokens(message);
    }, 0);
    await accountProgress(ctx, false, abortedTurnTokens, true);
    if (abortedMessages.length > 0) {
      await pauseForAbort(ctx);
      return;
    }
    maybeContinue(ctx);
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    await accountProgress(ctx, false, 0, true);
  });

  pi.on("session_compact", async (_event, ctx) => {
    currentUiCtx = ctx;
    if (goal) {
      await persistGoal(goal, "runtime", false);
    }
    refreshUi(ctx);
    maybeContinue(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await accountProgress(ctx, false, 0, true);
    clearContinuationTimer();
  });
}

export default registerGoalExtension;
