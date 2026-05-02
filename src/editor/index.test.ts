import type { AutocompleteProvider } from "@mariozechner/pi-tui";

import { visibleWidth } from "@mariozechner/pi-tui";
import { Result } from "better-result";
import assert from "node:assert/strict";
import test from "node:test";

import { wrapAutocompleteProviderWithAtPathSupport } from "../shared/fff/editor/autocomplete-at-path.ts";
import { composeAutocompleteProvider } from "../shared/fff/editor/autocomplete-compose.ts";
import {
  createSubagentRoleAutocompleteProvider,
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
  installCodexEditorUi,
  normalizeCodexEditorInput,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./index.ts";
import { formatBottomLeftStatus } from "./status-format.ts";

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
      fg: (color: string, text: string) => (color === "muted" ? `<muted>${text}</muted>` : text),
      getBgAnsi: () => "\u001b[48;5;8m",
      getFgAnsi: () => "\u001b[38;5;15m",
      getColorMode: () => "256color",
    } as never,
  );

  assert.ok(status.startsWith("gpt-5.5 medium<muted>╶╴</muted>"));
  assert.ok(status.includes("\u001b[48;"));
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
  assert.ok((await renderEditorTopLine(true)).includes("\u001b[31m2 skills\u001b[39m"));
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

test("installCodexEditorUi applies and removes external status segments through editor events", async () => {
  const lifecycleHandlers = new Map<string, Function[]>();
  const eventHandlers = new Map<string, Function>();
  let statusWidgetFactory:
    | ((tui: { requestRender(): void }) => { render(width: number): string[] })
    | undefined;

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
      setWidget(_key: string, factory: typeof statusWidgetFactory, options: { placement: string }) {
        if (options.placement === "belowEditor") {
          statusWidgetFactory = factory;
        }
      },
    },
  };

  for (const handler of lifecycleHandlers.get("session_start") ?? []) {
    await handler(undefined, ctx as never);
  }

  assert.ok(statusWidgetFactory);
  const widget = statusWidgetFactory!({ requestRender() {} });
  const before = widget.render(80)[0] ?? "";

  eventHandlers.get(EDITOR_SET_STATUS_SEGMENT_EVENT)?.({
    key: "sync",
    text: "syncing",
    align: "right",
  });
  const afterSet = widget.render(80)[0] ?? "";

  eventHandlers.get(EDITOR_REMOVE_STATUS_SEGMENT_EVENT)?.({ key: "sync" });
  const afterRemove = widget.render(80)[0] ?? "";

  assert.ok(!before.includes("syncing"));
  assert.ok(afterSet.includes("syncing"));
  assert.ok(!afterRemove.includes("syncing"));
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

  const rows = editor.render(80).filter((line) => line.startsWith("│"));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((line) => visibleWidth(line) === 80));

  const bottom = editor.render(80).find((line) => line.startsWith("╰")) ?? "";
  assert.ok(bottom.includes("\u001b[48;"), bottom);
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
