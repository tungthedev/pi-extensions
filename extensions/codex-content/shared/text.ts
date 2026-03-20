import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import path from "node:path";

export function shortenPath(value?: string): string {
  if (!value) return ".";

  const cwd = process.cwd();
  const resolvedPath = path.isAbsolute(value) ? path.resolve(value) : path.resolve(cwd, value);
  const relativePath = path.relative(cwd, resolvedPath);

  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath || ".";
  }

  return resolvedPath;
}

export function firstText(result: AgentToolResult<unknown>): string {
  const parts = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "");

  return parts.join("\n").replace(/\r/g, "").trim();
}

export function firstLine(text: string): string {
  const firstNonEmptyLine = text.split("\n").find((line) => line.trim());

  return firstNonEmptyLine?.trim() ?? "";
}

export function shortenText(value: string | undefined, max: number, fallback = ""): string {
  if (!value) return fallback;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export function summarizeList(items: string[], maxVisible = 2): string {
  if (items.length <= maxVisible) {
    return items.join(", ");
  }

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - visibleItems.length;
  return `${visibleItems.join(", ")}, +${hiddenCount} more`;
}

export function isErrorText(text: string): boolean {
  return /^error\b/i.test(firstLine(text));
}

export function parseExitCode(text: string): number | undefined {
  const match = text.match(/(?:exit code:?|exited with code)\s*(-?\d+)/i);
  if (!match) return undefined;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function previewLines(text: string, maxLines: number): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

export function stripExitCodeLines(lines: string[]): string[] {
  return lines.filter((line) => !/exit code:?\s*-?\d+/i.test(line));
}

export function countDiff(diff?: string): { added: number; removed: number } {
  if (!diff) return { added: 0, removed: 0 };

  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    if (line.startsWith("-")) removed += 1;
  }

  return { added, removed };
}

export function summarizeCommand(command?: string): string {
  return shortenText(command, 100, "command");
}
