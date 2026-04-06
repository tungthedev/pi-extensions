import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import registerSystemMdExtension, {
  handleSystemMdBeforeAgentStart,
  readSystemMdPrompt,
  registerSystemMdPrompt,
  resolveSystemMdPath,
  type SystemMdPromptDeps,
} from "./index.ts";
import { isSystemMdPromptEnabled, setSystemMdPromptEnabledForTests } from "./state.ts";

test("resolveSystemMdPath prefers the git root when available", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await mkdir(path.join(rootDir, ".git"));
  await mkdir(path.join(rootDir, "nested", "deeper"), { recursive: true });

  assert.equal(
    resolveSystemMdPath(path.join(rootDir, "nested", "deeper")),
    path.join(rootDir, "SYSTEM.md"),
  );
});

test("readSystemMdPrompt returns trimmed root SYSTEM.md contents", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await mkdir(path.join(rootDir, ".git"));
  await mkdir(path.join(rootDir, "nested"));
  await writeFile(path.join(rootDir, "SYSTEM.md"), "  Project system prompt\n\n");

  assert.equal(readSystemMdPrompt(path.join(rootDir, "nested")), "Project system prompt");
});

test("handleSystemMdBeforeAgentStart returns no-op when SYSTEM.md is missing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleSystemMdBeforeAgentStart replaces the system prompt with root SYSTEM.md", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await writeFile(path.join(rootDir, "SYSTEM.md"), "Root prompt\n");
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Root prompt" });
});

test("handleSystemMdBeforeAgentStart returns no-op when system-md prompt is disabled", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await writeFile(path.join(rootDir, "SYSTEM.md"), "Root prompt\n");
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: false,
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("registerSystemMdPrompt marks system-md as enabled and registers before_agent_start", () => {
  let eventName: string | undefined;
  setSystemMdPromptEnabledForTests(false);

  registerSystemMdPrompt({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(isSystemMdPromptEnabled(), true);
  assert.equal(eventName, "before_agent_start");
  setSystemMdPromptEnabledForTests(false);
});

test("default system-md extension registers before_agent_start", () => {
  let eventName: string | undefined;
  setSystemMdPromptEnabledForTests(false);

  registerSystemMdExtension({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(eventName, "before_agent_start");
  setSystemMdPromptEnabledForTests(false);
});
