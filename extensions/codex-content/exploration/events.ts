import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { ExplorationTracker } from "./state.ts";
import {
  clearExplorationWidget,
  clearLiveExplorationUI,
  clearWorkingMessage,
  setFinalExplorationWidget,
  syncLiveExplorationStatus,
} from "./ui.ts";

export function installExplorationEventHandlers(pi: ExtensionAPI): void {
  const tracker = new ExplorationTracker();
  let liveExplorationClearTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelLiveExplorationClearTimer = () => {
    if (liveExplorationClearTimer) {
      clearTimeout(liveExplorationClearTimer);
      liveExplorationClearTimer = null;
    }
  };

  const clearLiveUi = (ctx: Pick<ExtensionContext, "ui">) => {
    cancelLiveExplorationClearTimer();
    clearLiveExplorationUI(pi, ctx);
  };

  const scheduleLiveExplorationClear = (ctx: Pick<ExtensionContext, "ui">, delayMs = 1200) => {
    cancelLiveExplorationClearTimer();
    liveExplorationClearTimer = setTimeout(() => {
      liveExplorationClearTimer = null;
      clearLiveExplorationUI(pi, ctx);
    }, delayMs);
  };

  const resetExplorationState = () => {
    cancelLiveExplorationClearTimer();
    tracker.reset();
  };

  const finalizeExploration = (ctx: Pick<ExtensionContext, "ui">) => {
    tracker.finalize();
    clearLiveUi(ctx);
    setFinalExplorationWidget(ctx, tracker);
  };

  const handleReset = (
    _event: unknown,
    ctx: ExtensionContext,
    options: { clearWidget?: boolean } = {},
  ) => {
    resetExplorationState();
    clearWorkingMessage(ctx);
    clearLiveUi(ctx);
    if (options.clearWidget) {
      clearExplorationWidget(ctx);
    }
  };

  pi.on("session_start", async (event, ctx) => {
    handleReset(event, ctx, { clearWidget: true });
  });

  pi.on("session_switch", async (event, ctx) => {
    handleReset(event, ctx, { clearWidget: true });
  });

  // Reset once per agent run, not once per internal model turn. Otherwise the
  // final exploration widget only flashes before the next tool-followup turn.
  pi.on("agent_start", async (event, ctx) => {
    handleReset(event, ctx, { clearWidget: true });
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (
      tracker.onToolExecutionStart(
        event.toolCallId,
        event.toolName,
        event.args as Record<string, unknown>,
      )
    ) {
      syncLiveExplorationStatus(pi, tracker, ctx);
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (tracker.onToolResult(event)) {
      syncLiveExplorationStatus(pi, tracker, ctx);
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (tracker.onToolExecutionEnd(event.toolCallId, event.toolName, event.result, event.isError)) {
      if (tracker.hasActiveExploration()) {
        syncLiveExplorationStatus(pi, tracker, ctx);
      } else {
        scheduleLiveExplorationClear(ctx);
      }
      setFinalExplorationWidget(ctx, tracker);
    }

    clearWorkingMessage(ctx);
  });

  pi.on("message_start", async (event, ctx) => {
    if ((event.message as { role?: string }).role === "assistant") {
      scheduleLiveExplorationClear(ctx, 1200);
      setFinalExplorationWidget(ctx, tracker);
    }
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
