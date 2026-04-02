import assert from "node:assert/strict";
import test from "node:test";

import { buildForgePrompt } from "./build-system-prompt.ts";

test("buildForgePrompt appends forge prompt and runtime context after the base prompt", () => {
  const prompt = buildForgePrompt({
    baseSystemPrompt: "Base Pi prompt",
    cwd: "/tmp/project",
    activeTools: [{ name: "shell", description: "Runs shell commands." }],
    shell: "/bin/zsh",
    homeDir: "/Users/tester",
    currentDate: "2026-04-02",
  });

  assert.match(prompt, /^Base Pi prompt/);
  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.match(prompt, /<forge_runtime>/);
  assert.doesNotMatch(prompt, /Mode-specific behavior\./);
  assert.doesNotMatch(prompt, /<operating_mode>/);
  assert.match(prompt, /- shell: Runs shell commands\./);
});

test("buildForgePrompt still renders forge prompt when no base system prompt is provided", () => {
  const prompt = buildForgePrompt({
    cwd: "/tmp/project",
    activeTools: [],
    currentDate: "2026-04-02",
  });

  assert.doesNotMatch(prompt, /^\s*$/);
  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.doesNotMatch(prompt, /<operating_mode>/);
  assert.match(prompt, /<forge_active_tools>\n- none\n<\/forge_active_tools>/);
});
