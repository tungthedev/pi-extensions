import type { Theme } from "@mariozechner/pi-coding-agent";

import {
  type Component,
  CURSOR_MARKER,
  type Focusable,
  fuzzyFilter,
  Key,
  matchesKey,
  truncateToWidth,
} from "@mariozechner/pi-tui";

import type { ManagerAction, PaletteActionContext, PaletteItem, PaletteView } from "../types.ts";

import { boxLine, makeBottom, makeTop, pad } from "./palette-render.ts";

const MAX_VISIBLE = 12;

export class StackPalette implements Component, Focusable {
  private stack: PaletteView[];
  private searchText = "";
  private filtered: PaletteItem[];
  private highlightedIndex = 0;
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(
    initialView: PaletteView,
    private theme: Theme,
    private done: (result: ManagerAction | null) => void,
    private readonly onError?: (error: unknown) => void,
  ) {
    this.stack = [initialView];
    this.filtered = [...initialView.items];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      if (this.stack.length > 1) {
        this.stack.pop();
        const resumed = this.currentView().onResume?.();
        if (resumed) {
          this.stack[this.stack.length - 1] = resumed;
        }
        this.resetView();
        this.invalidate();
      } else {
        this.done(null);
      }
      return;
    }

    const selectedItem = this.filtered[this.highlightedIndex];
    const actionContext: PaletteActionContext = {
      push: (view) => {
        this.stack.push(view);
        this.resetView();
        this.invalidate();
      },
      replace: (view, options) => {
        this.replaceCurrentView(view, options?.preserveState === true);
      },
      close: () => this.done(null),
      finish: (action) => this.done(action),
      run: (action) => this.runAction(action),
    };

    try {
      if (this.currentView().handleKey?.(data, actionContext, selectedItem)) {
        return;
      }
    } catch (error) {
      this.reportError(error);
      return;
    }

    if (matchesKey(data, Key.enter)) {
      if (!selectedItem) return;
      this.runAction(() => selectedItem.onSelect(actionContext));
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p"))) {
      this.highlightedIndex = Math.max(0, this.highlightedIndex - 1);
      this.ensureVisible();
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n"))) {
      this.highlightedIndex = Math.min(this.filtered.length - 1, this.highlightedIndex + 1);
      this.ensureVisible();
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      if (this.searchText.length > 0) {
        this.searchText = this.searchText.slice(0, -1);
        this.applyFilter();
        this.invalidate();
      }
      return;
    }

    if (data.length >= 1 && !data.startsWith("\x1b") && data.charCodeAt(0) >= 32) {
      this.searchText += data;
      this.applyFilter();
      this.invalidate();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const maxWidth = Math.min(width, 92);
    const innerWidth = Math.max(10, maxWidth - 2);
    const lines: string[] = [];
    const view = this.currentView();

    lines.push(makeTop(innerWidth, view.title, this.theme));

    if (view.searchable !== false) {
      const prompt = this.theme.fg("dim", " > ");
      const cursor = this.focused
        ? `${CURSOR_MARKER}${this.theme.fg("accent", "▏")}`
        : this.theme.fg("dim", "▏");
      const placeholder =
        this.searchText.length === 0 ? this.theme.fg("dim", "type to filter") : "";
      const line = truncateToWidth(
        `${prompt}${this.theme.fg("text", this.searchText)}${cursor}${placeholder}`,
        innerWidth,
      );
      lines.push(boxLine("│", pad(line, innerWidth), "│"));
      lines.push(boxLine("│", " ".repeat(innerWidth), "│"));
    }

    if (this.filtered.length === 0) {
      const line = this.theme.fg("dim", "  no matches");
      lines.push(boxLine("│", pad(line, innerWidth), "│"));
    } else {
      const visibleEnd = Math.min(this.scrollOffset + MAX_VISIBLE, this.filtered.length);
      if (this.scrollOffset > 0) {
        const line = this.theme.fg("dim", `  ↑ ${this.scrollOffset} more`);
        lines.push(boxLine("│", pad(line, innerWidth), "│"));
      }

      for (let i = this.scrollOffset; i < visibleEnd; i += 1) {
        const item = this.filtered[i]!;
        const selected = i === this.highlightedIndex;
        const shortcut = item.shortcut ? ` ${this.theme.fg("dim", item.shortcut)}` : "";
        const detail = item.description ? ` ${this.theme.fg("dim", `— ${item.description}`)}` : "";
        let line = truncateToWidth(`${item.label}${detail}${shortcut}`, innerWidth);
        line = selected
          ? this.theme.bg("selectedBg", pad(line, innerWidth))
          : pad(line, innerWidth);
        lines.push(boxLine("│", line, "│"));
      }

      const remaining = this.filtered.length - visibleEnd;
      if (remaining > 0) {
        const line = this.theme.fg("dim", `  ↓ ${remaining} more`);
        lines.push(boxLine("│", pad(line, innerWidth), "│"));
      }
    }

    const footer =
      view.footerHint ??
      (this.stack.length > 1 ? "enter select • esc back" : "enter select • esc close");
    lines.push(makeBottom(innerWidth, footer, this.theme));

    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private reportError(error: unknown): void {
    this.onError?.(error);
  }

  private runAction(action: () => void | Promise<void>): void {
    try {
      const result = action();
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch((error) => {
          this.reportError(error);
        });
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  private currentView(): PaletteView {
    return this.stack[this.stack.length - 1]!;
  }

  private replaceCurrentView(view: PaletteView, preserveState: boolean): void {
    const previousSelectedId = this.filtered[this.highlightedIndex]?.id;
    const previousSearch = this.searchText;

    this.stack[this.stack.length - 1] = view;

    if (!preserveState) {
      this.resetView();
      this.invalidate();
      return;
    }

    this.searchText = previousSearch;
    this.applyFilter();

    if (previousSelectedId) {
      const nextIndex = this.filtered.findIndex((item) => item.id === previousSelectedId);
      if (nextIndex >= 0) {
        this.highlightedIndex = nextIndex;
        this.ensureVisible();
      }
    }

    this.invalidate();
  }

  private resetView(): void {
    this.searchText = "";
    this.highlightedIndex = 0;
    this.scrollOffset = 0;
    this.filtered = [...this.currentView().items];
  }

  private applyFilter(): void {
    const view = this.currentView();
    if (this.searchText === "" || view.searchable === false) {
      this.filtered = [...view.items];
    } else {
      this.filtered = fuzzyFilter(view.items, this.searchText, (item) => {
        return `${item.label} ${item.description ?? ""} ${item.category ?? ""}`;
      });
    }

    this.highlightedIndex = 0;
    this.scrollOffset = 0;
  }

  private ensureVisible(): void {
    if (this.highlightedIndex < this.scrollOffset) {
      this.scrollOffset = this.highlightedIndex;
    } else if (this.highlightedIndex >= this.scrollOffset + MAX_VISIBLE) {
      this.scrollOffset = this.highlightedIndex - MAX_VISIBLE + 1;
    }
  }
}
