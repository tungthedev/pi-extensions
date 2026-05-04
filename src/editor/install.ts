import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme, TUI } from "@mariozechner/pi-tui";

import { CustomEditor, copyToClipboard } from "@mariozechner/pi-coding-agent";
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
import {
  DEFAULT_EDITOR_SETTINGS,
  readEditorSettings,
  type EditorSettings,
} from "./config.ts";
import {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SETTINGS_CHANGED_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "./events.ts";
import { renderFixedEditorCluster } from "./fixed-editor/cluster.ts";
import { emergencyTerminalModeReset, TerminalSplitCompositor } from "./fixed-editor/terminal-split.ts";
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
  type EditorStatusState,
} from "./status-state.ts";
import {
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
  type RemoveStatusSegmentPayload,
  type SetStatusSegmentPayload,
} from "./types.ts";

const RESERVED_SEGMENT_KEYS = new Set([
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
]);
const HORIZONTAL = "─";
const MIN_INPUT_ROWS = 2;

type AutocompleteKeybindings = Pick<KeybindingsManager, "matches">;
type FixedEditorCompositorHandle = Pick<TerminalSplitCompositor, "jumpToRootBottom" | "requestRepaint" | "dispose">;
type Renderable = { render(width: number): string[] };

export function findContainerWithChild(
  tui: unknown,
  child: unknown,
): { container: { children: unknown[] } & Partial<Renderable>; index: number; childIndex: number } | null {
  const children = (tui as { children?: unknown })?.children;
  if (!Array.isArray(children)) return null;

  for (let index = 0; index < children.length; index += 1) {
    const candidate = children[index];
    const candidateChildren = (candidate as { children?: unknown })?.children;
    if (!Array.isArray(candidateChildren)) continue;
    const childIndex = candidateChildren.indexOf(child);
    if (childIndex !== -1) {
      return { container: candidate as { children: unknown[] }, index, childIndex };
    }
  }

  return null;
}

