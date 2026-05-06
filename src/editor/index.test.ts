import type { AutocompleteProvider } from "@mariozechner/pi-tui";

import { visibleWidth } from "@mariozechner/pi-tui";
import { Result } from "better-result";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { wrapAutocompleteProviderWithAtPathSupport } from "../shared/fff/editor/autocomplete-at-path.ts";
import { composeAutocompleteProvider } from "../shared/fff/editor/autocomplete-compose.ts";
import { EDITOR_SETTINGS_CHANGED_EVENT } from "./events.ts";
import { TerminalSplitCompositor } from "./fixed-editor/terminal-split.ts";
import {
  createSubagentRoleAutocompleteProvider,
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
  installCodexEditorUi,
  normalizeCodexEditorInput,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./index.ts";
import { findContainerWithChild } from "./install.ts";
import {
  buildTopBorderLineFromItems,
  formatBottomLeftStatus,
  formatCompactBottomLeftStatus,
} from "./status-format.ts";

const BOOMERANG_ICON = String.fromCodePoint(0x1fa83);

test("buildTopBorderLineFromItems styles right item separator as border text", () => {
  const theme = {
    fg: (color: string, text: string) => {
      const code = color === "muted" ? 90 : color === "text" ? 37 : color === "accent" ? 36 : 39;
      return `\u001b[${code}m${text}\u001b[0m`;
    },
    bold: (text: string) => text,
  };

  const line = buildTopBorderLineFromItems(theme as never, {
    width: 48,
    leftItems: ["Codex", "(ctrl+alt+m)"],
    rightItems: [BOOMERANG_ICON, "2 skills"],
    styleLeftItem: (item, index) => theme.fg(index === 0 ? "accent" : "muted", item),
    styleRightItem: (item) => theme.fg("text", item),
  });

  assert.ok(line.includes(`\u001b[37m${BOOMERANG_ICON}\u001b[0m\u001b[90m╶╴\u001b[0m\u001b[37m2 skills\u001b[0m`));
  assert.equal(visibleWidth(line), 48);
});

test("formatBottomLeftStatus separates model and usage with half-dashes", () => {
  const status = formatBottomLeftStatus(
    {
      cwd: "/tmp/project",
      modelId: "gpt-5.5",
      thinkingLevel: "medium",
      usage: { tokens: 122400, percent: 45, contextWindow: 272000 },
    },
    {
      bg: (_color: string, text: string) => text,
      fg: (color: string, text: string) =>
        color === "muted" ? `<muted>${text}</muted>` : color === "accent" ? `<accent>${text}</accent>` : text,
      getBgAnsi: () => "\u001b[48;5;8m",
      getFgAnsi: () => "\u001b[38;5;15m",
      getColorMode: () => "256color",
    } as never,
  );

  assert.ok(status.startsWith("gpt-5.5 <accent>medium</accent><muted>╶╴</muted>"));
  assert.ok(status.includes("\u001b[48;"));
});

test("formatCompactBottomLeftStatus renders thinking, model, and compact usage", () => {
  const status = formatCompactBottomLeftStatus(
    {
      cwd: "/tmp/project",
      modelId: "gpt-5.5",
      thinkingLevel: "medium",
      usage: { tokens: 122400, percent: 45, contextWindow: 272000 },
    },
    {
      fg: (color: string, text: string) => (color === "muted" ? `<muted>${text}</muted>` : text),
      bold: (text: string) => text,
    } as never,
  );

  assert.ok(status.startsWith("◑ gpt-5.5<muted>╶╴</muted>▌ 272k"), status);
});

test("formatBottomLeftStatus preserves usage when width is tight", () => {
  const status = formatBottomLeftStatus(
    {
      cwd: "/tmp/project",
      modelId: "very-long-model-name-for-mobile",
      thinkingLevel: "medium",
      usage: { tokens: 122400, percent: 45, contextWindow: 272000 },
    },
    undefined,
    24,
  );

  assert.ok(status.includes("272k"), status);
  assert.ok(status.includes("╶╴"), status);
  assert.ok(visibleWidth(status) <= 24, status);
});

async function renderEditorTopLine(loadSkills: boolean): Promise<string> {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => { render(width: number): string[] })
    | undefined;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [
        { source: "skill", name: "skill:one" },
        { source: "skill", name: "skill:two" },
      ];
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (color: string, text: string) =>
          color === "text"
            ? `\u001b[31m${text}\u001b[39m`
            : color === "dim"
              ? `\u001b[2m${text}\u001b[22m`
              : text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "main",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(
    { requestRender() {}, terminal: { rows: 40 } },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  return editor.render(80)[0] ?? "";
}

test("installCodexEditorUi colors skill count by inject-skills state", async () => {
  const enabledTopLine = await renderEditorTopLine(true);
  assert.ok(enabledTopLine.includes("╴Codex (ctrl+alt+m)╶"), enabledTopLine);
  assert.equal(enabledTopLine.includes("╴ Codex"), false);
  assert.equal(enabledTopLine.includes("f2"), false);
  assert.ok(enabledTopLine.includes("\u001b[31m2 skills\u001b[39m"));
  assert.ok((await renderEditorTopLine(false)).includes("\u001b[2m2 skills\u001b[22m"));
});

test("normalizeCodexEditorInput maps extra Shift+Enter sequences to canonical shift-enter", () => {
  assert.equal(normalizeCodexEditorInput("\n"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[13;2u"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[27;2;13~"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\r"), "\r");
});

test("wrapped autocomplete provider maps $ skill tokens to /skill queries", async () => {
  let capturedPrefix: string | undefined;

  const baseProvider: AutocompleteProvider = {
    async getSuggestions(lines, cursorLine, cursorCol) {
      capturedPrefix = (lines[cursorLine] ?? "").slice(0, cursorCol);
      return {
        prefix: "/skill:sys",
        items: [{ value: "skill:systematic-debugging", label: "skill:systematic-debugging" }],
      };
    },
    applyCompletion() {
      throw new Error("not used");
    },
  };

  const provider = wrapAutocompleteProviderWithDollarSkillSupport(baseProvider);
  const suggestions = await provider.getSuggestions(["use $sys"], 0, "use $sys".length, {
    signal: new AbortController().signal,
  });

  assert.equal(capturedPrefix, "/skill:sys");
  assert.deepEqual(suggestions, {
    prefix: "$sys",
    items: [{ value: "skill:systematic-debugging", label: "skill:systematic-debugging" }],
  });
});

test("wrapped autocomplete provider inserts /skill command for $ selections", () => {
  const baseProvider: AutocompleteProvider = {
    async getSuggestions() {
      return null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return {
        lines,
        cursorLine,
        cursorCol: cursorCol - prefix.length + item.value.length,
      };
    },
  };

  const provider = wrapAutocompleteProviderWithDollarSkillSupport(baseProvider);
  const result = provider.applyCompletion(
    ["use $sys"],
    0,
    "use $sys".length,
    { value: "skill:systematic-debugging", label: "skill:systematic-debugging" },
    "$sys",
  );

  assert.deepEqual(result, {
    lines: ["use /skill:systematic-debugging "],
    cursorLine: 0,
    cursorCol: "use /skill:systematic-debugging ".length,
  });
});

test("composed autocomplete keeps both $skill and @path support active", async () => {
  const baseProvider: AutocompleteProvider = {
    async getSuggestions(lines, cursorLine, cursorCol) {
      const prefix = (lines[cursorLine] ?? "").slice(0, cursorCol);
      return {
        prefix,
        items: [{ value: prefix, label: prefix }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return {
        lines: [
          `${(lines[cursorLine] ?? "").slice(0, cursorCol - prefix.length)}${item.value}${(lines[cursorLine] ?? "").slice(cursorCol)}`,
        ],
        cursorLine,
        cursorCol: cursorCol - prefix.length + item.value.length,
      };
    },
  };

  const provider = composeAutocompleteProvider(baseProvider, [
    wrapAutocompleteProviderWithDollarSkillSupport,
    (candidate) =>
      wrapAutocompleteProviderWithAtPathSupport(candidate, {
        async searchFileCandidates(query) {
          return Result.ok([
            {
              item: {
                path: `/repo/${query}.ts`,
                relativePath: `${query}.ts`,
                fileName: `${query}.ts`,
                size: 1,
                modified: 0,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                totalFrecencyScore: 0,
                gitStatus: "clean",
              },
            },
          ]);
        },
        async trackQuery() {
          return Result.ok();
        },
      }),
  ]);

  const skillSuggestions = await provider.getSuggestions(["use $sys"], 0, "use $sys".length, {
    signal: new AbortController().signal,
  });
  assert.equal(skillSuggestions?.prefix, "$sys");

  const pathSuggestions = await provider.getSuggestions(
    ["open @readme"],
    0,
    "open @readme".length,
    { signal: new AbortController().signal },
  );
  assert.equal(pathSuggestions?.prefix, "@readme");
  assert.equal(pathSuggestions?.items[0]?.value, "@readme.ts");
});

test("installCodexEditorUi registers a below-editor status widget", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  const eventHandlers = new Map<string, Function>();
  let belowEditorWidgetRegistered = false;

  installCodexEditorUi({
    getThinkingLevel() {
      return "medium";
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on(event: string, handler: Function) {
        eventHandlers.set(event, handler);
      },
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return { percent: 45, contextWindow: 272000 };
    },
    sessionManager: {
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills: false } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
        bold: (text: string) => text,
      },
      setEditorComponent() {},
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "main",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget(_key: string, _factory: Function, options: { placement: string }) {
        if (options.placement === "belowEditor") {
          belowEditorWidgetRegistered = true;
        }
      },
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  eventHandlers.get(EDITOR_SET_STATUS_SEGMENT_EVENT)?.({
    key: "sync",
    text: "syncing",
    align: "right",
  });
  eventHandlers.get(EDITOR_REMOVE_STATUS_SEGMENT_EVENT)?.({ key: "sync" });

  assert.equal(belowEditorWidgetRegistered, true);
});

test("installCodexEditorUi keeps default fixed-editor runtime inactive", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number; write(data: string): void } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => unknown)
    | undefined;
  let widgetRegistered = false;
  let footerRegistered = false;
  const autocompleteProviders: Function[] = [];
  const terminalWrites: string[] = [];

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [];
    },
    registerCommand() {},
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      addAutocompleteProvider(factory: Function) {
        autocompleteProviders.push(factory);
      },
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        footerRegistered = true;
        factory(undefined, undefined, {
          getGitBranch: () => undefined,
          onBranchChange: () => () => undefined,
        });
      },
      setWidget(_key: string, _factory: Function, options: { placement: string }) {
        if (options.placement === "belowEditor") widgetRegistered = true;
      },
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  editorFactory!(
    {
      requestRender() {},
      terminal: {
        rows: 40,
        write(data: string) {
          terminalWrites.push(data);
        },
      },
    },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  assert.equal(footerRegistered, true);
  assert.equal(widgetRegistered, true);
  assert.equal(autocompleteProviders.length, 2);
  assert.deepEqual(terminalWrites, []);
});

test("installCodexEditorUi writes emergency terminal reset when lifecycle resets without active compositor", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number; columns: number; write(data: string): void }; children: unknown[] },
        editorTheme: unknown,
        keybindings: unknown,
      ) => { render(width: number): string[] })
    | undefined;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "editor-reset-"));
  await mkdir(path.join(tmpDir, ".pi"), { recursive: true });
  await writeFile(path.join(tmpDir, ".pi", "settings.json"), `${JSON.stringify({ editor: { fixedEditor: true } })}\n`);
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    installCodexEditorUi({
      getThinkingLevel() {
        return "low";
      },
      getCommands() {
        return [];
      },
      on(event: string, handler: Function) {
        lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
      },
      events: {
        on() {},
      },
      registerCommand() {},
    } as never);

    const ctx = createEditorTestContext(tmpDir, {
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
    });
    for (const handler of lifecycleHandlers.get("session_start") ?? []) {
      await handler(undefined, ctx as never);
    }

    assert.ok(editorFactory);
    const parent = { children: [] as unknown[], render: () => ["parent"] };
    const tui = {
      children: [parent],
      requestRender() {},
      terminal: {
        rows: 20,
        columns: 60,
        write() {
          throw new Error("terminal unavailable");
        },
      },
    };
    const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
    parent.children.push(editor);
    await Promise.resolve();

    for (const handler of lifecycleHandlers.get("session_shutdown") ?? []) handler();
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.ok(writes.some((write) => write.includes("\x1b[?1049l")));
  assert.ok(writes.some((write) => write.includes("\x1b[<999u\x1b[>4;0m")));
});

