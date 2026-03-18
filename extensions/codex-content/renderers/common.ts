import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

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

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

export function expandHintLine(
  theme: Theme,
  hiddenCount?: number,
  hiddenLabel = "line",
): string {
  const text =
    typeof hiddenCount === "number" && hiddenCount > 0
      ? `... +${hiddenCount} more ${pluralize(hiddenLabel, hiddenCount)} (Ctrl+O to expand)`
      : "(Ctrl+O to expand)";
  return detailLine(theme, text, true);
}

export function renderLines(lines: string[]): Text {
  return new Text(lines.join("\n"), 0, 0);
}
