import assert from "node:assert/strict";
import test from "node:test";

import { composeCustomPromptWithPiSections } from "../shared/custom-prompt.ts";
import {
  handleDroidSystemPromptBeforeAgentStart,
  type DroidSystemPromptDeps,
} from "./system-prompt.ts";

const PI_PROMPT_BASE = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Be concise in your responses
- Show file paths clearly when working with files

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /tmp/README.md
- Additional docs: /tmp/docs
- Examples: /tmp/examples (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

function buildExpectedCustomPrompt(prompt: string, cwd: string): string {
  return composeCustomPromptWithPiSections(
    buildPiPromptWithSuffix(cwd),
    prompt,
  )!;
}

function buildPiPromptWithSuffix(cwd: string): string {
  return `${PI_PROMPT_BASE}\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\nCurrent date: 2026-04-20\nCurrent working directory: ${cwd}`;
}

function createContext(
  toolSet: "pi" | "codex" | "droid",
  modelId = "gpt-5.4",
  cwd = "/tmp/project",
) {
  return {
    cwd,
    model: { id: modelId },
    sessionManager: {
      getCwd() {
        return cwd;
      },
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  };
}

test("handleDroidSystemPromptBeforeAgentStart returns no-op when Droid prompt is not selected", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("pi") as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleDroidSystemPromptBeforeAgentStart defers to SYSTEM.md when enabled and present", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-system-md-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: PI_PROMPT_BASE } as never,
    createContext("droid", "gpt-5.4", tempDir) as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleDroidSystemPromptBeforeAgentStart falls back to Droid customPrompt semantics when SYSTEM.md is enabled but missing", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-no-system-md-"));
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix(tempDir) } as never,
    createContext("droid", "gpt-5.4", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Droid block", tempDir),
  });
});

test("handleDroidSystemPromptBeforeAgentStart uses Droid customPrompt semantics when SYSTEM.md injection is disabled", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-system-md-disabled-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix(tempDir) } as never,
    createContext("droid", "gpt-5.4", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Droid block", tempDir),
  });
});

test("handleDroidSystemPromptBeforeAgentStart applies Droid customPrompt semantics when SYSTEM.md is not configured", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix("/tmp/project") } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Droid block", "/tmp/project"),
  });
});

test("handleDroidSystemPromptBeforeAgentStart applies the active Droid prompt with Pi suffix sections", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix("/tmp/project") } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Droid block", "/tmp/project"),
  });
});
