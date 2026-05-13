import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { formatDuration } from "./format.js";
import type { GoalStatus, ThreadGoal } from "./types.js";

export const GOAL_WIDGET_KEY = "goal";

const STATUS_GLYPHS: Record<GoalStatus, string> = {
  active: "●",
  paused: "‖",
  budgetLimited: "▲",
  complete: "●",
};

const STATUS_COLORS: Record<GoalStatus, "accent" | "success" | "warning" | "error"> = {
  active: "accent",
  paused: "warning",
  budgetLimited: "error",
  complete: "success",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return String(Math.round(value));

  const units = ["k", "M", "B"];
  let scaled = value;
  let unitIndex = -1;
  while (Math.abs(scaled) >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  const rendered = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rendered.replace(/\.0$/, "")}${units[unitIndex] ?? ""}`;
}

function usageFillColor(percent: number): "success" | "warning" | "error" {
  const clampedPercent = clamp(percent, 0, 100);
  if (clampedPercent > 70) return "error";
  if (clampedPercent > 50) return "warning";
  return "success";
}

function formatCompactUsageGlyph(
  percent: number,
  theme: ExtensionContext["ui"]["theme"],
): string {
  const glyphs = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
  const clampedPercent = clamp(percent, 0, 100);
  const glyph = glyphs[Math.min(glyphs.length - 1, Math.floor((clampedPercent / 100) * glyphs.length))] ?? "▏";
  return theme.fg(usageFillColor(clampedPercent), glyph);
}

function tokenUsageText(goal: ThreadGoal): string {
  if (goal.tokenBudget === null) {
    return formatCompactNumber(goal.usage.tokensUsed);
  }

  return `${formatCompactNumber(goal.usage.tokensUsed)}/${formatCompactNumber(goal.tokenBudget)}`;
}

function plainTokenUsage(goal: ThreadGoal): string {
  const usageText = tokenUsageText(goal);
  return goal.tokenBudget === null ? usageText : `█ ${usageText}`;
}

function tokenUsage(goal: ThreadGoal, theme: ExtensionContext["ui"]["theme"]): string {
  const usageText = tokenUsageText(goal);
  if (goal.tokenBudget === null) {
    return theme.fg("muted", usageText);
  }

  const percent = goal.tokenBudget <= 0 ? 100 : (goal.usage.tokensUsed / goal.tokenBudget) * 100;
  return `${formatCompactUsageGlyph(percent, theme)} ${theme.fg("muted", usageText)}`;
}

function metadataParts(goal: ThreadGoal, theme: ExtensionContext["ui"]["theme"]): string[] {
  return [
    theme.fg("muted", formatDuration(goal.usage.activeSeconds)),
    tokenUsage(goal, theme),
  ].filter(
    (part): part is string => Boolean(part),
  );
}

function plainMetadataParts(goal: ThreadGoal): string[] {
  return [formatDuration(goal.usage.activeSeconds), plainTokenUsage(goal)].filter(
    (part): part is string => Boolean(part),
  );
}

function objectiveBudget(maxWidth: number | undefined, prefix: string, suffix: string): number | undefined {
  if (maxWidth === undefined) return undefined;
  const reserved = visibleWidth(prefix) + visibleWidth(suffix);
  return Math.max(1, maxWidth - reserved);
}

export function renderGoalWidgetLine(
  goal: ThreadGoal,
  theme: ExtensionContext["ui"]["theme"],
  maxWidth?: number,
): string {
  const glyph = STATUS_GLYPHS[goal.status];
  const parts = metadataParts(goal, theme);
  const separator = theme.fg("muted", " · ");
  const prefix = `${theme.fg(STATUS_COLORS[goal.status], glyph)} `;
  const metadata = parts.join(separator);
  const plainMetadata = plainMetadataParts(goal).join(" · ");

  if (maxWidth !== undefined) {
    const plainPrefix = `${glyph} `;
    const metadataWidth = visibleWidth(plainMetadata);
    const leftBudget = Math.max(visibleWidth(plainPrefix), maxWidth - metadataWidth - 1);
    const objectiveWidth = Math.max(0, leftBudget - visibleWidth(plainPrefix));
    const objective = truncateToWidth(goal.objective, objectiveWidth, "...");
    const leftWidth = visibleWidth(plainPrefix) + visibleWidth(objective);
    const padding = " ".repeat(Math.max(1, maxWidth - leftWidth - metadataWidth));
    return `${prefix}${objective}${padding}${metadata}`;
  }

  const suffix = `${separator}${metadata}`;
  const budget = objectiveBudget(maxWidth, `${glyph} `, ` · ${plainMetadata}`);
  const objective = budget === undefined ? goal.objective : truncateToWidth(goal.objective, budget);
  return `${prefix}${objective}${suffix}`;
}

export class GoalWidget {
  constructor(
    private readonly goal: ThreadGoal,
    private readonly theme: ExtensionContext["ui"]["theme"],
  ) {}

  render(width: number): string[] {
    if (width <= 2) {
      return [" ".repeat(Math.max(0, width))];
    }
    return [` ${renderGoalWidgetLine(this.goal, this.theme, width - 2)} `];
  }

  invalidate(): void {}
}

export function syncGoalWidget(ctx: ExtensionContext, goal: ThreadGoal | null): void {
  if (ctx.hasUI === false) return;

  if (!goal) {
    ctx.ui.setWidget(GOAL_WIDGET_KEY, undefined, { placement: "aboveEditor" });
    return;
  }

  ctx.ui.setWidget(GOAL_WIDGET_KEY, (_tui, theme) => new GoalWidget(goal, theme), {
    placement: "aboveEditor",
  });
}
