import assert from "node:assert/strict";
import test from "node:test";

import { setSystemMdPromptEnabledForTests } from "../system-md/state.ts";
import {
  buildSelectedForgePrompt,
  handleForgeSystemPromptBeforeAgentStart,
  injectForgePrompt,
  registerForgeSystemPrompt,
  type ForgeSystemPromptDeps,
} from "./system-prompt.ts";

test("buildSelectedForgePrompt does not include inner mode markup", () => {
  const prompt = buildSelectedForgePrompt(
    {
      getActiveTools: () => ["shell"],
      getAllTools: () => [{ name: "shell", description: "Executes shell commands." }],
    } as never,
    {
      cwd: "/tmp/project",
    } as never,
  );

  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.doesNotMatch(prompt, /<operating_mode>/);
  assert.doesNotMatch(prompt, /modeInstructions|\bmuse\b|\bsage\b/);
});

test("injectForgePrompt appends the Forge prompt to the base prompt", () => {
  assert.equal(injectForgePrompt("Base", "Forge block"), "Base\n\nForge block");
});

test("handleForgeSystemPromptBeforeAgentStart returns no-op when Forge prompt is not selected", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  const result = await handleForgeSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { model: { id: "gpt-5.4" } } as never,
    {} as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleForgeSystemPromptBeforeAgentStart returns no-op when system-md is enabled", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleForgeSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      { model: { id: "gpt-5.4" } } as never,
      {} as never,
      deps,
    );

    assert.equal(result, undefined);
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleForgeSystemPromptBeforeAgentStart still injects when system-md is loaded but disabled in settings", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      customShellTool: true,
      systemMdPrompt: false,
    }),
    buildPromptForContext: () => "Forge block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleForgeSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      { model: { id: "gpt-5.4" } } as never,
      {} as never,
      deps,
    );

    assert.deepEqual(result, { systemPrompt: "Base\n\nForge block" });
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleForgeSystemPromptBeforeAgentStart injects the selected Forge prompt", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  const result = await handleForgeSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { model: { id: "gpt-5.4" } } as never,
    {} as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Base\n\nForge block" });
});

test("registerForgeSystemPrompt registers before_agent_start", () => {
  let eventName: string | undefined;

  registerForgeSystemPrompt({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(eventName, "before_agent_start");
});
