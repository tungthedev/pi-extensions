import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme, TUI } from "@mariozechner/pi-tui";

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import { ensureSessionFffRuntime, resolveSessionFffRuntimeKey } from "../fff/session-runtime.ts";
import {
  LOAD_SKILLS_CHANGED_EVENT,
  TOOL_SET_CHANGED_EVENT,
  formatToolSetLabel,
  type LoadSkillsChangedPayload,
  type ToolSetChangedPayload,
} from "../settings/config.ts";
import {
  shouldTriggerAtPathAutocomplete,
  wrapAutocompleteProviderWithAtPathSupport,
} from "../shared/fff/editor/autocomplete-at-path.ts";
import { composeAutocompleteProvider } from "../shared/fff/editor/autocomplete-compose.ts";
import {
  normalizeCodexEditorInput,
  shouldTriggerDollarSkillAutocomplete,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./autocomplete-dollar-skill.ts";
import { EDITOR_REMOVE_STATUS_SEGMENT_EVENT, EDITOR_SET_STATUS_SEGMENT_EVENT } from "./events.ts";
import {
  formatBottomLeftStatus,
  formatBottomRightStatus,
  formatEditorBorderLegend,
  formatSkillCountLabel,
  buildBottomBorderLine,
  buildTopBorderLine,
} from "./status-format.ts";
import {
  syncStateFromContext,
  syncStateFromSettings,
  syncStatusRow,
  type EditorStatusState,
} from "./status-state.ts";
import {
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
  EDITOR_STATUS_WIDGET_KEY,
  type RemoveStatusSegmentPayload,
  type SetStatusSegmentPayload,
} from "./types.ts";
import { HorizontalLineWidget, WidgetRowRegistry, type InlineSegment } from "./widget-row.ts";

const RESERVED_SEGMENT_KEYS = new Set([
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
]);
const HORIZONTAL = "─";
const MIN_INPUT_ROWS = 2;

type AutocompleteKeybindings = Pick<KeybindingsManager, "matches">;

class CodexBoxedEditor extends CustomEditor {
  private readonly autocompleteKeybindings: AutocompleteKeybindings;

  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly getAppTheme: () => Theme,
    private readonly getTopBorderLegend: () => string | undefined,
    private readonly getToolSetLabel: () => string | undefined,
    private readonly getLoadSkillsEnabled: () => boolean | undefined,
    private readonly getSkillCount: () => number | undefined,
    private readonly getBottomLeftStatus: () => string,
    private readonly getBottomRightStatus: (maxWidth: number) => string,
    private readonly useLegacyAutocompleteComposition: boolean,
    private readonly pathAutocompleteRuntime?: ReturnType<typeof ensureSessionFffRuntime>,
  ) {
    super(tui, editorTheme, keybindings);
    this.autocompleteKeybindings = keybindings;
  }

  override setAutocompleteProvider(provider: AutocompleteProvider): void {
    if (!this.useLegacyAutocompleteComposition) {
      super.setAutocompleteProvider(provider);
      return;
    }

    const wrappers = [wrapAutocompleteProviderWithDollarSkillSupport];
    const pathAutocompleteRuntime = this.pathAutocompleteRuntime;
    if (pathAutocompleteRuntime) {
      wrappers.push((baseProvider) =>
        wrapAutocompleteProviderWithAtPathSupport(baseProvider, pathAutocompleteRuntime),
      );
    }

    super.setAutocompleteProvider(composeAutocompleteProvider(provider, wrappers));
  }

  override handleInput(data: string): void {
    const normalized = normalizeCodexEditorInput(data);
    super.handleInput(normalized);

    if (this.isShowingAutocomplete()) return;

    const currentLine = this.getLines()[this.getCursor().line] ?? "";
    const textBeforeCursor = currentLine.slice(0, this.getCursor().col);
    if (
      !shouldTriggerDollarSkillAutocomplete(
        normalized,
        textBeforeCursor,
        this.autocompleteKeybindings,
      ) &&
      !shouldTriggerAtPathAutocomplete(normalized, textBeforeCursor, this.autocompleteKeybindings)
    ) {
      return;
    }

    const editor = this as unknown as { tryTriggerAutocomplete?: (explicitTab?: boolean) => void };
    editor.tryTriggerAutocomplete?.();
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

  private findBottomBorderIndex(lines: string[]): number {
    for (let index = lines.length - 1; index >= 1; index -= 1) {
      const stripped = this.stripAnsiSequences(lines[index] ?? "");
      if (stripped.startsWith(HORIZONTAL)) return index;
    }
    return Math.max(0, lines.length - 1);
  }

  private wrapRow(inner: string, width: number): string {
    const theme = this.getAppTheme();
    const paddedInner = `${inner}${" ".repeat(Math.max(0, width - 2 - visibleWidth(inner)))}`;
    return `${theme.fg("muted", "│")}${paddedInner}${theme.fg("muted", "│")}`;
  }

  private normalizeRenderedWidth(line: string, width: number): string {
    if (visibleWidth(line) <= width) return line;
    return truncateToWidth(line, width, "");
  }

  private styleLegend(legendText: string): string {
    const theme = this.getAppTheme();
    const toolSetLabel = this.getToolSetLabel();
    if (!toolSetLabel) {
      return theme.fg("muted", legendText);
    }

    const segments = [
      { text: " ", color: "muted" as ThemeColor },
      { text: toolSetLabel, color: "accent" as ThemeColor },
    ];

    segments.push(
      { text: " ", color: "muted" as const },
      { text: "(ctrl+space)", color: "muted" as const },
    );

    segments.push({ text: " ", color: "muted" as const });

    let remaining = legendText;
    let styled = "";
    for (const segment of segments) {
      if (!remaining) break;
      const slice = segment.text.slice(0, remaining.length);
      if (!slice) continue;
      const isToolSetLabel = segment.text === toolSetLabel;
      const baseSlice = isToolSetLabel ? theme.bold(slice) : slice;
      const coloredSlice = theme.fg(segment.color, baseSlice);
      const renderedSlice =
        segment.text === "wo. Skills" ? theme.strikethrough(coloredSlice) : coloredSlice;
      styled += renderedSlice;
      remaining = remaining.slice(slice.length);
    }

    if (remaining) {
      styled += theme.fg("muted", remaining);
    }

    return styled;
  }

  private styleRightLegend(labelText: string): string {
    const loadSkillsEnabled = this.getLoadSkillsEnabled();
    return this.getAppTheme().fg(loadSkillsEnabled ? "text" : "dim", labelText);
  }

  override render(width: number): string[] {
    const innerWidth = width - 2;
    if (innerWidth < 4) return super.render(width);

    const lines = super.render(innerWidth);
    if (lines.length < 2) return lines;

    const bottomIndex = this.findBottomBorderIndex(lines);
    const rendered: string[] = [];

    rendered.push(
      this.normalizeRenderedWidth(
        buildTopBorderLine(
          this.getAppTheme(),
          width,
          this.getTopBorderLegend(),
          (legendText) => this.styleLegend(legendText),
          formatSkillCountLabel(this.getSkillCount()),
          (labelText) => this.styleRightLegend(labelText),
        ),
        width,
      ),
    );

    let inputRowCount = 0;
    for (let index = 1; index < bottomIndex; index += 1) {
      rendered.push(this.wrapRow(lines[index] ?? "", width));
      inputRowCount += 1;
    }

    while (inputRowCount < MIN_INPUT_ROWS) {
      rendered.push(this.wrapRow("", width));
      inputRowCount += 1;
    }

    rendered.push(
      buildBottomBorderLine(
        this.getAppTheme(),
        width,
        this.getBottomLeftStatus(),
        this.getBottomRightStatus(Math.max(0, Math.floor((width - 4) / 2))),
        {
          left: "╰",
          right: "╯",
        },
      ),
    );

    for (let index = bottomIndex + 1; index < lines.length; index += 1) {
      rendered.push(` ${lines[index] ?? ""} `);
    }

    return rendered;
  }
}

export function installCodexEditorUi(pi: ExtensionAPI): void {
  let statusRow: WidgetRowRegistry | null = null;
  let getStatusTheme: (() => Theme) | undefined;
  const state: EditorStatusState = { cwd: process.cwd() };
  const externalSegments = new Map<string, InlineSegment>();

  const applyUi = (ctx: ExtensionContext) => {
    getStatusTheme = () => ctx.ui.theme;
    const fffRuntime = ensureSessionFffRuntime(resolveSessionFffRuntimeKey(ctx), ctx.cwd);
    const useProviderStack = typeof ctx.ui.addAutocompleteProvider === "function";
    if (useProviderStack) {
      ctx.ui.addAutocompleteProvider(wrapAutocompleteProviderWithDollarSkillSupport);
      ctx.ui.addAutocompleteProvider((provider: AutocompleteProvider) =>
        wrapAutocompleteProviderWithAtPathSupport(provider, fffRuntime),
      );
    }
    ctx.ui.setEditorComponent(
      (tui: TUI, editorTheme: EditorTheme, keybindings: KeybindingsManager) => {
        return new CodexBoxedEditor(
          tui,
          editorTheme,
          keybindings,
          () => ctx.ui.theme,
          () => formatEditorBorderLegend(state.toolSetLabel, state.loadSkillsEnabled),
          () => state.toolSetLabel,
          () => state.loadSkillsEnabled,
          () => state.skillCount,
          () => formatBottomLeftStatus(state, ctx.ui.theme),
          (maxWidth) => formatBottomRightStatus(state, maxWidth),
          !useProviderStack,
          fffRuntime,
        );
      },
    );

    ctx.ui.setFooter((_tui, _theme, footerData) => {
      state.gitBranch = footerData.getGitBranch() ?? undefined;

      const unsubscribe = footerData.onBranchChange(() => {
        state.gitBranch = footerData.getGitBranch() ?? undefined;
        syncStatusRow(state, statusRow, externalSegments, getStatusTheme);
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
        syncStatusRow(state, statusRow, externalSegments, getStatusTheme);
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
    syncStatusRow(state, statusRow, externalSegments, getStatusTheme);
  };

  pi.on("session_start", async (_event, ctx) => {
    applyUi(ctx);
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
    syncStatusRow(state, statusRow, externalSegments, getStatusTheme);
  });

  pi.events.on(LOAD_SKILLS_CHANGED_EVENT, (data: unknown) => {
    const payload = data as LoadSkillsChangedPayload;
    if (typeof payload?.loadSkills !== "boolean") return;

    state.loadSkillsEnabled = payload.loadSkills;
    syncStatusRow(state, statusRow, externalSegments, getStatusTheme);
  });

  pi.events.on(EDITOR_SET_STATUS_SEGMENT_EVENT, (data: unknown) => {
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

  pi.events.on(EDITOR_REMOVE_STATUS_SEGMENT_EVENT, (data: unknown) => {
    const payload = data as RemoveStatusSegmentPayload;
    if (!payload?.key || RESERVED_SEGMENT_KEYS.has(payload.key)) return;
    externalSegments.delete(payload.key);
    statusRow?.remove(payload.key);
  });
}
