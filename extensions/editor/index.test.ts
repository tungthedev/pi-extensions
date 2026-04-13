import type { AutocompleteProvider } from "@mariozechner/pi-tui";

import { Result } from "better-result";
import assert from "node:assert/strict";
import test from "node:test";

import { wrapAutocompleteProviderWithAtPathSupport } from "../shared/fff/editor/autocomplete-at-path.ts";
import { composeAutocompleteProvider } from "../shared/fff/editor/autocomplete-compose.ts";
import {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
  formatRightStatus,
  installCodexEditorUi,
  normalizeCodexEditorInput,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./index.ts";
import { HorizontalLineWidget } from "./widget-row.ts";

test("HorizontalLineWidget re-renders the right status with the tighter budget", () => {
  const widget = new HorizontalLineWidget(() => [
    {
      align: "left",
      renderInline: () => "gpt-5.4-mini · 87.7%/272k",
    },
    {
      align: "right",
      renderInline: (maxWidth) =>
        formatRightStatus(
          {
            cwd: "/Volumes/Data/Projects/exp/pi-extensions",
            gitBranch: "main",
          },
          maxWidth,
        ),
    },
  ]);

  const line = widget.render(50)[0] ?? "";
  assert.ok(line.includes(".../"));
  assert.ok(line.endsWith(" · main"));
  assert.ok(!line.includes("/Volumes/Data/Projects"));
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
      return undefined;
    },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } }];
      },
    },
    ui: {
      theme: {
        fg: (_color: string, text: string) => text,
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
