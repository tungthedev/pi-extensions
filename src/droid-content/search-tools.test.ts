import type { FileFinder, Result, SearchResult } from "@ff-labs/fff-node";

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  resetSessionFffRuntimesForTests,
  setSessionFffRuntimeForTests,
} from "../fff/session-runtime.ts";
import { FffRuntime } from "../shared/fff/runtime.ts";
import { registerDroidGlobTool } from "./tools/glob.ts";
import { registerDroidGrepTool } from "./tools/grep.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "droid-search-tools-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

function getRegisteredTool(register: (pi: any) => void, name: string) {
  let tool: any;

  register({
    registerTool(definition: any) {
      if (definition.name === name) {
        tool = definition;
      }
    },
  });

  assert.ok(tool, `expected tool ${name} to be registered`);
  return tool;
}

test.afterEach(() => {
  resetSessionFffRuntimesForTests();
});

test("Grep content mode preserves Droid shape while using FFF-first content search", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerDroidGrepTool, "Grep");
    const target = path.join(dir, "src", "needle.ts");
    const sessionFile = path.join(dir, "grep-content.session.json");

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
      "call-droid-grep-content",
      { pattern: "needle", path: dir, output_mode: "content" },
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

    assert.match(JSON.stringify(result), /needle/);
    assert.equal(result.details.outputMode, "content");
    assert.equal(result.details.matchCount, 1);
    assert.equal(result.details.fileCount, 1);
  });
});

test("Grep file_paths mode stays compatible while using FFF-backed matching", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerDroidGrepTool, "Grep");
    const target = path.join(dir, "src", "match.ts");
    const sessionFile = path.join(dir, "grep-files.session.json");

    setSessionFffRuntimeForTests(
      `session:${sessionFile}`,
      new FffRuntime(dir, {
        projectRoot: dir,
        finder: createMockFinder({
          grep(query): any {
            assert.equal(query, "matchme");
            return ok({
              items: [
                {
                  path: target,
                  relativePath: "src/match.ts",
                  fileName: "match.ts",
                  gitStatus: "clean",
                  size: 1,
                  modified: 0,
                  isBinary: false,
                  totalFrecencyScore: 0,
                  accessFrecencyScore: 0,
                  modificationFrecencyScore: 0,
                  lineNumber: 1,
                  col: 0,
                  byteOffset: 0,
                  lineContent: "matchme",
                  matchRanges: [[0, 7]],
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
      "call-droid-grep-files",
      { pattern: "matchme", path: dir, output_mode: "file_paths" },
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
    assert.match(JSON.stringify(result), /match\.ts/);
    assert.equal(result.details.count, 1);
  });
});

test("Glob uses FFF-first ranked discovery for fuzzy path requests", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerDroidGlobTool, "Glob");
    const target = path.join(dir, "src", "components", "button.tsx");
    const sessionFile = path.join(dir, "glob-fff.session.json");

    setSessionFffRuntimeForTests(
      `session:${sessionFile}`,
      new FffRuntime(dir, {
        projectRoot: dir,
        finder: createMockFinder({
          fileSearch(query): Result<SearchResult> {
            assert.equal(query, "component button");
            return ok({
              items: [
                {
                  path: target,
                  relativePath: "src/components/button.tsx",
                  fileName: "button.tsx",
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
      "call-droid-glob-fff",
      { patterns: "component button", folder: dir },
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

    assert.match(JSON.stringify(result), /button\.tsx/);
    assert.equal(result.details.count, 1);
  });
});

test("Glob falls back to legacy glob and exclusion semantics for strict requests", async () => {
  await withTempDir(async (dir) => {
    const tool = getRegisteredTool(registerDroidGlobTool, "Glob");
    const kept = path.join(dir, "src", "keep.ts");
    const ignored = path.join(dir, "ignored", "skip.ts");
    await mkdir(path.dirname(kept), { recursive: true });
    await mkdir(path.dirname(ignored), { recursive: true });
    await writeFile(kept, "export const keep = true;\n");
    await writeFile(ignored, "export const skip = true;\n");

    const result = await tool.execute(
      "call-droid-glob-legacy",
      { patterns: "*.ts", excludePatterns: "ignored/**", folder: dir },
      undefined,
      undefined,
      { cwd: dir },
    );

    assert.match(JSON.stringify(result), /keep\.ts/);
    assert.doesNotMatch(JSON.stringify(result), /skip\.ts/);
    assert.equal(result.details.count, 1);
  });
});