test("findContainerWithChild locates editor container and index", () => {
  const editor = { render: () => ["editor"] };
  const status = { render: () => ["status"] };
  const parent = { children: [status, editor] };
  const tui = { children: [{ children: [] }, parent] };

  const match = findContainerWithChild(tui, editor);

  assert.equal(match?.container, parent);
  assert.equal(match?.index, 1);
  assert.equal(match?.childIndex, 1);
});

function createEditorTestContext(cwd: string, uiOverrides: Record<string, unknown> = {}) {
  return {
    cwd,
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      notify() {},
      addAutocompleteProvider() {},
      setEditorComponent() {},
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => undefined,
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
      ...uiOverrides,
    },
  };
}

type EditorHarness = {
  editor: {
    getText(): string;
    setText(text: string): void;
    handleInput(data: string): void;
  };
  ctx: ReturnType<typeof createEditorTestContext>;
  lifecycleHandlers: Map<string, Function[]>;
  notifications: string[];
  shortcuts: Map<string, { handler: (ctx: unknown) => Promise<void> | void }>;
};

async function createStashEditorHarness(): Promise<EditorHarness> {
  const lifecycleHandlers = new Map<string, Function[]>();
  const notifications: string[] = [];
  const shortcuts = new Map<string, { handler: (ctx: unknown) => Promise<void> | void }>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number; write(data: string): void } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => EditorHarness["editor"])
    | undefined;

  installCodexEditorUi({
    getThinkingLevel: () => "low",
    getCommands: () => [],
    registerCommand() {},
    registerShortcut(shortcut: string, options: { handler: (ctx: unknown) => Promise<void> | void }) {
      shortcuts.set(shortcut, options);
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: { on() {} },
  } as never);

  const ctx = createEditorTestContext("/tmp/project", {
    notify(message: string) {
      notifications.push(message);
    },
    setEditorComponent(factory: typeof editorFactory) {
      editorFactory = factory;
    },
  });

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }
  assert.ok(editorFactory);

  const editor = editorFactory!(
    { requestRender() {}, terminal: { rows: 40, write() {} } },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  return { editor, ctx, lifecycleHandlers, notifications, shortcuts };
}

