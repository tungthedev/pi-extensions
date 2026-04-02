import assert from "node:assert/strict";
import test from "node:test";

import promptPackExtension, {
  handlePromptPackBeforeAgentStart,
  injectSelectedPromptPack,
  resolvePromptPack,
  type PromptPackDeps,
} from "./index.ts";

test("resolvePromptPack returns null for missing or invalid settings", () => {
  assert.equal(resolvePromptPack({ systemPrompt: null }), null);
  assert.equal(resolvePromptPack({ systemPrompt: "codex" }), "codex");
});

test("injectSelectedPromptPack appends Forge prompt to the base prompt", () => {
  const result = injectSelectedPromptPack({
    baseSystemPrompt: "Base",
    selectedPack: "forge",
    forgePrompt: "Forge block",
  });

  assert.match(result, /^Base\n\nForge block/m);
});

test("handlePromptPackBeforeAgentStart returns no-op for null settings", async () => {
  const deps: PromptPackDeps = {
    readSettings: async () => ({ systemPrompt: null }),
    buildCodexPromptForModel: () => "",
    buildForgePromptForContext: () => "",
  };

  const result = await handlePromptPackBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { model: { id: "gpt-5.4" } } as never,
    {} as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handlePromptPackBeforeAgentStart injects the Codex prompt for codex selection", async () => {
  const deps: PromptPackDeps = {
    readSettings: async () => ({ systemPrompt: "codex" }),
    buildCodexPromptForModel: () => "Codex block",
    buildForgePromptForContext: () => "Forge block",
  };

  const result = await handlePromptPackBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { model: { id: "gpt-5.4" } } as never,
    {} as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Base\n\nCodex block" });
});

test("handlePromptPackBeforeAgentStart injects the Forge prompt for forge selection", async () => {
  const deps: PromptPackDeps = {
    readSettings: async () => ({ systemPrompt: "forge" }),
    buildCodexPromptForModel: () => "Codex block",
    buildForgePromptForContext: () => "Forge block",
  };

  const result = await handlePromptPackBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    { model: { id: "gpt-5.4" } } as never,
    {} as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Base\n\nForge block" });
});

test("prompt-pack extension registers before_agent_start", () => {
  let eventName: string | undefined;

  promptPackExtension({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(eventName, "before_agent_start");
});
