import { renderDiff, type AgentToolResult, type Theme } from "@mariozechner/pi-coding-agent";
import type { Text } from "@mariozechner/pi-tui";

import { detailLine, expandHintLine, renderLines, titleLine } from "./common.ts";
import { countDiff, firstLine, firstText, previewLines, shortenPath } from "../shared/text.ts";

type ApplyPatchAffected = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
};

type ApplyPatchDetails = {
  exitCode?: number;
  affected?: ApplyPatchAffected;
  files?: Array<{
    action?: "added" | "modified" | "deleted" | "moved";
    path?: string;
    sourcePath?: string;
    diff?: string;
  }>;
};

function applyPatchActionTitle(action: "added" | "modified" | "deleted" | "moved" | undefined): string {
  switch (action) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "moved":
      return "Moved";
    default:
      return "Modified";
  }
}

function applyPatchActionCode(action: "added" | "modified" | "deleted" | "moved" | undefined): string {
  switch (action) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "moved":
      return "R";
    default:
      return "M";
  }
}

function describeApplyPatchFile(file: NonNullable<ApplyPatchDetails["files"]>[number]): string {
  const targetPath = shortenPath(file.path);
  if (file.action === "moved") {
    return `${shortenPath(file.sourcePath)} → ${targetPath}`;
  }
  return targetPath;
}

function allAffectedPaths(affected: ApplyPatchAffected | undefined): string[] {
  if (!affected) return [];
  return [...(affected.added ?? []), ...(affected.modified ?? []), ...(affected.deleted ?? [])];
}

function summarizePaths(paths: string[]): string {
  const shortened = paths.map((filePath) => shortenPath(filePath));
  if (shortened.length <= 2) {
    return shortened.join(", ");
  }
  return `${shortened.slice(0, 2).join(", ")}${shortened.length > 2 ? `, +${shortened.length - 2} more` : ""}`;
}

function fileStatsSuffix(diff?: string): string {
  if (!diff) return "";
  const stats = countDiff(diff);
  return ` (+${stats.added} -${stats.removed})`;
}

function buildApplyPatchDetailLines(
  theme: Theme,
  details: ApplyPatchDetails,
  fileDetails: NonNullable<ApplyPatchDetails["files"]>,
  singleFile: NonNullable<ApplyPatchDetails["files"]>[number] | undefined,
): string[] {
  const lines: string[] = [];
  const detailRows = [
    ...(details.affected?.added ?? []).map((filePath) => `A ${shortenPath(filePath)}`),
    ...(details.affected?.modified ?? []).map((filePath) => `M ${shortenPath(filePath)}`),
    ...(details.affected?.deleted ?? []).map((filePath) => `D ${shortenPath(filePath)}`),
  ];

  if (fileDetails.length > 0) {
    for (const [fileIndex, file] of fileDetails.entries()) {
      if (singleFile) {
        if (file.diff) {
          lines.push(...renderDiff(file.diff, { filePath: file.path }).split("\n"));
        }
        continue;
      }

      lines.push(theme.fg("toolOutput", `${applyPatchActionCode(file.action)} ${describeApplyPatchFile(file)}`));

      if (file.diff) {
        lines.push(...renderDiff(file.diff, { filePath: file.path }).split("\n"));
      }

      if (fileIndex < fileDetails.length - 1) {
        lines.push("");
      }
    }
    return lines;
  }

  for (const line of detailRows) {
    lines.push(theme.fg("toolOutput", line));
  }

  return lines;
}

function summarizeFiles(files: NonNullable<ApplyPatchDetails["files"]>): string {
  const summarized = files.map((file) => `${describeApplyPatchFile(file)}${fileStatsSuffix(file.diff)}`);
  if (summarized.length <= 2) {
    return summarized.join(", ");
  }
  return `${summarized.slice(0, 2).join(", ")}${summarized.length > 2 ? `, +${summarized.length - 2} more` : ""}`;
}

export function summarizeApplyPatchResult(details: ApplyPatchDetails | undefined): {
  title: string;
  suffix?: string;
} {
  const files = details?.files ?? [];
  if (files.length === 1) {
    return {
      title: applyPatchActionTitle(files[0].action),
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

export function renderApplyPatchResult(
  theme: Theme,
  result: AgentToolResult<unknown>,
  expanded: boolean,
): Text {
  const text = firstText(result);
  const details = (result.details ?? {}) as ApplyPatchDetails;
  const fileDetails = details.files ?? [];
  const singleFile = fileDetails.length === 1 ? fileDetails[0] : undefined;
  const failed =
    (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true ||
    (typeof details.exitCode === "number" && details.exitCode !== 0);
  const summary = summarizeApplyPatchResult(details);
  const singleFileStats = singleFile?.diff ? countDiff(singleFile.diff) : undefined;
  const singleFileStatsSuffix =
    singleFileStats ? theme.fg("dim", ` (+${singleFileStats.added} -${singleFileStats.removed})`) : "";
  const suffix = summary.suffix ? `${theme.fg("accent", summary.suffix)}${singleFileStatsSuffix}` : undefined;
  const lines = [
    titleLine(theme, failed ? "error" : "success", failed ? "Patch failed" : summary.title, suffix),
  ];

  if (failed) {
    const allPreviews = previewLines(text, Number.MAX_SAFE_INTEGER);
    const previews = allPreviews.slice(0, expanded ? 6 : 3);
    for (const [index, line] of previews.entries()) {
      lines.push(detailLine(theme, line, index === 0));
    }
    if (previews.length === 0 && text) {
      lines.push(detailLine(theme, firstLine(text), true));
    }
    if (!expanded) {
      const expandedPreviews = allPreviews.slice(0, 6);
      const hiddenCount = Math.max(0, expandedPreviews.length - previews.length);
      if (hiddenCount > 0) {
        lines.push(expandHintLine(theme, hiddenCount, "line"));
      }
    }
    return renderLines(lines);
  }

  const detailLines = buildApplyPatchDetailLines(theme, details, fileDetails, singleFile);

  if (expanded) {
    lines.push(...detailLines);
  } else if (detailLines.length > 0) {
    lines.push(expandHintLine(theme, detailLines.length, "line"));
  }

  return renderLines(lines);
}