test("editor stash handles macOS option-s input and auto-restores after an agent run", async () => {
  const { editor, ctx, lifecycleHandlers, notifications } = await createStashEditorHarness();

  editor.setText("long draft");
  editor.handleInput("ß");

  assert.equal(editor.getText(), "");
  assert.ok(notifications.includes("Text stashed"));

  editor.setText("quick question");
  for (const handler of lifecycleHandlers.get("agent_end") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.equal(editor.getText(), "quick question");
  assert.ok(notifications.includes("Stash preserved - clear editor then Alt+S to restore"));

  editor.setText("");
  for (const handler of lifecycleHandlers.get("agent_end") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.equal(editor.getText(), "long draft");
  assert.ok(notifications.includes("Stash restored"));
});

test("editor stash registered alt-s shortcut shares the active session stash", async () => {
  const { editor, ctx, notifications, shortcuts } = await createStashEditorHarness();
  const shortcut = shortcuts.get("alt+s");
  assert.ok(shortcut);

  editor.setText("draft from shortcut");
  await shortcut.handler(ctx);

  assert.equal(editor.getText(), "");
  assert.ok(notifications.includes("Text stashed"));

  await shortcut.handler(ctx);

  assert.equal(editor.getText(), "draft from shortcut");
  assert.ok(notifications.includes("Stash restored"));
});

test("installCodexEditorUi does not register an editor command", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number; write(data: string): void } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => unknown)
    | undefined;
  let renderRequests = 0;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [];
    },
    registerCommand(name: string) {
      throw new Error(`unexpected command registration: ${name}`);
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      notify() {},
      addAutocompleteProvider() {},
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => undefined,
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }
  assert.ok(editorFactory);
  editorFactory!(
    {
      requestRender() {
        renderRequests += 1;
      },
      terminal: { rows: 40, write() {} },
    },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  assert.equal(renderRequests, 0);
});

