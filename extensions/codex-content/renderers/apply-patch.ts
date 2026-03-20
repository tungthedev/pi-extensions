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
import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";

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

function buildAffectedDetailLines(theme: Theme, details: ApplyPatchDetails): string[] {
  return [
    ...(details.affected?.added ?? []).map((filePath) =>
      theme.fg("toolOutput", `A ${shortenPath(filePath)}`),
    ),
    ...(details.affected?.modified ?? []).map((filePath) =>
      theme.fg("toolOutput", `M ${shortenPath(filePath)}`),
    ),
    ...(details.affected?.deleted ?? []).map((filePath) =>
      theme.fg("toolOutput", `D ${shortenPath(filePath)}`),
    ),
  ];
}

function buildSingleFileDetailLines(file: ApplyPatchFile): string[] {
  return renderFileDiff(file);
}

function buildMultiFileDetailLines(theme: Theme, files: ApplyPatchFile[]): string[] {
  const lines: string[] = [];

  for (const [index, file] of files.entries()) {
    lines.push(
      theme.fg("toolOutput", `${patchAction(file.action).code} ${describeApplyPatchFile(file)}`),
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
  const singleFileStats = singleFile?.diff ? countDiff(singleFile.diff) : undefined;
  const singleFileStatsSuffix = singleFileStats
    ? theme.fg("dim", ` (+${singleFileStats.added} -${singleFileStats.removed})`)
    : "";
  const suffix = summary.suffix
    ? `${theme.fg("accent", summary.suffix)}${singleFileStatsSuffix}`
    : undefined;
  const lines = [titleLine(theme, "error", "Patch failed", suffix)];
  const allPreviews = previewLines(text, Number.MAX_SAFE_INTEGER);
  const previews = allPreviews.slice(0, expanded ? 6 : 3);

  for (const [index, line] of previews.entries()) {
    lines.push(detailLine(theme, line, index === 0));
  }

  if (previews.length === 0 && text) {
    lines.push(detailLine(theme, firstLine(text), true));
  }

  if (!expanded) {
    const hiddenCount = Math.max(0, allPreviews.slice(0, 6).length - previews.length);
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
  const singleFileStats = singleFile?.diff ? countDiff(singleFile.diff) : undefined;
  const singleFileStatsSuffix = singleFileStats
    ? theme.fg("dim", ` (+${singleFileStats.added} -${singleFileStats.removed})`)
    : "";
  const suffix = summary.suffix
    ? `${theme.fg("accent", summary.suffix)}${singleFileStatsSuffix}`
    : undefined;
  const lines = [titleLine(theme, "success", summary.title, suffix)];
  const detailLines = buildApplyPatchDetailLines(theme, details);

  if (expanded) {
    lines.push(...detailLines);
    return renderLines(lines);
  }

  if (detailLines.length > 0) {
    lines.push(expandHintLine(theme, detailLines.length, "line"));
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
