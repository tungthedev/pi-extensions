import type { FileFinder, Result, SearchResult } from "@ff-labs/fff-node";

import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Box } from "@mariozechner/pi-tui";

import {
  resetSessionFffRuntimesForTests,
  setSessionFffRuntimeForTests,
} from "../fff/session-runtime.ts";
import { FffRuntime } from "../shared/fff/runtime.ts";
import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";
import registerPiCustomExtension from "./index.ts";

function captureTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  registerPiCustomExtension({
    on() {},
    registerTool(definition: { name: string }) {
      tools[definition.name] = definition;
    },
  } as never);

  return tools;
}

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => `[bg]${text}[/bg]`,
  bold: (text: string) => text,
} as any;

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

function getTextContent(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

test.afterEach(() => {
  resetSessionFffRuntimesForTests();
});

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function createMockFinder(overrides: Partial<FileFinder>): FileFinder {
  return {
    destroy() {},
    fileSearch() {
      throw new Error("fileSearch not implemented");
    },
    grep() {
      throw new Error("grep not implemented");
    },
    multiGrep() {
      throw new Error("multiGrep not implemented");
    },
    scanFiles() {
      return ok(undefined);
    },
    isScanning() {
      return false;
    },
    getScanProgress() {
      return ok({ scannedFilesCount: 0, isScanning: false });
    },
    waitForScan: async () => ok(true),
    reindex() {
      return ok(undefined);
    },
    refreshGitStatus() {
      return ok(0);
    },
    trackQuery() {
      return ok(true);
    },
    getHistoricalQuery() {
      return ok(null);
    },
    healthCheck() {
      return ok({
        version: "test",
        git: { available: true, repositoryFound: false, libgit2Version: "test" },
        filePicker: { initialized: true, indexedFiles: 0 },
        frecency: { initialized: false },
        queryTracker: { initialized: false },
      });
    },
    get isDestroyed() {
      return false;
    },
    ...overrides,
  } as unknown as FileFinder;
}

const CROSS_MODE_TOOL_INFOS = resolveRegisteredToolInfos([
  { name: "read", description: "custom read" },
  { name: "grep", description: "builtin grep" },
  { name: "find", description: "builtin find" },
  { name: "ls", description: "builtin ls" },
  { name: "edit", description: "builtin edit" },
  { name: "write", description: "builtin write" },
  { name: "bash", description: "builtin bash" },
  { name: "shell", description: "compat shell" },
  { name: "WebSearch", description: "web search" },
  { name: "WebSummary", description: "web summary" },
  { name: "FetchUrl", description: "fetch" },
  { name: "skill", description: "skill" },
  { name: "update_plan", description: "codex" },
  { name: "read_plan", description: "codex" },
  { name: "request_user_input", description: "codex" },
  { name: "list_dir", description: "codex" },
  { name: "find_files", description: "codex" },
  { name: "grep_files", description: "codex" },
  { name: "apply_patch", description: "codex" },
  { name: "view_image", description: "codex" },
  { name: "LS", description: "droid" },
  { name: "Grep", description: "droid" },
  { name: "Glob", description: "droid" },
  { name: "Create", description: "droid" },
  { name: "Edit", description: "droid" },
  { name: "ApplyPatch", description: "droid" },
  { name: "AskUser", description: "droid" },
  { name: "TodoWrite", description: "droid" },
  { name: "Execute", description: "droid" },
  { name: "Task", description: "task" },
  { name: "spawn_agent", description: "subagent codex" },
  { name: "send_message", description: "subagent codex" },
  { name: "wait_agent", description: "subagent codex" },
  { name: "close_agent", description: "subagent codex" },
]);

test("read resolves relative paths from the session cwd", async () => {
  const tools = captureTools();
  const tool = tools.read;
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-session-cwd-"));
  const nested = path.join(root, "nested");
  const target = path.join(root, "note.txt");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(target, "hello from session cwd\n", "utf8");

  try {
    const result = await tool.execute(
      "call-1",
      { path: "../note.txt" },
      undefined,
      () => undefined,
      { cwd: nested },
    );

    assert.match(JSON.stringify(result), /hello from session cwd/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("read returns aligned line-numbered text for the model", async () => {
  const tools = captureTools();
  const tool = tools.read;
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-numbered-"));
  const target = path.join(root, "note.txt");
  fs.writeFileSync(target, "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n", "utf8");

  try {
    const result = await tool.execute(
      "call-numbered",
      { path: target, offset: 9, limit: 3 },
      undefined,
      () => undefined,
      { cwd: root },
    );

    assert.equal(
      getTextContent(result),
      "L 9: nine\nL10: ten\nL11: eleven\n\n[2 more lines in file. Use offset=12 to continue.]",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("read resolves approximate paths through FFF before native execution", async () => {
  const tools = captureTools();
  const tool = tools.read;
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-fff-"));
  const target = path.join(root, "docs", "project-notes.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "fuzzy path hit\n", "utf8");

  const sessionFile = path.join(root, "session.json");
  setSessionFffRuntimeForTests(
    `session:${sessionFile}`,
    new FffRuntime(root, {
      projectRoot: root,
      finder: createMockFinder({
        fileSearch(query): Result<SearchResult> {
          assert.equal(query, "proj note");
          return ok({
            items: [
              {
                path: target,
                relativePath: "docs/project-notes.md",
                fileName: "project-notes.md",
                size: 1,
                modified: 0,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                totalFrecencyScore: 0,
                gitStatus: "clean",
              },
            ],
            scores: [
              {
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
            ],
            totalMatched: 1,
            totalFiles: 1,
          });
        },
      }),
    }),
  );

  try {
    const result = await tool.execute(
      "call-approx",
      { path: "proj note" },
      undefined,
      () => undefined,
      {
        cwd: root,
        sessionManager: {
          getSessionFile() {
            return sessionFile;
          },
        },
      },
    );

    assert.match(JSON.stringify(result), /fuzzy path hit/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the same FFF-backed read remains active and executes in pi, codex, and droid modes", async () => {
  const tools = captureTools();
  const tool = tools.read;
  const root = fs.mkdtempSync(path.join(tmpdir(), "read-cross-mode-"));
  const target = path.join(root, "src", "shared-read.ts");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "shared read body\n", "utf8");

  try {
    for (const mode of ["pi", "codex", "droid"] as const) {
      assert.ok(resolveToolsetToolNames(mode, CROSS_MODE_TOOL_INFOS).includes("read"));

      const sessionFile = path.join(root, `${mode}.session.json`);
      setSessionFffRuntimeForTests(
        `session:${sessionFile}`,
        new FffRuntime(root, {
          projectRoot: root,
          finder: createMockFinder({
            fileSearch(query): Result<SearchResult> {
              assert.equal(query, `${mode} read`);
              return ok({
                items: [
                  {
                    path: target,
                    relativePath: "src/shared-read.ts",
                    fileName: "shared-read.ts",
                    size: 1,
                    modified: 0,
                    accessFrecencyScore: 0,
                    modificationFrecencyScore: 0,
                    totalFrecencyScore: 0,
                    gitStatus: "clean",
                  },
                ],
                scores: [
                  {
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
                ],
                totalMatched: 1,
                totalFiles: 1,
              });
            },
          }),
        }),
      );

      const result = await tool.execute(
        `call-${mode}`,
        { path: `${mode} read` },
        undefined,
        () => undefined,
        {
          cwd: root,
          sessionManager: {
            getSessionFile() {
              return sessionFile;
            },
          },
        },
      );

      assert.match(JSON.stringify(result), /shared read body/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("find uses FFF-first discovery for fuzzy file queries", async () => {
  const tools = captureTools();
  const tool = tools.find;
  const root = fs.mkdtempSync(path.join(tmpdir(), "find-fff-"));

  const sessionFile = path.join(root, "find.session.json");
  setSessionFffRuntimeForTests(
    `session:${sessionFile}`,
    new FffRuntime(root, {
      projectRoot: root,
      finder: createMockFinder({
        fileSearch(query): Result<SearchResult> {
          assert.equal(query, "docs notes");
          return ok({
            items: [
              {
                path: path.join(root, "docs", "project-notes.md"),
                relativePath: "docs/project-notes.md",
                fileName: "project-notes.md",
                size: 1,
                modified: 0,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                totalFrecencyScore: 0,
                gitStatus: "clean",
              },
            ],
            scores: [
              {
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
            ],
            totalMatched: 1,
            totalFiles: 1,
          });
        },
      }),
    }),
  );

  const result = await tool.execute(
    "call-find-fff",
    { pattern: "docs notes" },
    undefined,
    () => undefined,
    {
      cwd: root,
      sessionManager: {
        getSessionFile() {
          return sessionFile;
        },
      },
    },
  );

  assert.match(JSON.stringify(result), /docs\/project-notes\.md/);
  assert.equal(result.details.count, 1);
});

test("find falls back to legacy glob behavior for explicit glob patterns", async () => {
  const tools = captureTools();
  const tool = tools.find;
  const root = fs.mkdtempSync(path.join(tmpdir(), "find-legacy-"));
  fs.writeFileSync(path.join(root, "alpha.ts"), "export const alpha = true;\n", "utf8");

  try {
    const result = await tool.execute(
      "call-find-legacy",
      { pattern: "*.ts", path: root, limit: 10 },
      undefined,
      () => undefined,
      { cwd: root },
    );

    assert.match(JSON.stringify(result), /alpha\.ts/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("grep uses FFF to resolve approximate scope paths before searching", async () => {
  const tools = captureTools();
  const tool = tools.grep;
  const root = fs.mkdtempSync(path.join(tmpdir(), "grep-fff-"));
  const target = path.join(root, "src", "button.ts");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "const needle = true;\n", "utf8");

  const sessionFile = path.join(root, "grep.session.json");
  setSessionFffRuntimeForTests(
    `session:${sessionFile}`,
    new FffRuntime(root, {
      projectRoot: root,
      finder: createMockFinder({
        fileSearch(query): Result<SearchResult> {
          assert.equal(query, "button component");
          return ok({
            items: [
              {
                path: target,
                relativePath: "src/button.ts",
                fileName: "button.ts",
                size: 1,
                modified: 0,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                totalFrecencyScore: 0,
                gitStatus: "clean",
              },
            ],
            scores: [
              {
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
            ],
            totalMatched: 1,
            totalFiles: 1,
          });
        },
        grep(query): any {
          assert.equal(query, "src/button.ts needle");
          return ok({
            items: [
              {
                path: target,
                relativePath: "src/button.ts",
                fileName: "button.ts",
                gitStatus: "clean",
                size: 1,
                modified: 0,
                isBinary: false,
                totalFrecencyScore: 0,
                accessFrecencyScore: 0,
                modificationFrecencyScore: 0,
                lineNumber: 1,
                col: 6,
                byteOffset: 0,
                lineContent: "const needle = true;",
                matchRanges: [[6, 12]],
                contextBefore: [],
                contextAfter: [],
              },
            ],
            totalMatched: 1,
            totalFilesSearched: 1,
            totalFiles: 1,
            filteredFileCount: 1,
            nextCursor: null,
          });
        },
      }),
    }),
  );

  try {
    const result = await tool.execute(
      "call-grep-fff",
      { pattern: "needle", path: "button component" },
      undefined,
      () => undefined,
      {
        cwd: root,
        sessionManager: {
          getSessionFile() {
            return sessionFile;
          },
        },
      },
    );

    assert.match(JSON.stringify(result), /needle/);
    assert.equal(result.details.matchCount, 1);
    assert.equal(result.details.fileCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("write uses call summary and hides collapsed result", () => {
  const tools = captureTools();
  const tool = tools.write;

  const call = tool.renderCall({ path: "src/a.ts", content: "one\ntwo" }, theme, {
    lastComponent: undefined,
  } as never);
  assert.equal(call.text, "Wrote src/a.ts (2 lines)");

  const collapsed = tool.renderResult(
    { content: [{ type: "text", text: "ok" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );
  assert.deepEqual(collapsed.render(120), []);
});

test("read uses a self-rendered Box shell with horizontal-only padding and no background", () => {
  const tools = captureTools();
  const tool = tools.read;
  const state: Record<string, unknown> = {};

  const call = tool.renderCall(
    { path: "src/a.ts", offset: 2, limit: 3 },
    theme,
    { state, lastComponent: undefined } as never,
  );

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)), ["  Read src/a.ts:2-4"]);

  const collapsed = tool.renderResult(
    { content: [{ type: "text", text: "alpha\nbeta" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);

  const rendered = trimRenderedLines(call.render(120));
  assert.equal(rendered[0]?.includes("[bg]"), false);
  assert.equal(rendered.at(-1)?.includes("[bg]"), false);
  assert.notEqual(rendered[0]?.trim().length, 0);
  assert.notEqual(rendered.at(-1)?.trim().length, 0);
});

test("find shows a one-line collapsed summary", () => {
  const tools = captureTools();
  const tool = tools.find;

  const collapsed = tool.renderResult(
    { details: { count: 14 }, content: [{ type: "text", text: "..." }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 14 files (ctrl+o to expand)"]);
});

test("grep shows a one-line collapsed summary", async () => {
  const tools = captureTools();
  const tool = tools.grep;
  const root = fs.mkdtempSync(path.join(tmpdir(), "grep-summary-"));
  const fileA = path.join(root, "a.ts");
  const fileB = path.join(root, "b.ts");
  fs.writeFileSync(fileA, "match\nother\nmatch\n", "utf8");
  fs.writeFileSync(fileB, "match\n", "utf8");

  try {
    const result = await tool.execute(
      "call-2",
      { pattern: "match", path: root, glob: "*.ts" },
      undefined,
      () => undefined,
      { cwd: root },
    );

    const collapsed = tool.renderResult(result, { expanded: false, isPartial: false }, theme, {
      isError: false,
      lastComponent: undefined,
    } as never);

    assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Matched 3 lines in 2 files"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
