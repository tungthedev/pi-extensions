import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  handleSystemMdBeforeAgentStart,
  resolveSystemMdPath,
  type SystemMdPromptDeps,
} from "./index.ts";

test("resolveSystemMdPath prefers the git root when available", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await mkdir(path.join(rootDir, ".git"));
  await mkdir(path.join(rootDir, "nested", "deeper"), { recursive: true });

  assert.equal(
    resolveSystemMdPath(path.join(rootDir, "nested", "deeper")),
    path.join(rootDir, "SYSTEM.md"),
  );
});

test("handleSystemMdBeforeAgentStart returns no-op when SYSTEM.md is missing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleSystemMdBeforeAgentStart applies SYSTEM.md using customPrompt semantics", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await writeFile(path.join(rootDir, "SYSTEM.md"), "Root prompt\n");
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    {
      systemPrompt:
        "You are an expert coding assistant operating inside pi, a coding agent harness.\n\nPi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):\n- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project",
    } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt:
      "Root prompt\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project",
  });
});

test("handleSystemMdBeforeAgentStart returns no-op when system-md prompt is disabled", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await writeFile(path.join(rootDir, "SYSTEM.md"), "Root prompt\n");
  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { cwd: rootDir } as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleSystemMdBeforeAgentStart prefers structured prompt cwd over context cwd", async () => {
  const structuredRoot = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  const unrelatedRoot = await mkdtemp(path.join(os.tmpdir(), "pi-system-md-"));
  await writeFile(path.join(structuredRoot, "SYSTEM.md"), "Structured prompt\n");

  const deps: SystemMdPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
  };

  const result = await handleSystemMdBeforeAgentStart(
    {
      systemPrompt:
        "You are an expert coding assistant operating inside pi, a coding agent harness.\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project",
      systemPromptOptions: {
        cwd: structuredRoot,
      },
    } as never,
    { cwd: unrelatedRoot } as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt:
      "Structured prompt\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project",
  });
});
