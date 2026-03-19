import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentProfilePromptBlock,
  buildCodexPrompt,
  buildDefaultCollaborationModeInstructions,
  buildDefaultCollaborationModePrompt,
  injectCodexPrompt,
  readAgentProfilePromptPayload,
} from "./index.ts";

test("buildCodexPrompt appends the Pi-specific apply_patch override", () => {
  const prompt = buildCodexPrompt("Base Codex prompt");

  assert.match(prompt, /^Base Codex prompt\n\n## Pi harness apply_patch note/m);
  assert.match(
    prompt,
    /`apply_patch` is a structured tool with a single string parameter named `input`/,
  );
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

test("buildDefaultCollaborationModeInstructions populates Codex Default mode template variables", () => {
  const prompt = buildDefaultCollaborationModeInstructions();

  assert.match(prompt, /^# Collaboration Mode: Default/m);
  assert.match(prompt, /Known mode names are Default\./);
  assert.match(prompt, /The `request_user_input` tool is available in Default mode\./);
  assert.match(prompt, /prefer using the `request_user_input` tool/);
  assert.doesNotMatch(prompt, /\{\{KNOWN_MODE_NAMES\}\}/);
  assert.doesNotMatch(prompt, /\{\{REQUEST_USER_INPUT_AVAILABILITY\}\}/);
  assert.doesNotMatch(prompt, /\{\{ASKING_QUESTIONS_GUIDANCE\}\}/);
});

test("buildDefaultCollaborationModePrompt wraps Default mode instructions in collaboration tags", () => {
  const prompt = buildDefaultCollaborationModePrompt();

  assert.match(prompt, /^<collaboration_mode># Collaboration Mode: Default/m);
  assert.match(prompt, /<\/collaboration_mode>$/);
});

test("readAgentProfilePromptPayload returns parsed profile bootstrap data", () => {
  const payload = readAgentProfilePromptPayload({
    PI_CODEX_AGENT_PROFILE_JSON: JSON.stringify({
      name: "explorer",
      developerInstructions: "You are an explorer.",
    }),
  });

  assert.deepEqual(payload, {
    name: "explorer",
    developerInstructions: "You are an explorer.",
  });
});

test("buildAgentProfilePromptBlock returns developer instructions only when present", () => {
  assert.equal(
    buildAgentProfilePromptBlock({
      name: "explorer",
      developerInstructions: "You are an explorer.",
    }),
    "You are an explorer.",
  );
  assert.equal(buildAgentProfilePromptBlock({ name: "explorer" }), "");
  assert.equal(buildAgentProfilePromptBlock(undefined), "");
});
