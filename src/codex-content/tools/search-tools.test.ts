import type { FileFinder, Result, SearchResult } from "@ff-labs/fff-node";

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Box } from "@mariozechner/pi-tui";

import {
  resetSessionFffRuntimesForTests,
  setSessionFffRuntimeForTests,
} from "../../fff/session-runtime.ts";
import { FffRuntime } from "../../shared/fff/runtime.ts";
import { findMatchingFiles } from "./find-files.ts";
import { registerFindFilesTool } from "./find-files.ts";
import { findContentMatches, registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

function getRegisteredTool(register: (pi: any) => void, name: string) {
  let registeredTool: any;
  register({
    registerTool(tool: any) {
      if (tool.name === name) {
        registeredTool = tool;
      }
    },
  });
  assert.ok(registeredTool, `expected tool ${name} to be registered`);
  return registeredTool;
}

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

test.afterEach(() => {
  resetSessionFffRuntimesForTests();
});

test("findMatchingFiles returns absolute paths sorted by most recent modification time", async () => {
  await withTempDir(async (dir) => {
    const alpha = path.join(dir, "alpha.ts");
    const beta = path.join(dir, "nested", "beta.ts");

    await mkdir(path.dirname(beta), { recursive: true });
    await writeFile(alpha, "export const alpha = 1\n");
    await writeFile(beta, "export const beta = 2\n");

    const oldTime = new Date("2024-01-01T00:00:00.000Z");
    const newTime = new Date("2024-01-02T00:00:00.000Z");
    await utimes(alpha, oldTime, oldTime);
    await utimes(beta, newTime, newTime);

    const matches = await findMatchingFiles(dir, "**/*.ts");
    assert.deepEqual(
      matches.map((entry) => entry.absolutePath),
      [beta, alpha],
    );
  });
});

test("find_files preserves absolute-path output while using FFF-first fuzzy discovery", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerFindFilesTool, "find_files");
    const target = path.join(dir, "docs", "notes.md");
    const sessionFile = path.join(dir, "find-files.session.json");

    setSessionFffRuntimeForTests(
      `session:${sessionFile}`,
      new FffRuntime(dir, {
        projectRoot: dir,
        finder: createMockFinder({
          fileSearch(query): Result<SearchResult> {
            assert.equal(query, "readme notes");
            return ok({
              items: [
                {
                  path: target,
                  relativePath: "docs/notes.md",
                  fileName: "notes.md",
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
      "call-fff-find-files",
      { pattern: "readme notes", path: ".", limit: 10, offset: 0 },
      undefined,
      undefined,
      {
        cwd: dir,
        sessionManager: {
          getSessionFile() {
            return sessionFile;
          },
        },
      },
    );

    assert.match(JSON.stringify(result), new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(result.details.count, 1);
  });
});

test("findContentMatches excludes .git and sorts by most recent modification time", async () => {
  await withTempDir(async (dir) => {
    const alpha = path.join(dir, "alpha.ts");
    const beta = path.join(dir, "nested", "beta.ts");
    const ignored = path.join(dir, ".git", "ignored.ts");

    await mkdir(path.dirname(beta), { recursive: true });
    await mkdir(path.dirname(ignored), { recursive: true });
    await writeFile(alpha, "const token = 'needle'\n");
    await writeFile(beta, "const token = 'needle'\n");
    await writeFile(ignored, "const token = 'needle'\n");

    const older = new Date("2024-01-03T00:00:00.000Z");
    const newer = new Date("2024-01-04T00:00:00.000Z");
    await utimes(alpha, older, older);
    await utimes(beta, newer, newer);

    const result = await findContentMatches(dir, "needle");
    assert.deepEqual(
      result.matches.map((entry) => entry.absolutePath),
      [beta, alpha],
    );
  });
});

test("grep_files reports invalid regex errors clearly", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerGrepFilesTool, "grep_files");
    await writeFile(path.join(dir, "alpha.ts"), "const token = 'needle'\n");

    await assert.rejects(
      tool.execute("call-3", { pattern: "(", path: dir }, undefined, undefined, { cwd: dir }),
      /invalid regex:/i,
    );
  });
});

test("find_files keeps explicit glob searches on the legacy backend", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerFindFilesTool, "find_files");
    const target = path.join(dir, "alpha.ts");
    await writeFile(target, "export const alpha = true;\n");

    const result = await tool.execute(
      "call-legacy-find-files",
      { pattern: "*.ts", path: dir, limit: 10, offset: 0 },
      undefined,
      undefined,
      { cwd: dir },
    );

    assert.match(JSON.stringify(result), /alpha\.ts/);
    assert.equal(result.details.count, 1);
  });
});

test("grep_files keeps file-list output semantics while using FFF-backed matching", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerGrepFilesTool, "grep_files");
    const target = path.join(dir, "src", "needle.ts");
    const sessionFile = path.join(dir, "grep-files.session.json");

    setSessionFffRuntimeForTests(
      `session:${sessionFile}`,
      new FffRuntime(dir, {
        projectRoot: dir,
        finder: createMockFinder({
          grep(query): any {
            assert.equal(query, "needle");
            return ok({
              items: [
                {
                  path: target,
                  relativePath: "src/needle.ts",
                  fileName: "needle.ts",
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

    const result = await tool.execute(
      "call-fff-grep-files",
      { pattern: "needle", path: dir, limit: 10 },
      undefined,
      undefined,
      {
        cwd: dir,
        sessionManager: {
          getSessionFile() {
            return sessionFile;
          },
        },
      },
    );

    assert.match(JSON.stringify(result), /matching file/);
    assert.match(JSON.stringify(result), /needle\.ts/);
    assert.equal(result.details.count, 1);
  });
});

test("find_files uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerFindFilesTool, "find_files");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ pattern: "*.ts", path: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Search *.ts in src",
  ]);

  const collapsed = tool.renderResult(
    { details: { count: 2 }, content: [{ type: "text", text: "2 matching files\nsrc/a.ts\nsrc/b.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Search *.ts in src",
  ]);
});

test("list_dir uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerListDirTool, "list_dir");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ dir_path: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["List src"]);

  const collapsed = tool.renderResult(
    { details: { count: 5 }, content: [{ type: "text", text: "Absolute path: src\n1. [file] a.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), ["List src"]);
});

test("grep_files uses a self-rendered shell and hides collapsed result", () => {
  const tool = getRegisteredTool(registerGrepFilesTool, "grep_files");
  const state: Record<string, unknown> = {};

  const call = tool.renderCall({ pattern: "needle", path: "src" }, theme, {
    state,
    lastComponent: undefined,
  } as never);

  assert.equal(tool.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Grep needle in src",
  ]);

  const collapsed = tool.renderResult(
    { details: { count: 3 }, content: [{ type: "text", text: "3 matching files\nsrc/a.ts" }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined } as never,
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Grep needle in src",
  ]);
});
