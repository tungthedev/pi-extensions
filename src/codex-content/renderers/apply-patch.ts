import type { Text } from "@mariozechner/pi-tui";

import { renderDiff, type AgentToolResult, type Theme } from "@mariozechner/pi-coding-agent";

import {
  countDiff,
  firstLine,
  firstText,
  previewLines,
  shortenPath,
  summarizeList,
} from "../shared/text.ts";
import { expandHintLine, renderLines } from "./common.ts";

type ApplyPatchAffected = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
};

type ApplyPatchFileAction = "added" | "modified" | "deleted" | "moved";

type ApplyPatchFile = {
  action?: ApplyPatchFileAction;
  path?: string;
  sourcePath?: string;
  diff?: string;
};

type ApplyPatchDetails = {
  exitCode?: number;
  affected?: ApplyPatchAffected;
  files?: ApplyPatchFile[];
};

const COLLAPSED_PREVIEW_LINES = 8;
const EXPANDED_PREVIEW_LINES = 24;

const APPLY_PATCH_ACTIONS: Record<ApplyPatchFileAction, { title: string; code: string }> = {
  added: { title: "Added", code: "A" },
  modified: { title: "Modified", code: "M" },
  deleted: { title: "Deleted", code: "D" },
  moved: { title: "Moved", code: "R" },
};

function patchAction(action: ApplyPatchFileAction | undefined): { title: string; code: string } {
  return APPLY_PATCH_ACTIONS[action ?? "modified"];
}

function describeApplyPatchFile(file: ApplyPatchFile): string {
  const targetPath = shortenPath(file.path);
  if (file.action === "moved") {
    return `${shortenPath(file.sourcePath)} → ${targetPath}`;
  }

  return targetPath;
}

function fileStatsSuffix(diff?: string): string {
  if (!diff) return "";
  const stats = countDiff(diff);
  return ` (+${stats.added} -${stats.removed})`;
}

function allAffectedPaths(affected: ApplyPatchAffected | undefined): string[] {
  if (!affected) return [];
  return [...(affected.added ?? []), ...(affected.modified ?? []), ...(affected.deleted ?? [])];
}

function summarizePaths(paths: string[]): string {
  return summarizeList(paths.map((filePath) => shortenPath(filePath)));
}

function summarizeFiles(files: ApplyPatchFile[]): string {
  const fileSummaries = files.map(
    (file) => `${describeApplyPatchFile(file)}${fileStatsSuffix(file.diff)}`,
  );
  return summarizeList(fileSummaries);
}

function renderFileDiff(file: ApplyPatchFile): string[] {
  if (!file.diff) return [];
  return renderDiff(file.diff, { filePath: file.path }).split("\n");
}

function renderHeader(
  theme: Theme,
  title: string,
  suffix?: string,
  stats?: string,
  tone: "default" | "error" = "default",
): string {
  const titleText = theme.bold(title);
  const coloredTitle = theme.fg(tone === "error" ? "error" : "toolTitle", titleText);
  if (!suffix && !stats) return coloredTitle;

  const parts = [coloredTitle];
  if (suffix) parts.push(theme.fg("accent", suffix));
  if (stats) parts.push(stats);
  return parts.join(" ");
}

function renderStats(theme: Theme, diff?: string): string | undefined {
  if (!diff) return undefined;
  const stats = countDiff(diff);
  return theme.fg("muted", `(+${stats.added} -${stats.removed})`);
}

function previewDetailLines(lines: string[], expanded: boolean): { visible: string[]; hidden: number } {
  const maxLines = expanded ? EXPANDED_PREVIEW_LINES : COLLAPSED_PREVIEW_LINES;
  const visible = lines.slice(0, maxLines);
  return { visible, hidden: Math.max(0, lines.length - visible.length) };
}

function buildAffectedDetailLines(theme: Theme, details: ApplyPatchDetails): string[] {
  return [
    ...(details.affected?.added ?? []).map((filePath) =>
      `${theme.fg("toolDiffAdded", "A")} ${theme.fg("toolOutput", shortenPath(filePath))}`,
    ),
    ...(details.affected?.modified ?? []).map((filePath) =>
      `${theme.fg("toolTitle", "M")} ${theme.fg("toolOutput", shortenPath(filePath))}`,
    ),
    ...(details.affected?.deleted ?? []).map((filePath) =>
      `${theme.fg("toolDiffRemoved", "D")} ${theme.fg("toolOutput", shortenPath(filePath))}`,
    ),
  ];
}

function buildSingleFileDetailLines(file: ApplyPatchFile): string[] {
  return renderFileDiff(file);
}

