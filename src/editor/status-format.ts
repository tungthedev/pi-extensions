import type { Theme } from "@mariozechner/pi-coding-agent";

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import type { EditorStatusState } from "./status-state.ts";

const HORIZONTAL = "─";

export function formatEditorBorderLegend(toolSetLabel?: string): string | undefined {
  return toolSetLabel ? `Mode: ${toolSetLabel}` : undefined;
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
  const prefix = `...${separator}`;
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

export function formatLeftStatus(state: EditorStatusState, theme?: Theme): string {
  const modelPart = state.modelId
    ? [
        state.modelId,
        state.thinkingLevel && state.thinkingLevel !== "off" ? state.thinkingLevel : undefined,
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

export function buildTopBorderLine(
  theme: Theme,
  width: number,
  legend: string | undefined,
  styleLegend: (legendText: string) => string,
): string {
  const innerWidth = Math.max(0, width - 2);
  if (!legend) {
    return colorBorder(theme, `╭${HORIZONTAL.repeat(innerWidth)}╮`);
  }

  const legendText = truncateToWidth(` ${legend} `, Math.max(0, innerWidth - 1));
  if (!legendText) {
    return colorBorder(theme, `╭${HORIZONTAL.repeat(innerWidth)}╮`);
  }

  const remaining = innerWidth - visibleWidth(legendText);
  const leftFill = remaining > 0 ? 1 : 0;
  const rightFill = Math.max(0, remaining - leftFill);

  return (
    colorBorder(theme, `╭${HORIZONTAL.repeat(leftFill)}`) +
    styleLegend(legendText) +
    colorBorder(theme, `${HORIZONTAL.repeat(rightFill)}╮`)
  );
}

export function buildBottomBorderLine(
  theme: Theme,
  width: number,
  indicator: string,
  corners: { left: string; right: string },
): string {
  const innerWidth = Math.max(0, width - 2);
  if (indicator.length === 0) {
    return colorBorder(theme, `${corners.left}${HORIZONTAL.repeat(innerWidth)}${corners.right}`);
  }

  const fill = Math.max(0, innerWidth - 2 - visibleWidth(indicator));
  return (
    colorBorder(theme, `${corners.left}${HORIZONTAL}${HORIZONTAL.repeat(fill)}`) +
    indicator +
    colorBorder(theme, `${HORIZONTAL}${corners.right}`)
  );
}
