import assert from "node:assert/strict";
import test from "node:test";

import { setSystemMdPromptEnabledForTests } from "../system-md/state.ts";
import {
  buildSelectedDroidPrompt,
  handleDroidSystemPromptBeforeAgentStart,
  registerDroidSystemPrompt,
  type DroidSystemPromptDeps,
} from "./system-prompt.ts";

function createContext(toolSet: "pi" | "codex" | "forge" | "droid", modelId = "gpt-5.4") {
  return {
    model: { id: modelId },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  };
}

test("buildSelectedDroidPrompt includes exact extracted Droid base prompt text", () => {
  const prompt = buildSelectedDroidPrompt("gpt-5.4");

  assert.match(prompt, /^You are Droid, an AI software engineering agent built by Factory\./m);
  assert.match(prompt, /When you need clarification from the user, ALWAYS use the AskUser tool/);
  assert.match(prompt, /Do exactly what the user asks, no more, no less/);
});

test("buildSelectedDroidPrompt adds OpenAI-specific prompt blocks for GPT models", () => {
  const prompt = buildSelectedDroidPrompt("gpt-5.4");

  assert.match(prompt, /<markdown_spec>/);
  assert.match(prompt, /<solution_persistence>/);
});

test("buildSelectedDroidPrompt adds Google-specific prompt blocks for Gemini models", () => {
  const prompt = buildSelectedDroidPrompt("gemini-2.5-flash");

  assert.match(prompt, /riskLevelReason and riskLevel/);
  assert.match(prompt, /<tool_usage_rules>/);
  assert.match(prompt, /<spec_mode_guidelines>/);
  assert.match(prompt, /<todo_tool_guidelines>/);
});

test("handleDroidSystemPromptBeforeAgentStart returns no-op when Droid prompt is not selected", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      systemMdPrompt: true,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("forge") as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleDroidSystemPromptBeforeAgentStart returns no-op when system-md is enabled", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: true,
    }),
    buildPromptForModel: () => "Droid block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleDroidSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      createContext("droid") as never,
      deps,
    );

    assert.equal(result, undefined);
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleDroidSystemPromptBeforeAgentStart still replaces when system-md is loaded but disabled in settings", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleDroidSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      createContext("droid") as never,
      deps,
    );

    assert.deepEqual(result, { systemPrompt: "Droid block" });
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleDroidSystemPromptBeforeAgentStart replaces the active system prompt", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: true,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Droid block" });
});

test("registerDroidSystemPrompt registers before_agent_start", () => {
  let eventName: string | undefined;

  registerDroidSystemPrompt({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(eventName, "before_agent_start");
});
