/**
 * Replaces the editor UI with a Codex-style boxed editor and status widgets.
 */
import type {
  ContextUsage,
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  Theme,
} from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import { TOOL_SET_CHANGED_EVENT, formatToolSetLabel, type ToolSetChangedPayload } from "../settings/config.ts";
import { resolveSessionToolSet } from "../settings/session.ts";

import {
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
  EDITOR_STATUS_WIDGET_KEY,
  type RemoveStatusSegmentPayload,
  type SetStatusSegmentPayload,
} from "./types.ts";
import { HorizontalLineWidget, WidgetRowRegistry, type InlineSegment } from "./widget-row.ts";

type EditorStatusState = {
  cwd: string;
  gitBranch?: string;
  modelId?: string;
  thinkingLevel?: string;
  toolSetLabel?: string;
  usage?: ContextUsage;
};

const RESERVED_SEGMENT_KEYS = new Set([
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
]);
const HORIZONTAL = "─";
const SHIFT_ENTER_SEQUENCES = new Set(["\u001b[13;2u", "\u001b[13;2~", "\u001b[27;2;13~"]);

export function formatEditorBorderLegend(toolSetLabel?: string): string | undefined {
  return toolSetLabel ? `Tool set: ${toolSetLabel}` : undefined;
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

export function normalizeCodexEditorInput(data: string): string {
  if (data === "\n") return "\u001b[13;2u";
  return SHIFT_ENTER_SEQUENCES.has(data) ? "\u001b[13;2u" : data;
}

export function formatUsageSummary(usage?: ContextUsage): string | undefined {
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

function baseSegments(state: EditorStatusState): Array<{ key: string; segment: InlineSegment }> {
  return [
    {
      key: EDITOR_BASE_LEFT_SEGMENT_KEY,
      segment: {
        align: "left",
        priority: 0,
        renderInline: () => formatLeftStatus(state),
      },
    },
    {
      key: EDITOR_BASE_RIGHT_SEGMENT_KEY,
      segment: {
        align: "right",
        priority: 0,
        renderInline: (maxWidth) => formatRightStatus(state, maxWidth),
      },
    },
  ];
}

class CodexBoxedEditor extends CustomEditor {
  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly getAppTheme: () => Theme,
    private readonly getTopBorderLegend: () => string | undefined,
    private readonly getToolSetLabel: () => string | undefined,
  ) {
    super(tui, editorTheme, keybindings);
  }

  override handleInput(data: string): void {
    super.handleInput(normalizeCodexEditorInput(data));
  }

  private stripAnsiSequences(value: string): string {
    let result = "";

    for (let index = 0; index < value.length; index += 1) {
      const current = value[index];
      if (current !== "\u001b") {
        result += current;
        continue;
      }

      const next = value[index + 1];
      if (next === "[") {
        index += 2;
        while (index < value.length) {
          const code = value.charCodeAt(index);
          if (code >= 0x40 && code <= 0x7e) break;
          index += 1;
        }
        continue;
      }

      if (next === "_" || next === "]") {
        index += 2;
        while (index < value.length) {
          if (value[index] === "\u0007") break;
          if (value[index] === "\u001b" && value[index + 1] === "\\") {
            index += 1;
            break;
          }
          index += 1;
        }
      }
    }

    return result;
  }

  private extractScrollIndicator(originalLine: string): string {
    const stripped = this.stripAnsiSequences(originalLine);
    const match = stripped.match(/[↑↓]\s+\d+\s+more/);
    return match?.[0] ?? "";
  }

  private findBottomBorderIndex(lines: string[]): number {
    for (let index = lines.length - 1; index >= 1; index -= 1) {
      const stripped = this.stripAnsiSequences(lines[index] ?? "");
      if (stripped.startsWith(HORIZONTAL)) return index;
    }
    return Math.max(0, lines.length - 1);
  }

  private buildBorderLine(
    width: number,
    corners: { left: string; right: string },
    originalLine: string,
  ): string {
    const theme = this.getAppTheme();
    const innerWidth = Math.max(0, width - 2);
    const indicator = this.extractScrollIndicator(originalLine);
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

  private wrapRow(inner: string): string {
    const theme = this.getAppTheme();
    return `${colorBorder(theme, "│")}${inner}${colorBorder(theme, "│")}`;
  }

  private styleLegend(legendText: string): string {
    const theme = this.getAppTheme();
    const toolSetLabel = this.getToolSetLabel();
    if (!toolSetLabel) {
      return colorBorder(theme, legendText);
    }

    const segments = [
      { text: " ", color: "muted" as const },
      { text: "Tool set:", color: "muted" as const },
      { text: " ", color: "muted" as const },
      { text: toolSetLabel, color: "accent" as const },
      { text: " ", color: "muted" as const },
    ];

    let remaining = legendText;
    let styled = "";
    for (const segment of segments) {
      if (!remaining) break;
      const slice = segment.text.slice(0, remaining.length);
      if (!slice) continue;
      styled += theme.fg(segment.color, slice);
      remaining = remaining.slice(slice.length);
    }

    if (remaining) {
      styled += colorBorder(theme, remaining);
    }

    return styled;
  }

  private buildTopBorderLine(width: number): string {
    const theme = this.getAppTheme();
    const innerWidth = Math.max(0, width - 2);
    const legend = this.getTopBorderLegend();
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
      this.styleLegend(legendText) +
      colorBorder(theme, `${HORIZONTAL.repeat(rightFill)}╮`)
    );
  }

  override render(width: number): string[] {
    const innerWidth = width - 2;
    if (innerWidth < 4) return super.render(width);

    const lines = super.render(innerWidth);
    if (lines.length < 2) return lines;

    const bottomIndex = this.findBottomBorderIndex(lines);
    const rendered: string[] = [];

    rendered.push(this.buildTopBorderLine(width));

    for (let index = 1; index < bottomIndex; index += 1) {
      rendered.push(this.wrapRow(lines[index] ?? ""));
    }

    rendered.push(this.buildBorderLine(width, { left: "╰", right: "╯" }, lines[bottomIndex] ?? ""));

    for (let index = bottomIndex + 1; index < lines.length; index += 1) {
      rendered.push(` ${lines[index] ?? ""} `);
    }

    return rendered;
  }
}

function syncStatusRow(
  state: EditorStatusState,
  statusRow: WidgetRowRegistry | null,
  externalSegments: Map<string, InlineSegment>,
): void {
  if (!statusRow) return;

  for (const { key, segment } of baseSegments(state)) {
    statusRow.set(key, segment);
  }

  for (const [key, segment] of externalSegments) {
    statusRow.set(key, segment);
  }
}

function syncStateFromContext(
  state: EditorStatusState,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): void {
  state.cwd = ctx.cwd;
  state.modelId = ctx.model?.id;
  state.thinkingLevel = pi.getThinkingLevel();
  state.usage = ctx.getContextUsage();
}

async function syncStateFromSettings(
  state: EditorStatusState,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  state.toolSetLabel = formatToolSetLabel(await resolveSessionToolSet(ctx.sessionManager));
}

export function installCodexEditorUi(pi: ExtensionAPI): void {
  let statusRow: WidgetRowRegistry | null = null;
  const state: EditorStatusState = { cwd: process.cwd() };
  const externalSegments = new Map<string, InlineSegment>();

  const applyUi = (ctx: ExtensionContext) => {
    ctx.ui.setEditorComponent(
      (tui: TUI, editorTheme: EditorTheme, keybindings: KeybindingsManager) => {
        return new CodexBoxedEditor(
          tui,
          editorTheme,
          keybindings,
          () => ctx.ui.theme,
          () => formatEditorBorderLegend(state.toolSetLabel),
          () => state.toolSetLabel,
        );
      },
    );

    ctx.ui.setFooter((_tui, _theme, footerData) => {
      state.gitBranch = footerData.getGitBranch() ?? undefined;

      const unsubscribe = footerData.onBranchChange(() => {
        state.gitBranch = footerData.getGitBranch() ?? undefined;
        syncStatusRow(state, statusRow, externalSegments);
      });

      return {
        dispose: () => {
          unsubscribe();
        },
        invalidate() {},
        render(): string[] {
          return [];
        },
      };
    });

    ctx.ui.setWidget(
      EDITOR_STATUS_WIDGET_KEY,
      (tui) => {
        statusRow = new WidgetRowRegistry(tui);
        syncStatusRow(state, statusRow, externalSegments);
        return new HorizontalLineWidget(
          () => statusRow?.snapshot() ?? [],
          () => statusRow?.version ?? 0,
        );
      },
      { placement: "belowEditor" },
    );
  };

  const syncContext = async (ctx: ExtensionContext) => {
    syncStateFromContext(state, ctx, pi);
    await syncStateFromSettings(state, ctx);
    syncStatusRow(state, statusRow, externalSegments);
  };

  pi.on("session_start", async (_event, ctx) => {
    applyUi(ctx);
    await syncContext(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await syncContext(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    await syncContext(ctx);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    await syncContext(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    await syncContext(ctx);
  });

  pi.events.on(TOOL_SET_CHANGED_EVENT, (data: unknown) => {
    const payload = data as ToolSetChangedPayload;
    if (!payload?.toolSet) return;

    state.toolSetLabel = formatToolSetLabel(payload.toolSet);
    syncStatusRow(state, statusRow, externalSegments);
  });

  pi.events.on("editor:set-status-segment", (data: unknown) => {
    const payload = data as SetStatusSegmentPayload;
    if (!payload?.key || typeof payload.text !== "string") return;
    if (RESERVED_SEGMENT_KEYS.has(payload.key)) return;

    const segment: InlineSegment = {
      align: payload.align === "center" || payload.align === "right" ? payload.align : "left",
      priority:
        typeof payload.priority === "number" && Number.isFinite(payload.priority)
          ? payload.priority
          : 0,
      renderInline: () => payload.text,
    };

    externalSegments.set(payload.key, segment);
    statusRow?.set(payload.key, segment);
  });

  pi.events.on("editor:remove-status-segment", (data: unknown) => {
    const payload = data as RemoveStatusSegmentPayload;
    if (!payload?.key || RESERVED_SEGMENT_KEYS.has(payload.key)) return;
    externalSegments.delete(payload.key);
    statusRow?.remove(payload.key);
  });
}

export default function editor(pi: ExtensionAPI): void {
  installCodexEditorUi(pi);
}
