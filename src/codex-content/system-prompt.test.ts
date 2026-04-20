import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { composeCustomPromptWithPiSections } from "../shared/custom-prompt.ts";
import {
  buildCodexPrompt,
  handleCodexSystemPromptBeforeAgentStart,
  resolveCodexPromptBody,
  type CodexSystemPromptDeps,
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
  return `${PI_PROMPT_BASE}\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\n<available_skills>\n- skill\n</available_skills>\nCurrent date: 2026-04-20\nCurrent working directory: ${cwd}`;
}

function createContext(toolSet: "pi" | "codex", cwd = "/tmp/project") {
  return {
    cwd,
    model: { id: "gpt-5.4" },
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

test("resolveCodexPromptBody uses exact model match and GPT fallback", () => {
  const exact = resolveCodexPromptBody("claude-sonnet", [
    { models: [{ slug: "gpt-5.4", base_instructions: "gpt fallback" }] },
    { models: [{ slug: "claude-sonnet", base_instructions: "exact" }] },
  ]);
  const fallback = resolveCodexPromptBody("claude-sonnet", [
    { models: [{ slug: "gpt-5.4", base_instructions: "gpt fallback" }] },
  ]);

  assert.equal(exact, "exact");
  assert.equal(fallback, "gpt fallback");
});

test("buildCodexPrompt rewrites short-label file reference guidance for Pi rendering", () => {
  const prompt =
    buildCodexPrompt(`File References: When referencing files in your response follow the below rules:
  * Use markdown links (not inline code) for clickable files.
  * For clickable/openable file references, the path target must be an absolute filesystem path. Labels may be short (for example, [app.ts](/abs/path/app.ts)).`);

  assert.ok(prompt.includes("Do not use short labels like [app.ts](/abs/path/app.ts)."));
  assert.ok(
    prompt.includes(
      "Use the same absolute filesystem path for both the label and target (for example, [/abs/path/app.ts](/abs/path/app.ts)).",
    ),
  );
  assert.ok(!prompt.includes("Labels may be short"));
});

test("handleCodexSystemPromptBeforeAgentStart returns no-op when Codex prompt is not selected", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("pi") as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleCodexSystemPromptBeforeAgentStart defers to SYSTEM.md when enabled and present", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-system-md-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: PI_PROMPT_BASE } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleCodexSystemPromptBeforeAgentStart falls back to Codex customPrompt semantics when SYSTEM.md is enabled but missing", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-no-system-md-"));
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix(tempDir) } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Codex block", tempDir),
  });
});

test("handleCodexSystemPromptBeforeAgentStart uses Codex customPrompt semantics when SYSTEM.md injection is disabled", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-system-md-disabled-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix(tempDir) } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Codex block", tempDir),
  });
});

test("handleCodexSystemPromptBeforeAgentStart applies Codex customPrompt semantics when SYSTEM.md is not configured", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix("/tmp/project") } as never,
    createContext("codex") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Codex block", "/tmp/project"),
  });
});

test("handleCodexSystemPromptBeforeAgentStart applies the selected Codex prompt with Pi suffix sections", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: buildPiPromptWithSuffix("/tmp/project") } as never,
    createContext("codex") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedCustomPrompt("Codex block", "/tmp/project"),
  });
});

test("composeCustomPromptWithPiSections preserves Pi-added sections after swapping the prompt body", () => {
  const basePrompt = `${PI_PROMPT_BASE}\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\n<available_skills>\n- skill\n</available_skills>\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project`;

  assert.equal(
    composeCustomPromptWithPiSections(basePrompt, "Custom body"),
    `Custom body\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /tmp/AGENTS.md\n\nRules\n\n<available_skills>\n- skill\n</available_skills>\nCurrent date: 2026-04-20\nCurrent working directory: /tmp/project`,
  );
});
