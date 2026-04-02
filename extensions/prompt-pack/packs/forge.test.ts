import assert from "node:assert/strict";
import test from "node:test";

import { createForgeRuntimeState, setForgeRuntimeMode } from "../../forge-content/runtime-state.ts";

import { buildSelectedForgePrompt } from "./forge.ts";

test("buildSelectedForgePrompt includes Forge instructions and the live mode", () => {
  const state = createForgeRuntimeState();
  setForgeRuntimeMode(state, "muse");

  const prompt = buildSelectedForgePrompt(
    {
      getActiveTools: () => ["shell"],
      getAllTools: () => [{ name: "shell", description: "Executes shell commands." }],
    } as never,
    {
      cwd: "/tmp/project",
    } as never,
    state,
  );

  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.match(prompt, /<operating_mode>muse<\/operating_mode>/);
  assert.match(prompt, /- shell: Executes shell commands\./);
});
