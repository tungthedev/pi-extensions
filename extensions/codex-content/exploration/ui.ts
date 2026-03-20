import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { RemoveStatusSegmentPayload, SetStatusSegmentPayload } from "../../editor/types.ts";
import type { ExplorationTracker } from "./state.ts";

import { combinedExplorationSummaryLines, liveExplorationSummary } from "./state.ts";
import { EXPLORATION_WIDGET_KEY, LIVE_EXPLORATION_SEGMENT_KEY } from "./types.ts";

const LEGACY_LIVE_EXPLORATION_WIDGET_KEY = "codex-live-explore";
const LEGACY_FINAL_EXPLORATION_WIDGET_KEY = "codex-final-explore";

function clearLegacyExplorationWidgets(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.setWidget(LEGACY_LIVE_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
  ctx.ui.setWidget(LEGACY_FINAL_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
}

function removeLiveExplorationStatus(pi: ExtensionAPI): void {
  pi.events.emit("editor:remove-status-segment", {
    key: LIVE_EXPLORATION_SEGMENT_KEY,
  } as RemoveStatusSegmentPayload);
}

function explorationWidgetLines(
  ctx: Pick<ExtensionContext, "ui">,
  tracker: ExplorationTracker,
): string[] {
  const lines: string[] = [];
  const completedGroups = tracker.completedExplorationGroups();
  const activeGroup = tracker.latestActiveExplorationGroup();

  if (completedGroups.length > 0) {
    lines.push(...combinedExplorationSummaryLines(ctx.ui.theme, completedGroups));
  }

  if (activeGroup?.items.length) {
    lines.push(ctx.ui.theme.fg("accent", liveExplorationSummary(activeGroup)));
  }

  return lines;
}

export function clearWorkingMessage(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.setWorkingMessage();
}

export function setLiveExplorationStatus(pi: ExtensionAPI, tracker: ExplorationTracker): void {
  const latestGroup = tracker.latestActiveExplorationGroup();
  if (!latestGroup?.items.length) {
    removeLiveExplorationStatus(pi);
    return;
  }

  pi.events.emit("editor:set-status-segment", {
    key: LIVE_EXPLORATION_SEGMENT_KEY,
    text: tracker.liveExplorationStatusText() ?? "Exploring",
    align: "left",
    priority: 20,
  } as SetStatusSegmentPayload);
}

export function setExplorationWidget(
  ctx: Pick<ExtensionContext, "ui">,
  tracker: ExplorationTracker,
): void {
  const lines = explorationWidgetLines(ctx, tracker);
  if (lines.length === 0) {
    clearExplorationWidget(ctx);
    return;
  }

  ctx.ui.setWidget(EXPLORATION_WIDGET_KEY, lines, { placement: "aboveEditor" });
  clearLegacyExplorationWidgets(ctx);
}

export function clearExplorationWidget(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.setWidget(EXPLORATION_WIDGET_KEY, undefined, { placement: "aboveEditor" });
  clearLegacyExplorationWidgets(ctx);
}

export function clearLiveExplorationStatus(pi: ExtensionAPI): void {
  removeLiveExplorationStatus(pi);
}

export function syncLiveExplorationStatus(
  pi: ExtensionAPI,
  tracker: ExplorationTracker,
  ctx?: Pick<ExtensionContext, "ui">,
): void {
  const text = tracker.liveExplorationStatusText();
  if (!text) {
    removeLiveExplorationStatus(pi);
    if (ctx) {
      setExplorationWidget(ctx, tracker);
    }
    return;
  }

  setLiveExplorationStatus(pi, tracker);
  if (ctx) {
    setExplorationWidget(ctx, tracker);
  }
}
