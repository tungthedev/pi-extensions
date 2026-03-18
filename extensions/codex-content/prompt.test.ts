import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexPrompt, injectCodexPrompt } from "./prompt.ts";

test("buildCodexPrompt appends the Pi-specific apply_patch override", () => {
  const prompt = buildCodexPrompt("Base Codex prompt");

  assert.match(prompt, /^Base Codex prompt\n\n## Pi harness apply_patch note/m);
  assert.match(prompt, /`apply_patch` is a structured tool with a single string parameter named `input`/);
  assert.match(prompt, /do not invoke `apply_patch` through `shell_command`/);
});

test("injectCodexPrompt appends once and is idempotent", () => {
  const codexPrompt = buildCodexPrompt("Base Codex prompt");
  const once = injectCodexPrompt("Existing system prompt", codexPrompt);
  const twice = injectCodexPrompt(once, codexPrompt);

  assert.match(once, /^Existing system prompt\n\nBase Codex prompt/m);
  assert.equal(twice, once);
});

test("injectCodexPrompt handles empty existing prompt", () => {
  const codexPrompt = buildCodexPrompt("Base Codex prompt");

  assert.equal(injectCodexPrompt(undefined, codexPrompt), codexPrompt);
  assert.equal(injectCodexPrompt("", codexPrompt), codexPrompt);
});