test("installCodexEditorUi retries fixed-editor install when settings load after eager editor creation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-eager-"));
  const projectDir = path.join(tempDir, "project");
  await mkdir(path.join(projectDir, ".pi"), { recursive: true });
  await writeFile(
    path.join(projectDir, ".pi", "settings.json"),
    `${JSON.stringify({ editor: { fixedEditor: true } }, null, 2)}\n`,
    { encoding: "utf8" },
  );
  const lifecycleHandlers = new Map<string, Function[]>();
  let childrenReads = 0;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [];
    },
    registerCommand() {},
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: projectDir,
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      notify() {},
      addAutocompleteProvider() {},
      setEditorComponent(factory: Function) {
        const tui = {
          requestRender() {},
          terminal: { rows: 40, write() {} },
          get children() {
            childrenReads += 1;
            return [];
          },
        };
        factory(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => undefined,
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(childrenReads > 0);
});

test("installCodexEditorUi installs fixed editor compositor when enabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-active-"));
  const projectDir = path.join(tempDir, "project");
  await mkdir(path.join(projectDir, ".pi"), { recursive: true });
  await writeFile(
    path.join(projectDir, ".pi", "settings.json"),
    `${JSON.stringify({ editor: { fixedEditor: true } }, null, 2)}\n`,
    "utf8",
  );
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory: Function | undefined;
  const terminalWrites: string[] = [];
  const terminal = {
    columns: 40,
    rows: 12,
    write(data: string) {
      terminalWrites.push(data);
    },
  };
  const chat = {
    render() {
      return ["leading-row"];
    },
  };
  const status = {
    render() {
      return ["status-row"];
    },
  };
  const above = {
    render() {
      return ["above-row"];
    },
  };
  const editorContainer = {
    children: [] as Array<{ render?(width: number): string[] }>,
    render(width: number) {
      return this.children.flatMap((child) => child.render?.(width) ?? []);
    },
  };
  const below = {
    render() {
      return ["below-row"];
    },
  };
  const footer = {
    render() {
      return [];
    },
  };
  const tui = {
    terminal,
    children: [chat, status, above, editorContainer, below, footer] as unknown[],
    requestRender() {},
    render() {
      return ["chat"];
    },
    doRender() {
      terminal.write("body");
    },
    getShowHardwareCursor() {
      return true;
    },
  };

  installCodexEditorUi({
    getThinkingLevel: () => "low",
    getCommands: () => [],
    registerCommand() {},
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: { on() {} },
  } as never);

  const ctx = createEditorTestContext(projectDir, {
    setEditorComponent(factory: Function) {
      editorFactory = factory;
    },
  });
  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
  editor.focused = true;
  editorContainer.children.push(editor);
  await Promise.resolve();

  assert.ok(terminalWrites.some((write) => write.includes("\x1b[?1049h")));
  assert.equal(terminalWrites.some((write) => write.includes("leading-row")), false);
  assert.ok(terminalWrites.some((write) => write.includes("status-row")), terminalWrites.join("\n---\n"));
  assert.ok(terminalWrites.some((write) => write.includes("above-row")), terminalWrites.join("\n---\n"));
  assert.ok(terminalWrites.some((write) => write.includes("below-row")), terminalWrites.join("\n---\n"));
  assert.equal(terminalWrites.some((write) => write.includes("gpt-5.4-mini low")), false);
  assert.ok(terminalWrites.every((write) => !write.includes("\x1b[?25h")), terminalWrites.join("\n---\n"));
  assert.deepEqual(chat.render(), ["leading-row"]);
  assert.deepEqual(status.render(), []);
  assert.deepEqual(above.render(), []);
  assert.deepEqual(editorContainer.render(40), []);
  assert.deepEqual(below.render(), []);
});

