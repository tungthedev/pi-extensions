import type { Theme } from "@mariozechner/pi-coding-agent";

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import path from "node:path";

import type { EditorStatusState } from "./status-state.ts";

const HORIZONTAL = "─";
const HORIZONTAL_LEFT_HALF = "╶";
const HORIZONTAL_RIGHT_HALF = "╴";
const STATUS_SEPARATOR = "╶╴";

export function formatLoadSkillsLegend(loadSkillsEnabled?: boolean): string | undefined {
  if (loadSkillsEnabled === undefined) return undefined;
  return loadSkillsEnabled ? "w. Skills" : "wo. Skills";
}

export function formatEditorBorderLegend(
  toolSetLabel?: string,
  modeShortcut?: string,
): string | undefined {
  if (!toolSetLabel) return undefined;

  return modeShortcut ? `${toolSetLabel} (${modeShortcut})` : toolSetLabel;
}

export function formatSkillCountLabel(skillCount?: number): string | undefined {
  if (skillCount === undefined) return undefined;
  return `${Math.max(0, skillCount)} skills`;
}

export function formatTopBorderLine(width: number, legend?: string): string {
  const innerWidth = Math.max(0, width - 2);
  if (!legend) return `╭${HORIZONTAL.repeat(innerWidth)}╮`;

  const legendText = truncateToWidth(` ${legend} `, Math.max(0, innerWidth - 1));
  if (!legendText) return `╭${HORIZONTAL.repeat(innerWidth)}╮`;

  const remaining = innerWidth - visibleWidth(legendText);
  const leftFill = remaining > 0 ? 1 : 0;
  const rightFill = Math.max(0, remaining - leftFill);

  return `╭${HORIZONTAL.repeat(leftFill)}${legendText}${HORIZONTAL.repeat(rightFill)}╮`;
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

const CONTEXT_BAR_WIDTH = 10;
const CONTEXT_BAR_FIXED_BACKGROUNDS = {
  success: "#3f8f62",
  warning: "#a9752f",
  error: "#a64c5b",
} as const;
const CONTEXT_BAR_FIXED_BRIGHT_TEXT = "#fff4df";
const CONTEXT_BAR_FIXED_BRIGHT_TEXT_256 = 230;
type UsageColor = "success" | "warning" | "error" | "muted";
type UsageBackground = Parameters<Theme["bg"]>[0];
type UsageBackgroundRole = "tray" | "success" | "warning" | "error";

function colorBorder(theme: Theme, text: string): string {
  return theme.fg("muted", text);
}

function colorEmbeddedBorderEdges(theme: Theme, text: string): string {
  let remaining = text;
  let prefix = "";
  let suffix = "";
  if (remaining.startsWith(HORIZONTAL_RIGHT_HALF)) {
    prefix = colorBorder(theme, HORIZONTAL_RIGHT_HALF);
    remaining = remaining.slice(HORIZONTAL_RIGHT_HALF.length);
  }
  if (remaining.endsWith(HORIZONTAL_LEFT_HALF)) {
    suffix = colorBorder(theme, HORIZONTAL_LEFT_HALF);
    remaining = remaining.slice(0, -HORIZONTAL_LEFT_HALF.length);
  }
  return `${prefix}${remaining}${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function usageFillColor(percent: number): Exclude<UsageColor, "muted"> {
  const clampedPercent = clamp(percent, 0, 100);
  if (clampedPercent > 70) return "error";
  if (clampedPercent > 50) return "warning";
  return "success";
}

function colorUsageTray(theme: Theme | undefined, text: string): string {
  return theme ? theme.bg("selectedBg", text) : text;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length !== 6) throw new Error(`Invalid hex color: ${hex}`);

  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function backgroundAnsi(theme: Theme, role: UsageBackgroundRole): string {
  if (role === "tray") return theme.getBgAnsi("selectedBg");

  if (theme.getColorMode() !== "truecolor") {
    const fallback: Record<Exclude<UsageBackgroundRole, "tray">, UsageBackground> = {
      success: "toolSuccessBg",
      warning: "toolPendingBg",
      error: "toolErrorBg",
    };
    return theme.getBgAnsi(fallback[role]);
  }

  const { r, g, b } = hexToRgb(CONTEXT_BAR_FIXED_BACKGROUNDS[role]);
  return `\u001b[48;2;${r};${g};${b}m`;
}

function foregroundAnsi(theme: Theme, role: Exclude<UsageBackgroundRole, "tray">): string {
  if (role === "success") return theme.getFgAnsi("text");
  if (theme.getColorMode() !== "truecolor")
    return `\u001b[38;5;${CONTEXT_BAR_FIXED_BRIGHT_TEXT_256}m`;

  const { r, g, b } = hexToRgb(CONTEXT_BAR_FIXED_BRIGHT_TEXT);
  return `\u001b[38;2;${r};${g};${b}m`;
}

function colorUsageCell(theme: Theme | undefined, role: UsageBackgroundRole, text = " "): string {
  if (!theme) return text;
  return `${backgroundAnsi(theme, role)}${text}\u001b[0m`;
}

function colorUsageOverlay(
  theme: Theme | undefined,
  text: string,
  role: UsageBackgroundRole,
): string {
  if (!theme) return text;
  if (role === "tray") {
    return `${backgroundAnsi(theme, role)}${theme.getFgAnsi("text")}${text}\u001b[0m`;
  }
  return `${backgroundAnsi(theme, role)}${foregroundAnsi(theme, role)}${text}\u001b[0m`;
}

function formatUsagePercent(percent: number): string {
  return `${Math.round(clamp(percent, 0, 100))}%`;
}

function formatThinkingGlyph(thinkingLevel?: string, theme?: Theme): string | undefined {
  const level = thinkingLevel && thinkingLevel !== "off" ? thinkingLevel : "off";
  const glyph =
    level === "low" ? "◔" : level === "medium" ? "◑" : level === "high" ? "◕" : level === "xhigh" ? "●" : "○";
  return colorThinkingLevel(level, glyph, theme);
}

function colorThinkingLevel(level: string, text: string, theme?: Theme): string {
  if (!theme) return text;
  if (level === "off") return theme.fg("dim", text);
  if (level === "low") return theme.fg("muted", text);
  if (level === "medium") return theme.fg("accent", text);
  if (level === "xhigh") return theme.fg("error", theme.bold(text));
  return theme.fg("warning", text);
}

function compactModelId(modelId: string, maxWidth: number): string {
  if (visibleWidth(modelId) <= maxWidth) return modelId;
  const stripped = modelId.replace(/^(gpt-|claude-)/i, "");
  return truncateToWidth(stripped, maxWidth, "");
}

function formatCompactUsageCell(usage?: EditorStatusState["usage"], theme?: Theme): string | undefined {
  if (!usage || usage.percent == null || !usage.contextWindow) return undefined;
  const glyphs = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
  const percent = clamp(usage.percent, 0, 100);
  const glyph = glyphs[Math.min(glyphs.length - 1, Math.floor((percent / 100) * glyphs.length))] ?? "▏";
  const coloredGlyph = theme ? theme.fg(usageFillColor(percent), glyph) : glyph;
  return `${coloredGlyph} ${formatCompactNumber(usage.contextWindow)}`;
}

function formatGitChanges(changes?: EditorStatusState["gitChanges"], theme?: Theme): string | undefined {
  if (!changes || (changes.added <= 0 && changes.removed <= 0)) return undefined;
  const added = `+${Math.max(0, changes.added)}`;
  const removed = `-${Math.max(0, changes.removed)}`;
  if (!theme) return `${added} ${removed}`;
  return `${theme.fg("success", added)} ${theme.fg("error", removed)}`;
}

function buildUsageBarCells(
  percent: number,
  theme?: Theme,
): {
  cells: string[];
  fillLength: number;
} {
  const clampedPercent = clamp(percent, 0, 100);
  const fillLength = Math.round((clampedPercent / 100) * CONTEXT_BAR_WIDTH);
  const fillColor = usageFillColor(clampedPercent);
  const rendered: string[] = [];

  for (let index = 0; index < CONTEXT_BAR_WIDTH; index += 1) {
    if (index < fillLength) {
      rendered.push(colorUsageCell(theme, fillColor));
      continue;
    }

    rendered.push(colorUsageCell(theme, "tray"));
  }

  return { cells: rendered, fillLength };
}

function overlayUsageLabel(
  cells: string[],
  percent: number,
  fillLength: number,
  theme?: Theme,
): string[] {
  const clampedPercent = clamp(percent, 0, 100);
  const label = formatUsagePercent(clampedPercent);
  const alignRight = clampedPercent <= 50;
  const startIndex = alignRight ? CONTEXT_BAR_WIDTH - label.length : 0;

  if (alignRight) {
    for (let index = fillLength; index < startIndex; index += 1) {
      cells[index] = colorUsageTray(theme, " ");
    }
  }

  const overlayRole: UsageBackgroundRole = alignRight ? "tray" : usageFillColor(clampedPercent);
  for (let index = 0; index < label.length; index += 1) {
    cells[startIndex + index] = colorUsageOverlay(theme, label[index] ?? "", overlayRole);
  }

  return cells;
}

function buildUsageBar(percent: number, theme?: Theme): string {
  const { cells, fillLength } = buildUsageBarCells(percent, theme);
  return overlayUsageLabel(cells, percent, fillLength, theme).join("");
}

function truncateSuffix(prefix: string, suffix: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(`${prefix}${suffix}`) <= maxWidth) return `${prefix}${suffix}`;
  if (visibleWidth(prefix) >= maxWidth) return prefix.slice(0, maxWidth);

  let truncated = suffix;
  while (truncated.length > 0 && visibleWidth(`${prefix}${truncated}`) > maxWidth) {
    truncated = truncated.slice(1);
  }

  return `${prefix}${truncated}`;
}

function truncatePathFromLeft(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(value) <= maxWidth) return value;

  const separator = value.includes("\\") && !value.includes("/") ? "\\" : "/";
  const prefix = `⋯${separator}`;
  const parts = value.split(/[\\/]+/).filter((part) => part.length > 0);
  const lastPart = parts.at(-1);
  if (!lastPart) return truncateSuffix("...", value, maxWidth);

  let kept = lastPart;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const candidate = `${parts[index]}${separator}${kept}`;
    if (visibleWidth(`${prefix}${candidate}`) > maxWidth) break;
    kept = candidate;
  }

  return truncateSuffix(prefix, kept, maxWidth);
}

export function formatUsageSummary(
  usage?: EditorStatusState["usage"],
  theme?: Theme,
): string | undefined {
  if (!usage || usage.percent == null || !usage.contextWindow) return undefined;
  return `${buildUsageBar(usage.percent, theme)} ${formatCompactNumber(usage.contextWindow)}`;
}

export function formatCompactUsageSummary(usage?: EditorStatusState["usage"]): string | undefined {
  if (!usage || usage.percent == null) return undefined;
  return formatUsagePercent(usage.percent);
}

export function formatLeftStatus(state: EditorStatusState, theme?: Theme): string {
  const modelPart = state.modelId
    ? [
        state.modelId,
        state.thinkingLevel && state.thinkingLevel !== "off"
          ? colorThinkingLevel(state.thinkingLevel, state.thinkingLevel, theme)
          : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : undefined;
  const usagePart = formatUsageSummary(state.usage, theme);
  return [modelPart, usagePart].filter((part): part is string => Boolean(part)).join(" · ");
}

export function formatRightStatus(
  state: EditorStatusState,
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  const branch = state.gitBranch?.trim();
  const cwd = state.cwd;
  if (!cwd && !branch) return "";
  if (!branch) return truncatePathFromLeft(cwd ?? "", maxWidth);
  if (!cwd) return truncateSuffix("", branch, maxWidth);

  const separator = " · ";
  const full = `${cwd}${separator}${branch}`;
  if (visibleWidth(full) <= maxWidth) return full;

  const branchSuffix = `${separator}${branch}`;
  const cwdBudget = Math.max(0, maxWidth - visibleWidth(branchSuffix));
  if (cwdBudget <= 0) return truncateSuffix("", branch, maxWidth);

  return `${truncatePathFromLeft(cwd, cwdBudget)}${branchSuffix}`;
}

export function formatBottomLeftStatus(
  state: EditorStatusState,
  theme?: Theme,
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  const modelPart = state.modelId
    ? [
        state.modelId,
        state.thinkingLevel && state.thinkingLevel !== "off"
          ? colorThinkingLevel(state.thinkingLevel, state.thinkingLevel, theme)
          : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : undefined;
  const usagePart = formatUsageSummary(state.usage, theme);
  const separator = theme ? colorBorder(theme, STATUS_SEPARATOR) : STATUS_SEPARATOR;
  const full = [modelPart, usagePart].filter((part): part is string => Boolean(part)).join(separator);
  if (visibleWidth(full) <= maxWidth || !usagePart) return full;

  const usageWidth = visibleWidth(usagePart);
  const separatorWidth = visibleWidth(STATUS_SEPARATOR);
  const modelBudget = Math.max(0, maxWidth - usageWidth - separatorWidth);
  const renderedModel = modelPart ? truncateToWidth(modelPart, modelBudget, "") : "";
  if (renderedModel) return `${renderedModel}${separator}${usagePart}`;
  return truncateToWidth(usagePart, maxWidth, "");
}

export function formatCompactBottomLeftStatus(
  state: EditorStatusState,
  theme?: Theme,
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  const thinkingPart = formatThinkingGlyph(state.thinkingLevel, theme);
  const usagePart = formatCompactUsageCell(state.usage, theme);
  const separator = theme ? colorBorder(theme, STATUS_SEPARATOR) : STATUS_SEPARATOR;

  const renderModelPart = (budget: number): string => {
    const model = state.modelId ? compactModelId(state.modelId, Math.max(0, budget - 2)) : "";
    return [thinkingPart, model].filter((part): part is string => Boolean(part)).join(" ");
  };

  const modelPart = renderModelPart(Number.POSITIVE_INFINITY);
  const full = [modelPart, usagePart].filter((part): part is string => Boolean(part)).join(separator);
  if (visibleWidth(full) <= maxWidth || !usagePart) return full;

  const usageWidth = visibleWidth(usagePart);
  const separatorWidth = visibleWidth(separator);
  const modelBudget = Math.max(0, maxWidth - usageWidth - separatorWidth);
  const renderedModel = renderModelPart(modelBudget);
  if (renderedModel) return `${renderedModel}${separator}${usagePart}`;
  return truncateToWidth(usagePart, maxWidth, "");
}

function basenamePath(value: string): string {
  const normalized = value.replace(/[\\/]+$/, "");
  return path.basename(normalized) || normalized;
}

function joinCompactMetadata(parts: string[], theme?: Theme): string {
  const separator = theme ? colorBorder(theme, STATUS_SEPARATOR) : STATUS_SEPARATOR;
  return parts.filter((part) => part.length > 0).join(separator);
}

export function formatCompactMetadataStatus(
  state: EditorStatusState,
  maxWidth = Number.POSITIVE_INFINITY,
  theme?: Theme,
): string {
  const folder = state.cwd ? basenamePath(state.cwd) : "";
  const branch = state.gitBranch?.trim() ?? "";
  const changes = formatGitChanges(state.gitChanges, theme) ?? "";

  const full = joinCompactMetadata([folder, branch, changes], theme);
  if (visibleWidth(full) <= maxWidth) return full;

  const withoutBranch = joinCompactMetadata([folder, changes], theme);
  const branchBudget = Math.max(
    0,
    maxWidth - visibleWidth(withoutBranch) - visibleWidth(STATUS_SEPARATOR),
  );
  const shortenedBranch = branch ? truncateToWidth(branch, branchBudget, "") : "";
  const withShortBranch = joinCompactMetadata([folder, shortenedBranch, changes], theme);
  if (visibleWidth(withShortBranch) <= maxWidth) return withShortBranch;

  if (visibleWidth(withoutBranch) <= maxWidth) return withoutBranch;

  const folderOnly = joinCompactMetadata([folder], theme);
  if (visibleWidth(folderOnly) <= maxWidth) return folderOnly;

  const changesOnly = joinCompactMetadata([changes], theme);
  if (visibleWidth(changesOnly) <= maxWidth) return changesOnly;

  return truncateToWidth(folderOnly || changesOnly, maxWidth, "");
}

export function formatBottomRightStatus(
  state: EditorStatusState,
  maxWidth = Number.POSITIVE_INFINITY,
  theme?: Theme,
): string {
  const branch = state.gitBranch?.trim();
  const branchText = branch
    ? [branch, formatGitChanges(state.gitChanges, theme)]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : undefined;
  const cwd = state.cwd;
  if (!cwd && !branchText) return "";
  if (!branchText) return truncatePathFromLeft(cwd ?? "", maxWidth);

  const branchSuffix = ` (${branchText})`;
  if (!cwd) return truncateSuffix("", branchSuffix.trim(), maxWidth);

  const full = `${cwd}${branchSuffix}`;
  if (visibleWidth(full) <= maxWidth) return full;

  const cwdBudget = Math.max(0, maxWidth - visibleWidth(branchSuffix));
  if (cwdBudget <= 0) return truncateSuffix("", branchSuffix.trim(), maxWidth);

  return `${truncatePathFromLeft(cwd, cwdBudget)}${branchSuffix}`;
}

export function buildTopBorderLine(
  theme: Theme,
  width: number,
  legend: string | undefined,
  styleLegend: (legendText: string) => string,
  rightLabel?: string,
  styleRightLabel: (labelText: string) => string = (labelText) => colorBorder(theme, labelText),
): string {
  const innerWidth = Math.max(0, width - 2);
  const rightText = rightLabel ? truncateToWidth(rightLabel, Math.max(0, innerWidth - 1)) : "";

  if (!legend && !rightText) {
    return colorBorder(theme, HORIZONTAL.repeat(width));
  }

  const legendBudget = Math.max(0, innerWidth - visibleWidth(rightText) - 2);
  const legendText = legend ? truncateToWidth(legend, legendBudget) : "";
  if (!legendText && !rightText) {
    return colorBorder(theme, HORIZONTAL.repeat(width));
  }

  const legendBlock = legendText
    ? colorBorder(theme, HORIZONTAL_RIGHT_HALF) + styleLegend(legendText) + colorBorder(theme, HORIZONTAL_LEFT_HALF)
    : "";
  const rightBlock = rightText
    ? colorBorder(theme, HORIZONTAL_RIGHT_HALF) + styleRightLabel(rightText) + colorBorder(theme, HORIZONTAL_LEFT_HALF)
    : "";
  const leftEdge = legendBlock ? "" : colorBorder(theme, HORIZONTAL);
  const rightEdge = rightBlock ? "" : colorBorder(theme, HORIZONTAL);
  const middleFill = Math.max(
    0,
    width - visibleWidth(leftEdge) - visibleWidth(legendBlock) - visibleWidth(rightBlock) - visibleWidth(rightEdge),
  );

  return (
    leftEdge +
    legendBlock +
    colorBorder(theme, HORIZONTAL.repeat(middleFill)) +
    rightBlock +
    rightEdge
  );
}

export function buildBottomBorderLine(
  theme: Theme,
  width: number,
  leftText: string,
  rightText: string,
  corners: { left: string; right: string },
): string {
  const innerWidth = Math.max(0, width - 2);
  if (!leftText && !rightText) {
    return colorBorder(theme, `${corners.left}${HORIZONTAL.repeat(innerWidth)}${corners.right}`);
  }

  const leftBudget = rightText
    ? Math.max(0, Math.floor((innerWidth - 4) / 2))
    : Math.max(0, innerWidth - 2);
  const renderedLeft = truncateToWidth(leftText, leftBudget);
  const leftBlock = renderedLeft
    ? colorBorder(theme, HORIZONTAL_RIGHT_HALF) + renderedLeft + colorBorder(theme, HORIZONTAL_LEFT_HALF)
    : "";
  const rightNeedsPrefix = Boolean(rightText) && !rightText.startsWith(HORIZONTAL_RIGHT_HALF);
  const rightNeedsSuffix = Boolean(rightText) && !rightText.endsWith(HORIZONTAL_LEFT_HALF);
  const rightBudget = Math.max(
    0,
    innerWidth - visibleWidth(leftBlock) - (rightNeedsPrefix ? 1 : 0) - (rightNeedsSuffix ? 1 : 0),
  );
  const renderedRight = truncateToWidth(rightText, rightBudget, "");
  const rightBlock = renderedRight
    ? (rightNeedsPrefix ? colorBorder(theme, HORIZONTAL_RIGHT_HALF) : "") +
      colorEmbeddedBorderEdges(theme, renderedRight) +
      (rightNeedsSuffix ? colorBorder(theme, HORIZONTAL_LEFT_HALF) : "")
    : "";
  const fill = Math.max(0, innerWidth - visibleWidth(leftBlock) - visibleWidth(rightBlock));

  return (
    colorBorder(theme, corners.left) +
    leftBlock +
    (fill > 0 ? colorBorder(theme, HORIZONTAL.repeat(fill)) : "") +
    rightBlock +
    colorBorder(theme, corners.right)
  );
}
