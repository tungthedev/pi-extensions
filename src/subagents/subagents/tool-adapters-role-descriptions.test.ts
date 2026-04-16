import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { registerCodexToolAdapters } from "./tool-adapters-codex.ts";
import { registerTaskToolAdapters } from "./tool-adapters-task.ts";

function withTempHome(testBody: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-tool-descriptions-"));
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

function writeRole(filePath: string, contents: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function createLifecycleMock() {
  return {
    spawn: async () => ({ completedAgent: undefined, name: "child" }),
    resumeByName: async () => ({ submissionId: "submission", commandType: "follow_up", snapshot: {} }),
    waitAny: async () => ({ snapshots: [], timedOut: false }),
    waitByNames: async () => ({ snapshots: [], timedOut: false }),
    getSnapshotByName: () => ({ snapshot: {} }),
    stopByName: async () => ({ snapshot: {} }),
  } as never;
}

test("tool-facing role descriptions refresh when cwd changes", async () => {
  await withTempHome((homeRoot) => {
    const cwdA = path.join(homeRoot, "workspace", "project-a", "nested");
    const cwdB = path.join(homeRoot, "workspace", "project-b", "nested");
    mkdirSync(cwdA, { recursive: true });
    mkdirSync(cwdB, { recursive: true });

    writeRole(
      path.join(homeRoot, "workspace", "project-a", ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Delegate from project A\n---\n\nPrompt A\n`,
    );
    writeRole(
      path.join(homeRoot, "workspace", "project-b", ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Delegate from project B\n---\n\nPrompt B\n`,
    );

    const registeredTools = new Map<string, Record<string, unknown>>();
    const pi = {
      registerTool(def: Record<string, unknown>) {
        registeredTools.set(String(def.name), def);
      },
    } as never;

    const taskHandle = registerTaskToolAdapters(pi, {
      lifecycle: createLifecycleMock(),
      normalizeWaitAgentTimeoutMs: (value) => value ?? 45_000,
    });
    const codexHandle = registerCodexToolAdapters(pi, {
      lifecycle: createLifecycleMock(),
      renderSpawnPromptPreview: () => ({}) as never,
      normalizeWaitAgentTimeoutMs: (value) => value ?? 45_000,
    });

    const taskTool = registeredTools.get("Task");
    const spawnTool = registeredTools.get("spawn_agent");
    assert.ok(taskTool);
    assert.ok(spawnTool);

    taskHandle.refreshRoleDescriptions(cwdA);
    codexHandle.refreshRoleDescriptions(cwdA);
    const taskDescriptionA = (taskTool.parameters as any).properties.subagent_type.description as string;
    const spawnDescriptionA = String(spawnTool.description ?? "");

    taskHandle.refreshRoleDescriptions(cwdB);
    codexHandle.refreshRoleDescriptions(cwdB);
    const taskDescriptionB = (taskTool.parameters as any).properties.subagent_type.description as string;
    const spawnDescriptionB = String(spawnTool.description ?? "");

    assert.match(taskDescriptionA, /Delegate from project A/);
    assert.doesNotMatch(taskDescriptionA, /Delegate from project B/);
    assert.match(taskDescriptionB, /Delegate from project B/);
    assert.doesNotMatch(taskDescriptionB, /Delegate from project A/);

    assert.match(spawnDescriptionA, /Delegate from project A/);
    assert.doesNotMatch(spawnDescriptionA, /Delegate from project B/);
    assert.match(spawnDescriptionB, /Delegate from project B/);
    assert.doesNotMatch(spawnDescriptionB, /Delegate from project A/);
  });
});