test("installCodexEditorUi keeps chat containers in the scrollable root", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-sibling-root-"));
  const projectDir = path.join(tempDir, "project");
  await mkdir(path.join(projectDir, ".pi"), { recursive: true });
  await writeFile(
    path.join(projectDir, ".pi", "settings.json"),
    `${JSON.stringify({ editor: { fixedEditor: true } }, null, 2)}\n`,
    "utf8",
  );
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory: Function | undefined;
  const terminalWrites: string[] = [];
  const terminal = {
    columns: 40,
    rows: 12,
    write(data: string) {
      terminalWrites.push(data);
    },
  };
  const chat = {
    render() {
      return ["transcript-row"];
    },
  };
  const status = {
    render() {
      return ["status-row"];
    },
  };
  const above = {
    render() {
      return ["above-row"];
    },
  };
  const editorContainer = {
    children: [] as Array<{ render?(width: number): string[] }>,
    render(width: number) {
      return this.children.flatMap((child) => child.render?.(width) ?? []);
    },
  };
  const below = {
    render() {
      return ["below-row"];
    },
  };
  const footer = {
    render() {
      return [];
    },
  };
  const tui = {
    terminal,
    children: [chat, status, above, editorContainer, below, footer] as unknown[],
    requestRender() {},
    render(width: number) {
      return (this.children as Array<{ render?(width: number): string[] }>).flatMap((child) => child.render?.(width) ?? []);
    },
    doRender() {
      terminal.write("body");
    },
    getShowHardwareCursor() {
      return true;
    },
  };

  installCodexEditorUi({
    getThinkingLevel: () => "low",
    getCommands: () => [],
    registerCommand() {},
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: { on() {} },
  } as never);

  const ctx = createEditorTestContext(projectDir, {
    setEditorComponent(factory: Function) {
      editorFactory = factory;
    },
  });
  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
  editor.focused = true;
  editorContainer.children.push(editor);
  await Promise.resolve();

  const rootLines = tui.render(40);
  assert.equal(rootLines[0], "transcript-row");
  assert.equal(rootLines.includes("status-row"), false);
  assert.equal(rootLines.includes("above-row"), false);
  assert.equal(rootLines.includes("below-row"), false);
  assert.equal(terminalWrites.join("\n").includes("transcript-row"), false);
  assert.ok(terminalWrites.join("\n").includes("status-row"), terminalWrites.join("\n---\n"));
  assert.ok(terminalWrites.join("\n").includes("above-row"), terminalWrites.join("\n---\n"));
  assert.ok(terminalWrites.join("\n").includes("below-row"), terminalWrites.join("\n---\n"));
});

