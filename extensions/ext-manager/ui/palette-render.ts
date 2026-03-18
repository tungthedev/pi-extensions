import type { Theme } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";

export function pad(text: string, width: number): string {
  const missing = Math.max(0, width - visibleWidth(text));
  return text + " ".repeat(missing);
}

export function boxLine(left: string, inner: string, right: string): string {
  return `${left}${inner}${right}`;
}

export function makeTop(width: number, title: string, theme: Theme): string {
  const plainTitle = ` ${title} `;
  const left = "─".repeat(2);
  const rightWidth = Math.max(0, width - visibleWidth(plainTitle) - visibleWidth(left));
  const right = "─".repeat(rightWidth);
  return `┌${theme.fg("accent", left)}${theme.fg("accent", plainTitle)}${theme.fg("accent", right)}┐`;
}

export function makeBottom(width: number, footer: string | undefined, theme: Theme): string {
  const plainFooter = footer ? ` ${footer} ` : "";
  const left = "─".repeat(2);
  const rightWidth = Math.max(0, width - visibleWidth(plainFooter) - visibleWidth(left));
  const right = "─".repeat(rightWidth);
  return `└${theme.fg("accent", left)}${footer ? theme.fg("dim", plainFooter) : ""}${theme.fg("accent", right)}┘`;
}
