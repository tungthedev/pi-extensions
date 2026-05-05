import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  Theme,
} from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme, TUI } from "@mariozechner/pi-tui";

import { CustomEditor, copyToClipboard } from "@mariozechner/pi-coding-agent";
import { isKeyRelease, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execFileSync } from "node:child_process";

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
import { DEFAULT_EDITOR_SETTINGS, readEditorSettings, type EditorSettings } from "./config.ts";
import {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SETTINGS_CHANGED_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "./events.ts";
import { renderFixedEditorCluster } from "./fixed-editor/cluster.ts";
import {
  emergencyTerminalModeReset,
  TerminalSplitCompositor,
} from "./fixed-editor/terminal-split.ts";
import {
  formatBottomLeftStatus,
  formatBottomRightStatus,
  formatCompactMetadataStatus,
  formatEditorBorderLegend,
  formatSkillCountLabel,
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
  EDITOR_STATUS_WIDGET_KEY,
  type RemoveStatusSegmentPayload,
  type SetStatusSegmentPayload,
} from "./types.ts";

const RESERVED_SEGMENT_KEYS = new Set([
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
]);
const HORIZONTAL = "─";
const MIN_INPUT_ROWS = 2;
const COMPACT_WIDTH = 60;
const MIN_SKILL_COUNT_WIDTH = 41;

type AutocompleteKeybindings = Pick<KeybindingsManager, "matches">;
type FixedEditorCompositorHandle = Pick<
  TerminalSplitCompositor,
  "jumpToRootBottom" | "requestRepaint" | "dispose"
>;
type Renderable = { render(width: number): string[] };

function readGitChanges(cwd: string): EditorStatusState["gitChanges"] | undefined {
  try {
    const output = execFileSync("git", ["diff", "--numstat", "HEAD", "--"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let added = 0;
    let removed = 0;
    for (const line of output.split("\n")) {
      const [addedText, removedText] = line.split("\t");
      const addedCount = Number(addedText);
      const removedCount = Number(removedText);
      if (Number.isFinite(addedCount)) added += addedCount;
      if (Number.isFinite(removedCount)) removed += removedCount;
    }
    return added > 0 || removed > 0 ? { added, removed } : undefined;
  } catch {
    return undefined;
  }
}

export function findContainerWithChild(
  tui: unknown,
  child: unknown,
): {
  container: { children: unknown[] } & Partial<Renderable>;
  index: number;
  childIndex: number;
} | null {
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

function hasNonWhitespaceText(text: string): boolean {
  return text.trim().length > 0;
}

function isAltSCsiUInput(data: string): boolean {
  const prefix = "\u001b[";
  if (!data.startsWith(prefix) || !data.endsWith("u")) return false;

  const body = data.slice(prefix.length, -1);
  const sections = body.split(";");
  const keyCode = sections[0]?.split(":")[0];
  const modifier = sections.at(-1);

  return (keyCode === "83" || keyCode === "115")
    && (modifier === "3" || modifier?.startsWith("3:") === true);
}

function isStashShortcutInput(data: string): boolean {
  if (isKeyRelease(data)) return false;

  return data === "ß"
    || data === "\x1bs"
    || data === "\x1bS"
    || isAltSCsiUInput(data)
    || data === "\x1b[27;3;115~"
    || data === "\x1b[27;3;83~"
    || matchesKey(data, "alt+s");
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
    private readonly useLegacyAutocompleteComposition: boolean,
    private readonly pathAutocompleteRuntime?: ReturnType<typeof ensureSessionFffRuntime>,
    private readonly followSubmittedEditorToBottom?: () => void,
    private readonly onStashShortcut?: () => void,
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
    if (isStashShortcutInput(data)) {
      this.onStashShortcut?.();
      return;
    }

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

  private normalizeRenderedWidth(line: string, width: number): string {
    if (visibleWidth(line) <= width) return line;
    return truncateToWidth(line, width, "");
  }

  private padRenderedWidth(line: string, width: number): string {
    const normalized = this.normalizeRenderedWidth(line, width);
    return `${normalized}${" ".repeat(Math.max(0, width - visibleWidth(normalized)))}`;
  }

  private padWriteZoneRow(line: string, width: number): string {
    const contentWidth = Math.max(0, width - 2);
    return ` ${this.padRenderedWidth(line, contentWidth)} `;
  }

  private styleLegend(legendText: string): string {
    const theme = this.getAppTheme();
    const toolSetLabel = this.getToolSetLabel();
    if (!toolSetLabel || !legendText.startsWith(toolSetLabel)) {
      return theme.fg("muted", legendText);
    }

    const label = legendText.slice(0, toolSetLabel.length);
    const suffix = legendText.slice(toolSetLabel.length);
    return theme.fg("accent", theme.bold(label)) + theme.fg("muted", suffix);
  }

  private styleRightLegend(labelText: string): string {
    const loadSkillsEnabled = this.getLoadSkillsEnabled();
    return this.getAppTheme().fg(loadSkillsEnabled ? "text" : "dim", labelText);
  }

  override render(width: number): string[] {
    const innerWidth = width - 2;
    if (innerWidth < 4) return super.render(width);
    const compact = width < COMPACT_WIDTH;

    const lines = super.render(width);
    if (lines.length < 2) return lines;
    const showSkillCount = width >= MIN_SKILL_COUNT_WIDTH;

    const bottomIndex = this.findBottomBorderIndex(lines);
    const rendered: string[] = [];

    rendered.push(
      this.normalizeRenderedWidth(
        buildTopBorderLine(
          this.getAppTheme(),
          width,
          compact ? this.getToolSetLabel() : this.getTopBorderLegend(),
          (legendText) => this.styleLegend(legendText),
          showSkillCount ? formatSkillCountLabel(this.getSkillCount()) : undefined,
          (labelText) => this.styleRightLegend(labelText),
        ),
        width,
      ),
    );

    let inputRowCount = 0;
    for (let index = 1; index < bottomIndex; index += 1) {
      rendered.push(this.padWriteZoneRow(lines[index] ?? "", width));
      inputRowCount += 1;
    }

    while (inputRowCount < MIN_INPUT_ROWS) {
      rendered.push(this.padWriteZoneRow("", width));
      inputRowCount += 1;
    }

    rendered.push(this.getAppTheme().fg("muted", HORIZONTAL.repeat(width)));

    for (let index = bottomIndex + 1; index < lines.length; index += 1) {
      rendered.push(` ${lines[index] ?? ""} `);
    }

    return rendered;
  }
}

class EditorBottomStatusWidget {
  constructor(
    private readonly getLeftStatus: (maxWidth: number) => string,
    private readonly getRightStatus: (maxWidth: number) => string,
    private readonly getCompactMetadataStatus: (maxWidth: number) => string,
  ) {}

  invalidate(): void {}

  private normalizeRenderedWidth(line: string, width: number): string {
    if (visibleWidth(line) <= width) return line;
    return truncateToWidth(line, width, "");
  }

  private padRenderedWidth(line: string, width: number): string {
    const normalized = this.normalizeRenderedWidth(line, width);
    return `${normalized}${" ".repeat(Math.max(0, width - visibleWidth(normalized)))}`;
  }

  private renderStatusLine(width: number, leftText: string, rightText: string): string {
    if (!leftText && !rightText) return "";
    const contentWidth = Math.max(0, width - 2);
    if (!rightText) return ` ${this.padRenderedWidth(leftText, contentWidth)} `;

    const leftBudget = Math.max(0, Math.floor((contentWidth - 1) / 2));
    const renderedLeft = truncateToWidth(leftText, leftBudget);
    const rightBudget = Math.max(0, contentWidth - visibleWidth(renderedLeft) - 1);
    const renderedRight = truncateToWidth(rightText, rightBudget, "");
    const gap = " ".repeat(
      Math.max(1, contentWidth - visibleWidth(renderedLeft) - visibleWidth(renderedRight)),
    );

    return this.normalizeRenderedWidth(` ${renderedLeft}${gap}${renderedRight} `, width);
  }

  render(width: number): string[] {
    const compact = width < COMPACT_WIDTH;
    const lines: string[] = [];
    if (compact) {
      const metadata = this.getCompactMetadataStatus(Math.max(0, width - 2));
      if (metadata) lines.push(this.normalizeRenderedWidth(` ${metadata} `, width));
      return lines;
    }

    const rightStatus = this.getRightStatus(Math.max(0, Math.floor((width - 2) / 2)));
    const leftBudget = rightStatus ? Math.max(0, Math.floor((width - 2) / 2)) : Math.max(0, width - 2);
    const line = this.renderStatusLine(width, this.getLeftStatus(leftBudget), rightStatus);
    if (line) lines.push(line);
    return lines;
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
  let stashedEditorText: string | null = null;
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
      ? (tui as { children: unknown[] }).children
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

  const getCurrentEditorText = (ctx: ExtensionContext): string => {
    return currentEditor?.getExpandedText?.() ?? ctx.ui.getEditorText();
  };

  const setCurrentEditorText = (ctx: ExtensionContext, text: string): void => {
    if (currentEditor) {
      currentEditor.setText(text);
      return;
    }

    ctx.ui.setEditorText(text);
  };

  const stashOrRestoreEditorText = (ctx: ExtensionContext): void => {
    const rawText = getCurrentEditorText(ctx);

    if (!hasNonWhitespaceText(rawText)) {
      const restoredText = stashedEditorText;
      if (restoredText === null) {
        ctx.ui.notify?.("Nothing to stash", "info");
        return;
      }

      setCurrentEditorText(ctx, restoredText);
      stashedEditorText = null;
      ctx.ui.notify?.("Stash restored", "info");
      requestFixedEditorRepaint();
      return;
    }

    const hasStash = stashedEditorText !== null;
    stashedEditorText = rawText;
    setCurrentEditorText(ctx, "");
    ctx.ui.notify?.(hasStash ? "Stash updated" : "Text stashed", "info");
    requestFixedEditorRepaint();
  };

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
          () => formatEditorBorderLegend(state.toolSetLabel, state.modeShortcut),
          () => state.toolSetLabel,
          () => state.loadSkillsEnabled,
          () => state.skillCount,
          !useProviderStack,
          fffRuntime,
          followSubmittedEditorToBottom,
          () => stashOrRestoreEditorText(ctx),
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

    ctx.ui.setWidget(
      EDITOR_STATUS_WIDGET_KEY,
      () =>
        new EditorBottomStatusWidget(
          (maxWidth) => formatBottomLeftStatus(state, ctx.ui.theme, maxWidth),
          (maxWidth) => formatBottomRightStatus(state, maxWidth, ctx.ui.theme),
          (maxWidth) => formatCompactMetadataStatus(state, maxWidth, ctx.ui.theme),
        ),
      { placement: "belowEditor" },
    );

    ctx.ui.setFooter((_tui, _theme, footerData) => {
      state.gitBranch = footerData.getGitBranch() ?? undefined;

      const unsubscribe = footerData.onBranchChange(() => {
        state.gitBranch = footerData.getGitBranch() ?? undefined;
        state.gitChanges = readGitChanges(state.cwd);
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
    state.gitChanges = readGitChanges(ctx.cwd);
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
    stashedEditorText = null;
    teardownFixedEditorCompositor({ resetExtendedKeyboardModes: true });
    currentCtx = null;
    currentTui = null;
    currentEditor = null;
    applyUi(ctx);
    await syncContext(ctx);
  });

  pi.on("session_shutdown", () => {
    stashedEditorText = null;
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
    if (stashedEditorText === null) return;

    if (getCurrentEditorText(ctx).trim() === "") {
      setCurrentEditorText(ctx, stashedEditorText);
      stashedEditorText = null;
      ctx.ui.notify?.("Stash restored", "info");
      requestFixedEditorRepaint();
      return;
    }

    ctx.ui.notify?.("Stash preserved - clear editor then Alt+S to restore", "info");
  });

  const registerShortcut = (pi as { registerShortcut?: ExtensionAPI["registerShortcut"] })
    .registerShortcut;
  registerShortcut?.call(pi, "alt+s", {
    description: "Stash/restore editor text",
    handler: (ctx) => {
      stashOrRestoreEditorText(ctx);
    },
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
