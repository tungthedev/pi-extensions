import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";

import { Container, Text } from "@mariozechner/pi-tui";

import { firstText } from "../shared/text.ts";

export function conciseResult(title: string, detail?: string): Text {
  return new Text(detail ? `${title} ${detail}` : title, 0, 0);
}

export function titleLine(
  theme: Theme,
  bulletColor: "text" | "success" | "error" | "accent",
  title: string,
  suffix?: string,
): string {
  const bullet = theme.fg(bulletColor, "•");
  const boldTitle = theme.bold(title);
  return suffix ? `${bullet} ${boldTitle} ${suffix}` : `${bullet} ${boldTitle}`;
}

export function detailLine(theme: Theme, text: string, first = false): string {
  const prefix = first ? "└ " : "  ";
  return `${theme.fg("dim", prefix)}${theme.fg("toolOutput", text)}`;
}

export function accentSuffix(theme: Theme, accentText: string, dimDetail?: string): string {
  const primaryText = theme.fg("accent", accentText);
  if (!dimDetail) return primaryText;
  return `${primaryText}${theme.fg("dim", ` ${dimDetail}`)}`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function expandHintText(hiddenCount?: number, hiddenLabel = "line"): string {
  if (typeof hiddenCount === "number" && hiddenCount > 0) {
    return `... +${hiddenCount} more ${pluralize(hiddenLabel, hiddenCount)} (Ctrl+O to expand)`;
  }

  return "(Ctrl+O to expand)";
}

export function expandHintLine(theme: Theme, hiddenCount?: number, hiddenLabel = "line"): string {
  return `${theme.fg("dim", "  ")}${theme.fg("muted", expandHintText(hiddenCount, hiddenLabel))}`;
}

export function renderLines(lines: string[]): Text {
  return new Text(lines.join("\n"), 0, 0);
}

export function renderFallbackResult(
  result: AgentToolResult<unknown>,
  fallbackText = "(no output)",
): Text {
  return new Text(firstText(result) || fallbackText, 0, 0);
}

export function renderEmptySlot(): Container {
  return new Container();
}
