import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCodexPrompt,
  handleCodexSystemPromptBeforeAgentStart,
  resolveCodexPromptBody,
  type CodexSystemPromptDeps,
} from "./system-prompt.ts";

function buildExpectedReplacement(prompt: string, cwd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prompt}\n\nCurrent date: ${today}\nCurrent working directory: ${cwd}`;
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
      systemMdPrompt: true,
      includePiPromptSection: false,
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
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "System MD prompt" });
});

test("handleCodexSystemPromptBeforeAgentStart still replaces when SYSTEM.md is enabled but missing", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-no-system-md-"));
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedReplacement("Codex block", tempDir),
  });
});

test("handleCodexSystemPromptBeforeAgentStart uses the Codex prompt when SYSTEM.md injection is disabled", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-system-md-disabled-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: false,
      includePiPromptSection: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex", tempDir) as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedReplacement("Codex block", tempDir),
  });
});

test("handleCodexSystemPromptBeforeAgentStart still replaces when SYSTEM.md is not configured", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: false,
      includePiPromptSection: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedReplacement("Codex block", "/tmp/project"),
  });
});

test("handleCodexSystemPromptBeforeAgentStart replaces the selected Codex prompt", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex") as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: buildExpectedReplacement("Codex block", "/tmp/project"),
  });
});

test("handleCodexSystemPromptBeforeAgentStart appends the Codex prompt after the Pi prompt when enabled", async () => {
  const deps: CodexSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: false,
      includePiPromptSection: true,
      webTools: {},
    }),
    buildPromptForModel: () => "Codex block",
  };

  const result = await handleCodexSystemPromptBeforeAgentStart(
    { systemPrompt: "Pi base" } as never,
    createContext("codex") as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Pi base\n\nCodex block" });
});
