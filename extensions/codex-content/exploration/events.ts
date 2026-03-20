import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { ExplorationTracker } from "./state.ts";
import {
  clearExplorationWidget,
  clearLiveExplorationStatus,
  clearWorkingMessage,
  setExplorationWidget,
  syncLiveExplorationStatus,
} from "./ui.ts";

const LIVE_EXPLORATION_CLEAR_DELAY_MS = 1200;

export function installExplorationEventHandlers(pi: ExtensionAPI): void {
  const tracker = new ExplorationTracker();
  let liveExplorationClearTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelLiveExplorationClearTimer(): void {
    if (!liveExplorationClearTimer) {
      return;
    }

    clearTimeout(liveExplorationClearTimer);
    liveExplorationClearTimer = null;
  }

  function clearLiveExploration(): void {
    cancelLiveExplorationClearTimer();
    clearLiveExplorationStatus(pi);
  }

  function scheduleLiveExplorationClear(
    ctx: Pick<ExtensionContext, "ui">,
    delayMs = LIVE_EXPLORATION_CLEAR_DELAY_MS,
  ): void {
    cancelLiveExplorationClearTimer();
    liveExplorationClearTimer = setTimeout(() => {
      liveExplorationClearTimer = null;
      clearLiveExploration();
      setExplorationWidget(ctx, tracker);
    }, delayMs);
  }

  function resetExploration(ctx: ExtensionContext, clearWidget: boolean): void {
    cancelLiveExplorationClearTimer();
    tracker.reset();
    clearWorkingMessage(ctx);
    clearLiveExplorationStatus(pi);

    if (clearWidget) {
      clearExplorationWidget(ctx);
    }
  }

  function finalizeExploration(ctx: Pick<ExtensionContext, "ui">): void {
    tracker.finalize();
    clearLiveExploration();
    setExplorationWidget(ctx, tracker);
  }

  function handleToolExecutionEnd(
    ctx: ExtensionContext,
    event: {
      toolCallId: string;
      toolName: string;
      result?: unknown;
      isError: boolean;
    },
  ): void {
    const tracked = tracker.onToolExecutionEnd(
      event.toolCallId,
      event.toolName,
      event.result,
      event.isError,
    );

    if (!tracked) {
      clearWorkingMessage(ctx);
      return;
    }

    if (tracker.hasActiveExploration()) {
      syncLiveExplorationStatus(pi, tracker, ctx);
    } else {
      scheduleLiveExplorationClear(ctx);
      setExplorationWidget(ctx, tracker);
    }

    clearWorkingMessage(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    resetExploration(ctx, true);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetExploration(ctx, true);
  });

  // Reset once per agent run, not once per internal model turn. Otherwise the
  // final exploration widget only flashes before the next tool-followup turn.
  pi.on("agent_start", async (_event, ctx) => {
    resetExploration(ctx, true);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    const tracked = tracker.onToolExecutionStart(
      event.toolCallId,
      event.toolName,
      event.args as Record<string, unknown>,
    );
    if (!tracked) {
      return;
    }

    syncLiveExplorationStatus(pi, tracker, ctx);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!tracker.onToolResult(event)) {
      return;
    }

    syncLiveExplorationStatus(pi, tracker, ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    handleToolExecutionEnd(ctx, event);
  });

  pi.on("message_start", async (event, ctx) => {
    if ((event.message as { role?: string }).role !== "assistant") {
      return;
    }

    scheduleLiveExplorationClear(ctx);
    setExplorationWidget(ctx, tracker);
  });

  pi.on("turn_end", async (_event, ctx) => {
    clearWorkingMessage(ctx);
    finalizeExploration(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    finalizeExploration(ctx);
    ctx.ui.setWorkingMessage();
  });
}