test("editor settings changed event toggles active compositor", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-toggle-"));
  const projectDir = path.join(tempDir, "project");
  const lifecycleHandlers = new Map<string, Function[]>();
  const eventHandlers = new Map<string, Function>();
  let editorFactory: Function | undefined;
  const terminalWrites: string[] = [];
  const terminal = {
    columns: 40,
    rows: 12,
    write(data: string) {
      terminalWrites.push(data);
    },
  };
  const parent = {
    children: [] as Array<{ render?(width: number): string[] }>,
    render(width: number) {
      return this.children.flatMap((child) => child.render?.(width) ?? []);
    },
  };
  const tui = {
    terminal,
    children: [parent],
    requestRender() {},
    render() {
      return ["chat"];
    },
    doRender() {
      terminal.write("body");
    },
  };

  installCodexEditorUi({
    getThinkingLevel: () => "low",
    getCommands: () => [],
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on(event: string, handler: Function) {
        eventHandlers.set(event, handler);
      },
    },
  } as never);

  const ctx = createEditorTestContext(projectDir, {
    setEditorComponent(factory: Function) {
      editorFactory = factory;
    },
  });
  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }
  const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
  parent.children.push(editor);

  eventHandlers.get(EDITOR_SETTINGS_CHANGED_EVENT)?.({ settings: { fixedEditor: true } });
  assert.ok(terminalWrites.some((write) => write.includes("\x1b[?1049h")));

  eventHandlers.get(EDITOR_SETTINGS_CHANGED_EVENT)?.({ settings: { fixedEditor: false } });
  assert.ok(terminalWrites.at(-1)?.includes("\x1b[?1049l"));
});

test("fixed editor status events repaint active compositor", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-status-"));
  const projectDir = path.join(tempDir, "project");
  await mkdir(path.join(projectDir, ".pi"), { recursive: true });
  await writeFile(
    path.join(projectDir, ".pi", "settings.json"),
    `${JSON.stringify({ editor: { fixedEditor: true } }, null, 2)}\n`,
    "utf8",
  );
  const lifecycleHandlers = new Map<string, Function[]>();
  const eventHandlers = new Map<string, Function>();
  let editorFactory: Function | undefined;
  const terminalWrites: string[] = [];
  let renderRequests = 0;
  const terminal = {
    columns: 60,
    rows: 12,
    write(data: string) {
      terminalWrites.push(data);
    },
  };
  const parent = {
    children: [] as Array<{ render?(width: number): string[] }>,
    render(width: number) {
      return this.children.flatMap((child) => child.render?.(width) ?? []);
    },
  };
  const tui = {
    terminal,
    children: [parent],
    requestRender() {
      renderRequests += 1;
    },
    render() {
      return ["chat"];
    },
    doRender() {
      terminal.write("body");
    },
  };

  installCodexEditorUi({
    getThinkingLevel: () => "low",
    getCommands: () => [],
    registerCommand() {},
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on(event: string, handler: Function) {
        eventHandlers.set(event, handler);
      },
    },
  } as never);

  const ctx = createEditorTestContext(projectDir, {
    setEditorComponent(factory: Function) {
      editorFactory = factory;
    },
  });
  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }
  const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, { matches: () => false });
  parent.children.push(editor);
  await Promise.resolve();

  const setStatus = eventHandlers.get(EDITOR_SET_STATUS_SEGMENT_EVENT);
  assert.ok(setStatus);
  setStatus({ key: "sync", text: "syncing", align: "right" });
  await Promise.resolve();

  assert.ok(
    terminalWrites.some((write) => write.includes("syncing")) || renderRequests > 0,
    terminalWrites.join("\n---\n"),
  );
});

