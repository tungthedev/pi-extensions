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

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function colorBorder(theme: Theme, text: string): string {
  return theme.fg("muted", text);
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

export function formatUsageSummary(usage?: EditorStatusState["usage"]): string | undefined {
  if (!usage || usage.percent == null || !usage.contextWindow) return undefined;
  return `${formatPercent(usage.percent)}/${formatCompactNumber(usage.contextWindow)}`;
}

export function formatLeftStatus(state: EditorStatusState): string {
  const modelPart = state.modelId
    ? [
        state.modelId,
        state.thinkingLevel && state.thinkingLevel !== "off" ? state.thinkingLevel : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : undefined;
  const usagePart = formatUsageSummary(state.usage);
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