function buildMultiFileDetailLines(theme: Theme, files: ApplyPatchFile[]): string[] {
  const lines: string[] = [];

  for (const [index, file] of files.entries()) {
    const action = patchAction(file.action);
    const stats = renderStats(theme, file.diff);
    lines.push(
      `${theme.fg("toolTitle", action.title)} ${theme.fg("accent", describeApplyPatchFile(file))}${stats ? ` ${stats}` : ""}`,
    );
    lines.push(...renderFileDiff(file));

    if (index < files.length - 1) {
      lines.push("");
    }
  }

  return lines;
}

function buildApplyPatchDetailLines(theme: Theme, details: ApplyPatchDetails): string[] {
  const files = details.files ?? [];
  if (files.length === 1) {
    return buildSingleFileDetailLines(files[0]);
  }

  if (files.length > 1) {
    return buildMultiFileDetailLines(theme, files);
  }

  return buildAffectedDetailLines(theme, details);
}

export function summarizeApplyPatchResult(details: ApplyPatchDetails | undefined): {
  title: string;
  suffix?: string;
} {
  const files = details?.files ?? [];
  if (files.length === 1) {
    return {
      title: patchAction(files[0].action).title,
      suffix: describeApplyPatchFile(files[0]),
    };
  }

  if (files.length > 1) {
    return {
      title: "Patched",
      suffix: summarizeFiles(files),
    };
  }

  const affected = details?.affected;
  const added = affected?.added ?? [];
  const modified = affected?.modified ?? [];
  const deleted = affected?.deleted ?? [];
  const total = added.length + modified.length + deleted.length;

  if (total === 1) {
    if (added.length === 1) return { title: "Added", suffix: shortenPath(added[0]) };
    if (modified.length === 1) return { title: "Modified", suffix: shortenPath(modified[0]) };
    if (deleted.length === 1) return { title: "Deleted", suffix: shortenPath(deleted[0]) };
  }

  if (total > 0) {
    return {
      title: "Patched",
      suffix: summarizePaths(allAffectedPaths(affected)),
    };
  }

  return { title: "Patched" };
}

function renderFailedPatchResult(
  theme: Theme,
  summary: ReturnType<typeof summarizeApplyPatchResult>,
  text: string,
  singleFile: ApplyPatchFile | undefined,
  expanded: boolean,
): Text {
  const lines = [
    renderHeader(theme, "Patch failed", summary.suffix, renderStats(theme, singleFile?.diff), "error"),
  ];
  const allPreviews = previewLines(text, Number.MAX_SAFE_INTEGER);
  const previews = allPreviews.slice(0, expanded ? 12 : 6);

  if (previews.length > 0) {
    lines.push("");
    lines.push(...previews.map((line) => theme.fg("toolOutput", line)));
  }

  if (previews.length === 0 && text) {
    lines.push("", theme.fg("toolOutput", firstLine(text)));
  }

  if (!expanded) {
    const hiddenCount = Math.max(0, allPreviews.length - previews.length);
    if (hiddenCount > 0) {
      lines.push(expandHintLine(theme, hiddenCount, "line"));
    }
  }

  return renderLines(lines);
}

function renderSuccessfulPatchResult(
  theme: Theme,
  summary: ReturnType<typeof summarizeApplyPatchResult>,
  details: ApplyPatchDetails,
  expanded: boolean,
): Text {
  const files = details.files ?? [];
  const singleFile = files.length === 1 ? files[0] : undefined;
  const lines = [renderHeader(theme, summary.title, summary.suffix, renderStats(theme, singleFile?.diff))];
  const detailLines = buildApplyPatchDetailLines(theme, details);
  const { visible, hidden } = previewDetailLines(detailLines, expanded);

  if (visible.length > 0) {
    lines.push("");
    lines.push(...visible);
  }

  if (!expanded && hidden > 0) {
    lines.push(expandHintLine(theme, hidden, "line"));
  }

  return renderLines(lines);
}

export function renderApplyPatchResult(
  theme: Theme,
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const text = firstText(result);
  const details = (result.details ?? {}) as ApplyPatchDetails;
  const files = details.files ?? [];
  const singleFile = files.length === 1 ? files[0] : undefined;
  const failed =
    (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true ||
    (typeof details.exitCode === "number" && details.exitCode !== 0);
  const summary = summarizeApplyPatchResult(details);

  if (failed) {
    return renderFailedPatchResult(theme, summary, text, singleFile, expanded);
  }

  return renderSuccessfulPatchResult(theme, summary, details, expanded);
}
