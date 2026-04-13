import type { AutocompleteProvider } from "@mariozechner/pi-tui";

import { Result } from "better-result";
import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldTriggerAtPathAutocomplete,
  wrapAutocompleteProviderWithAtPathSupport,
} from "./autocomplete-at-path.ts";

function createBaseProvider(): AutocompleteProvider {
  return {
    async getSuggestions() {
      return null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const line = lines[cursorLine] ?? "";
      const nextLine = `${line.slice(0, cursorCol - prefix.length)}${item.value}${line.slice(cursorCol)}`;
      return {
        lines: [...lines.slice(0, cursorLine), nextLine, ...lines.slice(cursorLine + 1)],
        cursorLine,
        cursorCol: cursorCol - prefix.length + item.value.length,
      };
    },
  };
}

test("@path autocomplete returns fuzzy file suggestions", async () => {
  const provider = wrapAutocompleteProviderWithAtPathSupport(createBaseProvider(), {
    async searchFileCandidates(query) {
      assert.equal(query, "readme");
      return Result.ok([
        {
          item: {
            path: "/repo/README.md",
            relativePath: "README.md",
            fileName: "README.md",
            size: 1,
            modified: 0,
            accessFrecencyScore: 0,
            modificationFrecencyScore: 0,
            totalFrecencyScore: 0,
            gitStatus: "clean",
          },
          score: {
            total: 100,
            baseScore: 100,
            filenameBonus: 0,
            specialFilenameBonus: 0,
            frecencyBoost: 0,
            distancePenalty: 0,
            currentFilePenalty: 0,
            comboMatchBoost: 0,
            exactMatch: true,
            matchType: "exact",
          },
        },
      ]);
    },
    async trackQuery() {
      return Result.ok();
    },
  });

  const suggestions = await provider.getSuggestions(["open @readme"], 0, "open @readme".length, {
    signal: new AbortController().signal,
  });

  assert.deepEqual(suggestions, {
    prefix: "@readme",
    items: [{ value: "@README.md", label: "README.md", description: "README.md · exact" }],
  });
});

test("quoted @path autocomplete keeps quotes for paths with spaces", async () => {
  let tracked: { query: string; selectedPath: string } | undefined;
  const provider = wrapAutocompleteProviderWithAtPathSupport(createBaseProvider(), {
    async searchFileCandidates(query) {
      assert.equal(query, "folder with spaces/file");
      return Result.ok([
        {
          item: {
            path: "/repo/folder with spaces/file.ts",
            relativePath: "folder with spaces/file.ts",
            fileName: "file.ts",
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
    async trackQuery(query, selectedPath) {
      tracked = { query, selectedPath };
      return Result.ok();
    },
  });

  const suggestions = await provider.getSuggestions(
    ['open @"folder with spaces/file'],
    0,
    'open @"folder with spaces/file'.length,
    { signal: new AbortController().signal },
  );
  assert.equal(suggestions?.items[0]?.value, '@"folder with spaces/file.ts"');

  const completed = provider.applyCompletion(
    ['open @"folder with spaces/file'],
    0,
    'open @"folder with spaces/file'.length,
    suggestions!.items[0]!,
    suggestions!.prefix,
  );

  assert.equal(completed.lines[0], 'open @"folder with spaces/file.ts"');
  assert.deepEqual(tracked, {
    query: '@"folder with spaces/file',
    selectedPath: "folder with spaces/file.ts",
  });
});

test("@path autocomplete retries after warming the runtime when the first search is empty", async () => {
  let searchCalls = 0;
  let warmCalls = 0;
  const provider = wrapAutocompleteProviderWithAtPathSupport(createBaseProvider(), {
    async searchFileCandidates(query) {
      searchCalls += 1;
      assert.equal(query, "sl");
      if (searchCalls === 1) return Result.ok([]);
      return Result.ok([
        {
          item: {
            path: "/repo/extensions/settings/index.ts",
            relativePath: "extensions/settings/index.ts",
            fileName: "index.ts",
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
    async warm() {
      warmCalls += 1;
      return Result.ok({ ready: true, indexedFiles: 286 });
    },
  });

  const suggestions = await provider.getSuggestions(["open @sl"], 0, "open @sl".length, {
    signal: new AbortController().signal,
  });

  assert.equal(warmCalls, 1);
  assert.equal(searchCalls, 2);
  assert.equal(suggestions?.items[0]?.value, "@extensions/settings/index.ts");
});

test("shouldTriggerAtPathAutocomplete fires for typed path characters and backspace within @ tokens", () => {
  const keybindings = {
    matches(data: string, action: string) {
      return (
        (data === "BACKSPACE" && action === "tui.editor.deleteCharBackward") ||
        (data === "DELETE" && action === "tui.editor.deleteCharForward")
      );
    },
  };

  assert.equal(shouldTriggerAtPathAutocomplete("s", "@s", keybindings), true);
  assert.equal(shouldTriggerAtPathAutocomplete("BACKSPACE", "@sl", keybindings), true);
  assert.equal(shouldTriggerAtPathAutocomplete("x", "hello", keybindings), false);
});
