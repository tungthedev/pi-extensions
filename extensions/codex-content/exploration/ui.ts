import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { RemoveStatusSegmentPayload, SetStatusSegmentPayload } from "../editor/types.ts";
import { combinedExplorationSummaryLines, liveExplorationSummary } from "./state.ts";
import { EXPLORATION_WIDGET_KEY, LIVE_EXPLORATION_SEGMENT_KEY } from "./types.ts";
import type { ExplorationTracker } from "./state.ts";

const LEGACY_LIVE_EXPLORATION_WIDGET_KEY = "codex-live-explore";
const LEGACY_FINAL_EXPLORATION_WIDGET_KEY = "codex-final-explore";

export function clearWorkingMessage(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.setWorkingMessage();
}

export function setLiveExplorationStatus(
  pi: ExtensionAPI,
  tracker: ExplorationTracker,
): void {
  const latestGroup = tracker.latestActiveExplorationGroup();
  if (!latestGroup || latestGroup.items.length === 0) {
    pi.events.emit("editor:remove-status-segment", {
      key: LIVE_EXPLORATION_SEGMENT_KEY,
    } as RemoveStatusSegmentPayload);
    return;
  }

  pi.events.emit("editor:set-status-segment", {
    key: LIVE_EXPLORATION_SEGMENT_KEY,
    text: tracker.liveExplorationStatusText() ?? "Exploring",
    align: "left",
    priority: 20,
  } as SetStatusSegmentPayload);
}

export function setLegacyLiveExplorationWidget(
  ctx: Pick<ExtensionContext, "ui">,
  tracker: ExplorationTracker,
): void {
  setExplorationWidget(ctx, tracker);
}

export function clearLegacyLiveExplorationWidget(ctx: Pick<ExtensionContext, "ui">): void {
  clearExplorationWidget(ctx);
}

export function setExplorationWidget(
  ctx: Pick<ExtensionContext, "ui">,
  tracker: ExplorationTracker,
): void {
  const completedGroups = tracker.completedExplorationGroups();
  const activeGroup = tracker.latestActiveExplorationGroup();
  const lines: string[] = [];

  if (completedGroups.length > 0) {
    lines.push(...combinedExplorationSummaryLines(ctx.ui.theme, completedGroups));
  }

  if (activeGroup && activeGroup.items.length > 0) {
    lines.push(ctx.ui.theme.fg("accent", liveExplorationSummary(activeGroup)));
  }

  if (lines.length === 0) {
    clearExplorationWidget(ctx);
    return;
  }

  ctx.ui.setWidget(EXPLORATION_WIDGET_KEY, lines, { placement: "aboveEditor" });
  ctx.ui.setWidget(LEGACY_LIVE_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
  ctx.ui.setWidget(LEGACY_FINAL_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
}

export function clearExplorationWidget(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.setWidget(EXPLORATION_WIDGET_KEY, undefined, { placement: "aboveEditor" });
  ctx.ui.setWidget(LEGACY_LIVE_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
  ctx.ui.setWidget(LEGACY_FINAL_EXPLORATION_WIDGET_KEY, undefined, { placement: "belowEditor" });
}

export function clearLiveExplorationUI(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "ui">,
): void {
  pi.events.emit("editor:remove-status-segment", {
    key: LIVE_EXPLORATION_SEGMENT_KEY,
  } as RemoveStatusSegmentPayload);
  void ctx;
}

export function syncLiveExplorationStatus(
  pi: ExtensionAPI,
  tracker: ExplorationTracker,
  ctx?: Pick<ExtensionContext, "ui">,
): void {
  const text = tracker.liveExplorationStatusText();
  if (!text) {
    if (ctx) setExplorationWidget(ctx, tracker);
    return;
  }

  setLiveExplorationStatus(pi, tracker);
  if (ctx) {
    setExplorationWidget(ctx, tracker);
  }
}

export function setFinalExplorationWidget(
  ctx: Pick<ExtensionContext, "ui">,
  tracker: ExplorationTracker,
): void {
  setExplorationWidget(ctx, tracker);
}
