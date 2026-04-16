import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { registerSubagentSessionEvents } from "./session-events.ts";
import { clearLegacyRoleWarningsForTests } from "./legacy-role-warnings.ts";

function withTempHome(testBody: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-session-events-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  const finish = () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(root, { recursive: true, force: true });
  };

  return Promise.resolve()
    .then(() => testBody(root))
    .finally(finish);
}

function captureSessionHandlers() {
  const handlers = new Map<string, Function>();
  registerSubagentSessionEvents(
    {
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    } as never,
    {
      store: {
        setActiveSessionFile() {},
        clearActivities() {},
        mountActivityWidget() {},
        setParentIsStreaming() {},
      } as never,
      closeAllLiveAttachments: async () => undefined,
      reconstructDurableRegistry() {},
    },
  );
  return handlers;
}

test("session_start surfaces legacy role warnings even without opening the manager", async () => {
  await withTempHome(async (homeRoot) => {
    clearLegacyRoleWarningsForTests();
    const handlers = captureSessionHandlers();
    const notifications: string[] = [];
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(path.join(cwd, ".codex", "agents"), { recursive: true });
    writeFileSync(path.join(cwd, ".codex", "config.toml"), "[agents.reviewer]\n");
    writeFileSync(path.join(cwd, ".codex", "agents", "reviewer.toml"), 'name = "reviewer"\n');

    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    await sessionStart!(
      {},
      {
        cwd,
        ui: {
          notify(message: string) {
            notifications.push(message);
          },
        },
        sessionManager: {
          getSessionFile: () => "/tmp/session-a.jsonl",
          getEntries: () => [],
        },
      },
    );

    assert.equal(notifications.length > 0, true);
    assert.match(notifications.join("\n"), /legacy Codex\/TOML subagent roles were detected/i);
  });
});

test("legacy warnings re-surface for a different session instead of being process-global one-shot", async () => {
  await withTempHome(async (homeRoot) => {
    clearLegacyRoleWarningsForTests();
    const handlers = captureSessionHandlers();
    const notifications: string[] = [];
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(path.join(cwd, ".codex", "agents"), { recursive: true });
    writeFileSync(path.join(cwd, ".codex", "config.toml"), "[agents.reviewer]\n");
    writeFileSync(path.join(cwd, ".codex", "agents", "reviewer.toml"), 'name = "reviewer"\n');

    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    await sessionStart!(
      {},
      {
        cwd,
        ui: { notify(message: string) { notifications.push(`a:${message}`); } },
        sessionManager: { getSessionFile: () => "/tmp/session-a.jsonl", getEntries: () => [] },
      },
    );
    await sessionStart!(
      {},
      {
        cwd,
        ui: { notify(message: string) { notifications.push(`b:${message}`); } },
        sessionManager: { getSessionFile: () => "/tmp/session-b.jsonl", getEntries: () => [] },
      },
    );

    assert.equal(notifications.some((message) => message.startsWith("a:")), true);
    assert.equal(notifications.some((message) => message.startsWith("b:")), true);
  });
});