test("fixed editor submit hooks jump to root bottom without replacing submit behavior", async () => {
  let jumps = 0;
  const originalJump = TerminalSplitCompositor.prototype.jumpToRootBottom;
  TerminalSplitCompositor.prototype.jumpToRootBottom = function patchedJump() {
    jumps += 1;
    return true;
  };

  try {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-submit-"));
    const projectDir = path.join(tempDir, "project");
    await mkdir(path.join(projectDir, ".pi"), { recursive: true });
    await writeFile(
      path.join(projectDir, ".pi", "settings.json"),
      `${JSON.stringify({ editor: { fixedEditor: true } }, null, 2)}\n`,
      "utf8",
    );
    const lifecycleHandlers = new Map<string, Function[]>();
    let editorFactory: Function | undefined;
    const terminal = { columns: 40, rows: 12, write() {} };
    const parent = {
      children: [] as Array<{ render?(width: number): string[] }>,
      render(width: number) {
        return this.children.flatMap((child) => child.render?.(width) ?? []);
      },
    };
    const tui = { terminal, children: [parent], requestRender() {}, render: () => ["chat"], doRender() {} };

    installCodexEditorUi({
      getThinkingLevel: () => "low",
      getCommands: () => [],
      registerCommand() {},
      on(event: string, handler: Function) {
        lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
      },
      events: { on() {} },
    } as never);

    const ctx = createEditorTestContext(projectDir, {
      setEditorComponent(factory: Function) {
        editorFactory = factory;
      },
    });
    for (const handler of lifecycleHandlers.get("session_start") ?? []) {
      await handler(undefined, ctx as never);
    }
    const keybindings = { matches: (data: string, action: string) => data === "follow" && action === "app.message.followUp" };
    const editor = editorFactory!(tui, { borderColor: (text: string) => text, selectList: {} }, keybindings);
    parent.children.push(editor);
    await Promise.resolve();

    const submitted: string[] = [];
    editor.onSubmit = (text: string) => submitted.push(text);
    editor.onSubmit("hello");
    assert.deepEqual(submitted, ["hello"]);
    assert.equal(jumps, 1);

    editor.setText("queued");
    editor.onAction("app.message.followUp", () => editor.setText(""));
    editor.handleInput("follow");
    assert.equal(jumps, 2);
  } finally {
    TerminalSplitCompositor.prototype.jumpToRootBottom = originalJump;
  }
});

test("installCodexEditorUi keeps at least two input rows in the boxed editor", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => { render(width: number): string[] })
    | undefined;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [];
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return { percent: 45, contextWindow: 272000 };
    },
    sessionManager: {
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills: true } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "\u001b[38;5;15m",
        getBgAnsi: () => "\u001b[48;5;8m",
        getColorMode: () => "truecolor",
      },
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "main",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(
    { requestRender() {}, terminal: { rows: 40 } },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  const rows = editor.render(80).slice(1, 3);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((line) => visibleWidth(line) === 80));
  assert.equal(editor.render(80).some((line) => line.startsWith("╰")), false);
});

test("installCodexEditorUi renders compact repo metadata below narrow editor", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => { render(width: number): string[] })
    | undefined;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [];
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project/pi-extensions",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return { percent: 45, contextWindow: 272000 };
    },
    sessionManager: {
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills: true } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "mobile-proposal",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(
    { requestRender() {}, terminal: { rows: 40 } },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  const lines = editor.render(50);
  assert.equal(lines.some((line) => line.includes("gpt-5.4-mini low")), false);
  assert.equal(lines.some((line) => line.includes("pi-extensions")), false);
  assert.ok(lines.every((line) => visibleWidth(line) <= 50));
});