function isRenderable(value: unknown): value is Renderable {
  return typeof (value as { render?: unknown })?.render === "function";
}

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
    private readonly followSubmittedEditorToBottom?: () => void,
  ) {
    super(tui, editorTheme, keybindings);
    this.autocompleteKeybindings = keybindings;
    let submitted: ((text: string) => void) | undefined;
    Object.defineProperty(this, "onSubmit", {
      configurable: true,
      get: () => submitted,
      set: (handler: ((text: string) => void) | undefined) => {
        submitted = handler
          ? (text: string) => {
              this.followSubmittedEditorToBottom?.();
              handler(text);
            }
          : undefined;
      },
    });
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
    const shouldFollowSubmittedText =
      this.autocompleteKeybindings.matches(normalized, "app.message.followUp" as never) &&
      this.getText().trim().length > 0;
    super.handleInput(normalized);

    if (shouldFollowSubmittedText && this.getText().trim().length === 0) {
      this.followSubmittedEditorToBottom?.();
    }

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
  let editorSettings: EditorSettings = DEFAULT_EDITOR_SETTINGS;
  let currentCtx: ExtensionContext | null = null;
  let currentTui: TUI | null = null;
  let currentEditor: CodexBoxedEditor | null = null;
  let runtimeSettingsOverride: EditorSettings | null = null;
  let fixedEditorCompositor: FixedEditorCompositorHandle | null = null;
  let fixedEditorTerminalTouched = false;
  const state: EditorStatusState = { cwd: process.cwd() };

  const requestFixedEditorRepaint = () => {
    if (fixedEditorCompositor) {
      fixedEditorCompositor.requestRepaint();
      return;
    }
    if (!editorSettings.fixedEditor) return;
    currentTui?.requestRender();
  };

  const teardownFixedEditorCompositor = (options?: { resetExtendedKeyboardModes?: boolean }) => {
    if (fixedEditorCompositor) {
      fixedEditorCompositor.dispose(options);
      fixedEditorTerminalTouched = false;
    } else if (options?.resetExtendedKeyboardModes && fixedEditorTerminalTouched) {
      try {
        process.stdout.write(emergencyTerminalModeReset());
      } catch {
        // Lifecycle cleanup must fail closed; there is no safe UI surface during shutdown.
      }
      fixedEditorTerminalTouched = false;
    }
    fixedEditorCompositor = null;
    currentTui?.requestRender();
  };

  const installFixedEditorCompositor = (
    ctx: ExtensionContext,
    tui: TUI,
    options: { warnIfMissing?: boolean } = {},
  ) => {
    currentTui = tui;
    teardownFixedEditorCompositor();
    if (!editorSettings.fixedEditor) return;
    if (!currentEditor) return;

    const editorContainer = findContainerWithChild(tui, currentEditor);
    if (!editorContainer) {
      if (options.warnIfMissing) {
        ctx.ui.notify?.("Fixed editor unavailable: editor container not found", "warning");
      }
      return;
    }
    const editorRenderable = editorContainer.container;
    if (!isRenderable(editorRenderable)) {
      if (options.warnIfMissing) {
        ctx.ui.notify?.("Fixed editor unavailable: editor container cannot render", "warning");
      }
      return;
    }

    const tuiChildren = Array.isArray((tui as { children?: unknown }).children)
      ? ((tui as { children: unknown[] }).children)
      : [];
    const statusContainer = tuiChildren[editorContainer.index - 2];
    const widgetContainerAbove = tuiChildren[editorContainer.index - 1];
    const widgetContainerBelow = tuiChildren[editorContainer.index + 1];
    const fixedStatus = isRenderable(statusContainer) ? statusContainer : null;
    const fixedAbove = isRenderable(widgetContainerAbove) ? widgetContainerAbove : null;
    const fixedBelow = isRenderable(widgetContainerBelow) ? widgetContainerBelow : null;

    try {
      let compositor: TerminalSplitCompositor;
      compositor = new TerminalSplitCompositor({
        tui,
        terminal: tui.terminal,
        mouseScroll: editorSettings.mouseScroll,
        renderCluster: (width, terminalRows) =>
          renderFixedEditorCluster({
            width,
            terminalRows,
            statusLines: [
              ...(fixedAbove ? compositor.renderHidden(fixedAbove, width) : []),
              ...(fixedStatus ? compositor.renderHidden(fixedStatus, width) : []),
            ],
            editorLines: compositor.renderHidden(editorRenderable, width),
            secondaryLines: fixedBelow ? compositor.renderHidden(fixedBelow, width) : [],
          }),
        getShowHardwareCursor: () => false,
        onCopySelection: (text) => {
          void copyToClipboard(text).catch(() => undefined);
        },
      });

      if (fixedStatus) compositor.hideRenderable(fixedStatus);
      if (fixedAbove) compositor.hideRenderable(fixedAbove);
      compositor.hideRenderable(editorRenderable);
      if (fixedBelow) compositor.hideRenderable(fixedBelow);
      fixedEditorTerminalTouched = true;
      compositor.install();
      fixedEditorCompositor = compositor;
      compositor.requestRepaint();
    } catch (error) {
      fixedEditorCompositor = null;
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify?.(`Fixed editor unavailable: ${message}`, "warning");
    }
  };

  const followSubmittedEditorToBottom = () => {
    fixedEditorCompositor?.jumpToRootBottom();
  };
  void followSubmittedEditorToBottom;

  const applyUi = (ctx: ExtensionContext) => {
    currentCtx = ctx;
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
        const editor = new CodexBoxedEditor(
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
          followSubmittedEditorToBottom,
        );
        currentTui = tui;
        currentEditor = editor;
        queueMicrotask(() => {
          if (currentCtx === ctx && currentTui === tui && currentEditor === editor) {
            installFixedEditorCompositor(ctx, tui, { warnIfMissing: true });
          }
        });
        return editor;
      },
    );

    ctx.ui.setFooter((_tui, _theme, footerData) => {
      state.gitBranch = footerData.getGitBranch() ?? undefined;

      const unsubscribe = footerData.onBranchChange(() => {
        state.gitBranch = footerData.getGitBranch() ?? undefined;
        requestFixedEditorRepaint();
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
  };

  const syncContext = async (ctx: ExtensionContext) => {
    editorSettings = runtimeSettingsOverride ?? (await readEditorSettings({ cwd: ctx.cwd }));
    syncStateFromContext(state, ctx, pi);
    await syncStateFromSettings(state, ctx);
    let repainted = false;
    if (editorSettings.fixedEditor && currentTui) {
      if (fixedEditorCompositor) {
        requestFixedEditorRepaint();
        repainted = true;
      } else {
        installFixedEditorCompositor(ctx, currentTui);
        repainted = true;
      }
    }
    if (!repainted) requestFixedEditorRepaint();
  };

  pi.on("session_start", async (_event, ctx) => {
    runtimeSettingsOverride = null;
    teardownFixedEditorCompositor({ resetExtendedKeyboardModes: true });
    currentCtx = null;
    currentTui = null;
    currentEditor = null;
    applyUi(ctx);
    await syncContext(ctx);
  });

  pi.on("session_shutdown", () => {
    teardownFixedEditorCompositor({ resetExtendedKeyboardModes: true });
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
    requestFixedEditorRepaint();
  });

  pi.events.on(LOAD_SKILLS_CHANGED_EVENT, (data: unknown) => {
    const payload = data as LoadSkillsChangedPayload;
    if (typeof payload?.loadSkills !== "boolean") return;

    state.loadSkillsEnabled = payload.loadSkills;
    requestFixedEditorRepaint();
  });

  pi.events.on(EDITOR_SETTINGS_CHANGED_EVENT, (data: unknown) => {
    const settings = (data as { settings?: Partial<EditorSettings> })?.settings;
    if (!settings) return;

    editorSettings = { ...editorSettings, ...settings };
    runtimeSettingsOverride = editorSettings;
    if (editorSettings.fixedEditor && currentCtx && currentTui) {
      installFixedEditorCompositor(currentCtx, currentTui, { warnIfMissing: true });
    } else if (!editorSettings.fixedEditor) {
      teardownFixedEditorCompositor();
    } else {
      requestFixedEditorRepaint();
    }
  });

  pi.events.on(EDITOR_SET_STATUS_SEGMENT_EVENT, (data: unknown) => {
    const payload = data as SetStatusSegmentPayload;
    if (!payload?.key || typeof payload.text !== "string") return;
    if (RESERVED_SEGMENT_KEYS.has(payload.key)) return;
    requestFixedEditorRepaint();
  });

  pi.events.on(EDITOR_REMOVE_STATUS_SEGMENT_EVENT, (data: unknown) => {
    const payload = data as RemoveStatusSegmentPayload;
    if (!payload?.key || RESERVED_SEGMENT_KEYS.has(payload.key)) return;
    requestFixedEditorRepaint();
  });
}
