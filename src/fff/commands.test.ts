import type { FileFinder, Result } from "@ff-labs/fff-node";

import assert from "node:assert/strict";
import test from "node:test";

import { FffRuntime } from "../shared/fff/runtime.ts";
import { registerFffCommands } from "./commands.ts";
import {
  resetSessionFffRuntimesForTests,
  setSessionFffRuntimeForTests,
} from "./session-runtime.ts";

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
        git: { available: true, repositoryFound: true, libgit2Version: "test" },
        filePicker: { initialized: true, indexedFiles: 42, basePath: "/repo" },
        frecency: { initialized: true },
        queryTracker: { initialized: true },
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

test("registerFffCommands registers /fff-status and /fff-reindex", () => {
  const commands = new Map<string, { description?: string; handler: Function }>();

  registerFffCommands({
    registerCommand(name: string, options: { description?: string; handler: Function }) {
      commands.set(name, options);
    },
    registerMessageRenderer() {},
    sendMessage() {},
  } as never);

  assert.equal(commands.has("fff-status"), true);
  assert.equal(commands.has("fff-reindex"), true);
});

test("/fff-status reports the current session runtime status", async () => {
  const commands = new Map<string, { handler: Function }>();
  const messages: Array<{ customType?: string; details?: unknown }> = [];
  const notifications: string[] = [];
  const cwd = process.cwd();
  const sessionFile = `${cwd}/.tmp-fff-status-session.json`;

  setSessionFffRuntimeForTests(
    `session:${sessionFile}`,
    new FffRuntime(cwd, {
      projectRoot: cwd,
      finder: createMockFinder({
        getScanProgress() {
          return ok({ scannedFilesCount: 42, isScanning: true });
        },
      }),
    }),
  );

  registerFffCommands({
    registerCommand(name: string, options: { handler: Function }) {
      commands.set(name, options);
    },
    registerMessageRenderer() {},
    sendMessage(message: { customType?: string; details?: unknown }) {
      messages.push(message);
    },
  } as never);

  await commands.get("fff-status")!.handler("", {
    cwd,
    hasUI: true,
    sessionManager: {
      getSessionFile() {
        return sessionFile;
      },
    },
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
  });

  assert.match(notifications[0] ?? "", /FFF Status/);
  assert.match(JSON.stringify(messages[0]?.details), /indexed files: 42/);
  assert.match(JSON.stringify(messages[0]?.details), /state: indexing/);
});

test("/fff-reindex triggers a scan and reports the refreshed status", async () => {
  const commands = new Map<string, { handler: Function }>();
  const messages: Array<{ customType?: string; details?: unknown }> = [];
  const cwd = process.cwd();
  const sessionFile = `${cwd}/.tmp-fff-reindex-session.json`;
  let scanCalls = 0;

  setSessionFffRuntimeForTests(
    `session:${sessionFile}`,
    new FffRuntime(cwd, {
      projectRoot: cwd,
      finder: createMockFinder({
        scanFiles() {
          scanCalls += 1;
          return ok(undefined);
        },
      }),
    }),
  );

  registerFffCommands({
    registerCommand(name: string, options: { handler: Function }) {
      commands.set(name, options);
    },
    registerMessageRenderer() {},
    sendMessage(message: { customType?: string; details?: unknown }) {
      messages.push(message);
    },
  } as never);

  await commands.get("fff-reindex")!.handler("", {
    cwd,
    hasUI: false,
    sessionManager: {
      getSessionFile() {
        return sessionFile;
      },
    },
    ui: {
      notify() {},
    },
  });

  assert.equal(scanCalls, 1);
  assert.match(JSON.stringify(messages[0]?.details), /FFF Reindex/);
  assert.match(JSON.stringify(messages[0]?.details), /Reindex requested/);
});