test("installCodexEditorUi keeps compact skill count above forty columns", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  const eventHandlers = new Map<string, Function>();
  let editorFactory:
    | ((
        tui: { requestRender(): void; terminal: { rows: number } },
        editorTheme: unknown,
        keybindings: unknown,
      ) => { render(width: number): string[] })
    | undefined;

  installCodexEditorUi({
    getThinkingLevel() {
      return "low";
    },
    getCommands() {
      return [
        { source: "skill", name: "skill:one" },
        { source: "skill", name: "skill:two" },
      ];
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on(event: string, handler: Function) {
        eventHandlers.set(event, handler);
      },
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project/pi-extensions",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills: true } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (color: string, text: string) => {
          const code = color === "muted" ? 90 : color === "text" ? 37 : 39;
          return `\u001b[${code}m${text}\u001b[0m`;
        },
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      setEditorComponent(factory: typeof editorFactory) {
        editorFactory = factory;
      },
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "mobile-proposal",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(editorFactory);
  const editor = editorFactory!(
    { requestRender() {}, terminal: { rows: 40 } },
    { borderColor: (text: string) => text, selectList: {} },
    { matches: () => false },
  );

  assert.ok((editor.render(50)[0] ?? "").includes("2 skills"));
  assert.ok((editor.render(50)[0] ?? "").includes("Codex"));
  assert.equal((editor.render(50)[0] ?? "").includes("ctrl+alt+m"), false);
  eventHandlers.get(EDITOR_SET_STATUS_SEGMENT_EVENT)?.({
    key: "boomerang",
    text: BOOMERANG_ICON,
    align: "right",
    priority: -1,
  });
  assert.ok(
    (editor.render(50)[0] ?? "").includes(
      `\u001b[37m${BOOMERANG_ICON}\u001b[0m\u001b[90m╶╴\u001b[0m\u001b[37m2 skills\u001b[0m`,
    ),
  );
  eventHandlers.get(EDITOR_REMOVE_STATUS_SEGMENT_EVENT)?.({ key: "boomerang" });
  assert.equal((editor.render(50)[0] ?? "").includes(BOOMERANG_ICON), false);
  assert.ok((editor.render(41)[0] ?? "").includes("2 skills"));
  assert.equal((editor.render(40)[0] ?? "").includes("2 skills"), false);
});

test("installCodexEditorUi registers stacked autocomplete providers for $skill and @path", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  const autocompleteProviders: Array<(provider: AutocompleteProvider) => AutocompleteProvider> = [];

  installCodexEditorUi({
    getThinkingLevel() {
      return "medium";
    },
    on(event: string, handler: Function) {
      lifecycleHandlers.set(event, [...(lifecycleHandlers.get(event) ?? []), handler]);
    },
    events: {
      on() {},
    },
  } as never);

  const ctx = {
    cwd: "/tmp/project",
    model: { id: "gpt-5.4-mini" },
    getContextUsage() {
      return undefined;
    },
    sessionManager: {
      getSessionFile() {
        return "/tmp/project/.pi/session.json";
      },
      getBranch() {
        return [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
          { type: "custom", customType: "pi-mode:load-skills", data: { loadSkills: true } },
        ];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        strikethrough: (text: string) => text,
        getFgAnsi: () => "",
        getBgAnsi: () => "",
        getColorMode: () => "truecolor",
      },
      addAutocompleteProvider(factory: (provider: AutocompleteProvider) => AutocompleteProvider) {
        autocompleteProviders.push(factory);
      },
      setEditorComponent() {},
      setFooter(factory: Function) {
        factory(undefined, undefined, {
          getGitBranch: () => "main",
          onBranchChange: () => () => undefined,
        });
      },
      setWidget() {},
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.equal(autocompleteProviders.length, 2);

  const baseProvider: AutocompleteProvider = {
    async getSuggestions(lines, cursorLine, cursorCol) {
      const prefix = (lines[cursorLine] ?? "").slice(0, cursorCol);
      return {
        prefix,
        items: [{ value: prefix, label: prefix }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return {
        lines: [
          `${(lines[cursorLine] ?? "").slice(0, cursorCol - prefix.length)}${item.value}${(lines[cursorLine] ?? "").slice(cursorCol)}`,
        ],
        cursorLine,
        cursorCol: cursorCol - prefix.length + item.value.length,
      };
    },
  };

  const provider = autocompleteProviders.reduce(
    (current, factory) => factory(current),
    baseProvider,
  );

  const skillSuggestions = await provider.getSuggestions(["use $sys"], 0, "use $sys".length, {
    signal: new AbortController().signal,
  });
  assert.equal(skillSuggestions?.prefix, "$sys");
});

test("subagent role autocomplete suggests cwd-visible roles only in agent type value positions", async () => {
  let baseCalls = 0;
  const baseProvider: AutocompleteProvider = {
    async getSuggestions(lines, cursorLine, cursorCol) {
      baseCalls += 1;
      const prefix = (lines[cursorLine] ?? "").slice(0, cursorCol);
      return {
        prefix,
        items: [{ value: prefix, label: prefix }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return {
        lines: [
          `${(lines[cursorLine] ?? "").slice(0, cursorCol - prefix.length)}${item.value}${(lines[cursorLine] ?? "").slice(cursorCol)}`,
        ],
        cursorLine,
        cursorCol: cursorCol - prefix.length + item.value.length,
      };
    },
  };

  const provider = createSubagentRoleAutocompleteProvider({
    cwd: "/tmp/project",
    resolveRoleNames: () => ["default", "reviewer", "researcher"],
  })(baseProvider);

  const suggestions = await provider.getSuggestions(
    ['{"agent_type": "rev"}'],
    0,
    '{"agent_type": "rev"}'.length - 2,
    { signal: new AbortController().signal },
  );

  assert.equal(suggestions?.prefix, "rev");
  assert.deepEqual(
    suggestions?.items.map((item) => item.value),
    ["reviewer"],
  );

  const fallback = await provider.getSuggestions(
    ["delegate reviewer"],
    0,
    "delegate reviewer".length,
    {
      signal: new AbortController().signal,
    },
  );
  assert.equal(fallback?.prefix, "delegate reviewer");
  assert.equal(baseCalls, 1);
});
