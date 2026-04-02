import assert from "node:assert/strict";
import test from "node:test";

import { buildSelectedForgePrompt } from "./forge.ts";

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
  assert.doesNotMatch(prompt, /modeInstructions|muse|sage/);
  assert.match(prompt, /- shell: Executes shell commands\./);
});
